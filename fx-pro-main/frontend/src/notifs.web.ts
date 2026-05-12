import { getFirebaseWebPushToken } from "./firebase";
import {
  ensureWebNotificationPermission,
  getWebNotificationPermission,
  registerPwaServiceWorker,
  showWebNotification,
} from "./webPush";

export async function ensureNotificationsPermission(): Promise<boolean> {
  return ensureWebNotificationPermission();
}

export async function setupWebNotifications() {
  await registerPwaServiceWorker();
}

export async function setupAndroidChannel() {}

export async function getDevicePushToken(options: { requestPermission?: boolean } = {}): Promise<string | null> {
  const registration = await registerPwaServiceWorker();
  let permission = getWebNotificationPermission();

  if (permission !== "granted") {
    if (!options.requestPermission) return null;
    const ok = await ensureWebNotificationPermission();
    if (!ok) return null;
    permission = "granted";
  }

  if (permission !== "granted") return null;
  return getFirebaseWebPushToken(registration);
}

export async function notify(title: string, body: string, data?: any) {
  await showWebNotification(title, body, data);
}
