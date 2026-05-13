import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { doc, getFirestore, setDoc } from "firebase/firestore";
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging";
import { firebaseConfig, firebaseWebPushVapidKey } from "./firebaseConfig";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
const API = `${BASE}/api`;
const TOKEN_KEY = "fxpro_web_fcm_token";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let foregroundListenerReady = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function isSecureWebContext() {
  if (!isBrowser()) return false;
  return (
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

function isIosWeb() {
  if (!isBrowser()) return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalonePwa() {
  if (!isBrowser()) return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function registerServiceWorker() {
  if (!isBrowser() || !("serviceWorker" in navigator)) return null;
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register("/firebase-messaging-sw.js", { scope: "/" })
      .catch(() => null);
  }
  return registrationPromise;
}

export async function registerWebRuntime(): Promise<boolean> {
  const registration = await registerServiceWorker();
  return Boolean(registration);
}

async function getMessagingInstance() {
  if (!isBrowser()) return null;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  return getMessaging(getFirebaseApp());
}

function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

async function sendTokenToBackend(fcmToken: string, authToken?: string | null) {
  if (!BASE) {
    const app = getFirebaseApp();
    const user = getAuth(app).currentUser;
    if (!user) return;
    await setDoc(
      doc(getFirestore(app), "fxpro_push_tokens", user.uid),
      { token: fcmToken, user_id: user.uid, updated_at: new Date().toISOString() },
      { merge: true }
    ).catch(() => undefined);
    return;
  }

  if (!authToken) return;
  await fetch(`${API}/notifications/push-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ token: fcmToken }),
  }).catch(() => undefined);
}

function notificationFromPayload(payload: MessagePayload) {
  const data = payload.data || {};
  return {
    title: payload.notification?.title || data.title || "FX Pro",
    body: payload.notification?.body || data.body || "Nouvelle notification",
    data,
  };
}

export async function setupWebPush(authToken?: string | null): Promise<boolean> {
  if (!isBrowser() || !isSecureWebContext() || !("Notification" in window)) return false;

  const registration = await registerServiceWorker();
  if (!registration) return false;

  if (isIosWeb() && !isStandalonePwa()) {
    return false;
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission().catch(() => "default");
  if (permission !== "granted") return false;

  const messaging = await getMessagingInstance();
  if (!messaging) return false;

  const fcmToken = await getToken(messaging, {
    vapidKey: firebaseWebPushVapidKey,
    serviceWorkerRegistration: registration,
  }).catch(() => null);

  if (!fcmToken) return false;
  window.localStorage.setItem(TOKEN_KEY, fcmToken);
  await sendTokenToBackend(fcmToken, authToken);

  if (!foregroundListenerReady) {
    onMessage(messaging, (payload) => {
      const notif = notificationFromPayload(payload);
      showWebNotification(notif.title, notif.body, notif.data).catch(() => undefined);
    });
    foregroundListenerReady = true;
  }

  return true;
}

export async function syncWebPushToken(authToken?: string | null): Promise<boolean> {
  if (!isBrowser()) return false;
  const cachedToken = window.localStorage.getItem(TOKEN_KEY);
  if (cachedToken) {
    await sendTokenToBackend(cachedToken, authToken);
    return true;
  }
  return false;
}

export async function showWebNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  if (!isBrowser() || !("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }

  const options: NotificationOptions = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: "/", ...(data || {}) },
    tag: data?.notif_id ? String(data.notif_id) : undefined,
  };

  const registration = await registerServiceWorker();
  if (registration?.showNotification) {
    await registration.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
  return true;
}
