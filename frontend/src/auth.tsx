// API client + Auth context
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncWebPushToken } from "./webPush";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
const API = `${BASE}/api`;
const REQUEST_TIMEOUT_MS = 15000;

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
      !BASE && typeof body === "string" && (body.includes("<!DOCTYPE") || body.includes("<html"));
    const msg =
      (body && (body.detail || body.message)) ||
      (looksLikeStaticHost
        ? "Backend web non configuré. Ajoute EXPO_PUBLIC_BACKEND_URL dans Vercel avec l'URL HTTPS de ton backend."
        : `Erreur serveur ${res.status}`);
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

  const refresh = useCallback(async () => {
    const token = await loadToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const u = await api.get("/auth/me");
      setUser(u);
      syncWebPushToken(token).catch(() => undefined);
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

  const login = async (email: string, password: string) => {
    const r = await api.post("/auth/login", { email, password });
    await setToken(r.token);
    setUser(r.user);
    syncWebPushToken(r.token).catch(() => undefined);
  };
  const register = async (email: string, password: string, name: string, phone?: string) => {
    const r = await api.post("/auth/register", { email, password, name, phone });
    await setToken(r.token);
    setUser(r.user);
    syncWebPushToken(r.token).catch(() => undefined);
  };
  const loginGoogle = async (sessionId: string) => {
    const r = await api.post("/auth/google/session", { session_id: sessionId });
    await setToken(r.token);
    setUser(r.user);
    syncWebPushToken(r.token).catch(() => undefined);
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
