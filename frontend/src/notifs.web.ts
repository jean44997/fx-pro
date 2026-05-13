import { setupWebPush, showWebNotification } from "./webPush";

const shownNotificationIds = new Map<string, number>();

function shouldDisplayNotification(id?: unknown) {
  if (typeof id !== "string" || !id) return true;
  const lastShown = shownNotificationIds.get(id) || 0;
  if (Date.now() - lastShown < 15000) return false;
  shownNotificationIds.set(id, Date.now());
  return true;
}

export async function ensureNotificationsPermission(): Promise<boolean> {
  return setupWebPush();
}

export async function setupAndroidChannel() {
  return;
}

export async function setNotificationBadgeCount(count: number) {
  const value = Math.max(0, Math.floor(count));
  const nav = navigator as Navigator & {
    setAppBadge?: (contents?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (value > 0 && nav.setAppBadge) await nav.setAppBadge(value);
    if (value === 0 && nav.clearAppBadge) await nav.clearAppBadge();
  } catch {}
}

export async function notify(title: string, body: string, data?: any) {
  if (!shouldDisplayNotification(data?.notif_id)) return;
  await showWebNotification(title, body, data);
}
