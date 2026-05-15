// API client + Auth context
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { firebaseDirectRequest, subscribeFirebaseNotifications } from "./firebaseDirect";
import { syncWebPushToken } from "./webPush";
import { ensureNotificationsPermission, notify, setNotificationBadgeCount } from "./notifs";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
const API = `${BASE}/api`;
const REQUEST_TIMEOUT_MS = 15000;
const WRONG_BACKEND_MESSAGE =
  "L'URL backend pointe vers un site statique, pas vers l'API FastAPI. EXPO_PUBLIC_BACKEND_URL doit etre l'URL HTTPS du backend, sans /api.";

export const isFirebaseDirectMode = !BASE;

export type User = {
  user_id: string;
  email: string;
  name: string;
  phone?: string;
  role: "user" | "admin";
  balances: Record<string, number>;
  is_blocked?: boolean;
  kyc_status?: string;
  picture?: string | null;
  auth_provider?: string;
  favorite_pairs?: [string, string][];
  bonus_country?: string;
  kyc_level?: string;
  trust_score?: number;
  login_count?: number;
};

let _token: string | null = null;

export async function loadToken() {
  if (_token) return _token;
  const t = await AsyncStorage.getItem("fxpro_token");
  _token = t;
  return t;
}
export async function setToken(t: string | null) {
  _token = t;
  if (t) await AsyncStorage.setItem("fxpro_token", t);
  else await AsyncStorage.removeItem("fxpro_token");
}

async function request(path: string, opts: RequestInit = {}) {
  if (!BASE) {
    return firebaseDirectRequest(path, opts);
  }

  const token = await loadToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as any),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...opts, headers, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Le serveur ne répond pas. Vérifie l'URL HTTPS du backend.");
    }
    throw new Error("Connexion au serveur impossible. Vérifie EXPO_PUBLIC_BACKEND_URL.");
  } finally {
    clearTimeout(timer);
  }

  const ct = res.headers.get("content-type") || "";
  let body: any = null;
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const looksLikeStaticHost =
      typeof body === "string" && (body.includes("<!DOCTYPE") || body.includes("<html"));
    if (looksLikeStaticHost || res.status === 405) {
      throw new Error(WRONG_BACKEND_MESSAGE);
    }
    const msg =
      (body && (body.detail || body.message)) ||
      `Erreur serveur ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

export const api = {
  get: (p: string) => request(p),
  post: (p: string, body?: any) => request(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: (p: string, body?: any) => request(p, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  patch: (p: string, body?: any) => request(p, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: (p: string) => request(p, { method: "DELETE" }),
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, phone?: string) => Promise<void>;
  loginGoogle: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthCtx = createContext<Ctx>({} as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastNotificationIds = React.useRef<Set<string>>(new Set());
  const notificationWatcherReady = React.useRef(false);

  const handleRealtimeNotifications = useCallback((items: any[]) => {
    const list = items || [];
    const unread = list.filter((item) => !item.read).length;
    setNotificationBadgeCount(AppState.currentState === "active" ? 0 : unread).catch(() => undefined);

    const ids = new Set<string>(list.map((item) => item.notif_id as string).filter(Boolean));
    if (!notificationWatcherReady.current) {
      lastNotificationIds.current = ids;
      notificationWatcherReady.current = true;
      const latestUnread = list.find((item) => !item.read && item.transfer_role === "receiver");
      if (latestUnread) {
        notify(latestUnread.title, latestUnread.body, {
          notif_id: latestUnread.notif_id,
          txn_id: latestUnread.txn_id,
          type: latestUnread.type,
        }).catch(() => undefined);
      }
      return;
    }

    for (const item of list) {
      if (!item.read && item.notif_id && !lastNotificationIds.current.has(item.notif_id)) {
        notify(item.title, item.body, {
          notif_id: item.notif_id,
          txn_id: item.txn_id,
          type: item.type,
        }).catch(() => undefined);
      }
    }
    lastNotificationIds.current = ids;
  }, []);

  const refresh = useCallback(async () => {
    const token = await loadToken();
    if (!token && !isFirebaseDirectMode) {
      setUser(null);
      return;
    }
    try {
      const u = await api.get("/auth/me");
      setUser(u);
      syncWebPushToken(token).catch(() => undefined);
      ensureNotificationsPermission().catch(() => undefined);
    } catch {
      await setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    lastNotificationIds.current = new Set();
    notificationWatcherReady.current = false;
    if (!user) {
      setNotificationBadgeCount(0).catch(() => undefined);
      return;
    }

    if (isFirebaseDirectMode) {
      return subscribeFirebaseNotifications(handleRealtimeNotifications);
    }

    let stopped = false;
    const tick = async () => {
      try {
        const r = await api.get("/notifications");
        if (!stopped) handleRealtimeNotifications(r.items || []);
      } catch {}
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [user, handleRealtimeNotifications]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setNotificationBadgeCount(0).catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.post("/auth/login", { email, password });
    await setToken(r.token);
    setUser(r.user);
    syncWebPushToken(r.token).catch(() => undefined);
    ensureNotificationsPermission().catch(() => undefined);
  };
  const register = async (email: string, password: string, name: string, phone?: string) => {
    const r = await api.post("/auth/register", { email, password, name, phone });
    await setToken(r.token);
    setUser(r.user);
    syncWebPushToken(r.token).catch(() => undefined);
    ensureNotificationsPermission().catch(() => undefined);
  };
  const loginGoogle = async (sessionId: string) => {
    const r = await api.post("/auth/google/session", { session_id: sessionId });
    await setToken(r.token);
    setUser(r.user);
    syncWebPushToken(r.token).catch(() => undefined);
    ensureNotificationsPermission().catch(() => undefined);
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    await setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, loginGoogle, logout, refresh, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
