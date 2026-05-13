import { setupWebPush, showWebNotification } from "./webPush";

export async function ensureNotificationsPermission(): Promise<boolean> {
  return setupWebPush();
}

export async function setupAndroidChannel() {
  return;
}

export async function notify(title: string, body: string, data?: any) {
  await showWebNotification(title, body, data);
}
