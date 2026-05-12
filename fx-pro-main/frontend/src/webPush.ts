const APP_NAME = "FX Pro 2026";
const APP_ICON = "/icons/app-icon-192.png";
const BADGE_ICON = "/icons/notification-icon-96.png";

function notificationApi() {
  return (globalThis as any).Notification;
}

export function getWebNotificationPermission(): "granted" | "denied" | "default" | "unsupported" {
  const NotificationApi = notificationApi();
  if (!NotificationApi) return "unsupported";
  return NotificationApi.permission || "default";
}

export async function registerPwaServiceWorker(): Promise<any | null> {
  const nav = (globalThis as any).navigator;
  const loc = (globalThis as any).location;
  if (!nav?.serviceWorker || !loc || loc.protocol === "file:") return null;

  try {
    const current = await nav.serviceWorker.getRegistration("/");
    return current || (await nav.serviceWorker.register("/service-worker.js", { scope: "/" }));
  } catch {
    return null;
  }
}

export async function ensureWebNotificationPermission(): Promise<boolean> {
  const NotificationApi = notificationApi();
  if (!NotificationApi) return false;
  if (NotificationApi.permission === "granted") return true;
  if (NotificationApi.permission === "denied") return false;

  const permission = await NotificationApi.requestPermission();
  return permission === "granted";
}

export async function showWebNotification(title: string, body: string, data?: any): Promise<boolean> {
  const NotificationApi = notificationApi();
  if (!NotificationApi || NotificationApi.permission !== "granted") return false;

  const options = {
    body,
    icon: APP_ICON,
    badge: BADGE_ICON,
    tag: data?.notif_id || data?.txn_id || title || APP_NAME,
    renotify: true,
    data: data || {},
  };

  const registration = await registerPwaServiceWorker();
  if (registration?.showNotification) {
    await registration.showNotification(title || APP_NAME, options);
    return true;
  }

  new NotificationApi(title || APP_NAME, options);
  return true;
}
