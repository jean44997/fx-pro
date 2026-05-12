import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { firebaseConfig, firebaseVapidKey } from "./firebaseConfig";

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDb = getFirestore(firebaseApp);

export async function getFirebaseWebPushToken(serviceWorkerRegistration?: ServiceWorkerRegistration | null): Promise<string | null> {
  if (!firebaseVapidKey || typeof window === "undefined") return null;
  if (!("Notification" in window) || Notification.permission !== "granted") return null;

  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  return getToken(getMessaging(firebaseApp), {
    vapidKey: firebaseVapidKey,
    serviceWorkerRegistration: serviceWorkerRegistration || undefined,
  }).catch(() => null);
}
