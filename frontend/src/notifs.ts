// Local push notification helper
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { registerFirebasePushToken } from "./firebaseDirect";
import { setupWebPush, showWebNotification } from "./webPush";

const shownNotificationIds = new Map<string, number>();
const LOCAL_NOTIFICATION_MARKER = "__fxpro_local_notification";

function shouldDisplayNotification(id?: unknown) {
  if (typeof id !== "string" || !id) return true;
  const lastShown = shownNotificationIds.get(id) || 0;
  if (Date.now() - lastShown < 15000) return false;
  shownNotificationIds.set(id, Date.now());
  return true;
}

export async function setNotificationBadgeCount(count: number) {
  const value = Math.max(0, Math.floor(count));
  if (Platform.OS === "web") {
    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (value > 0 && nav.setAppBadge) await nav.setAppBadge(value);
      if (value === 0 && nav.clearAppBadge) await nav.clearAppBadge();
    } catch {}
    return;
  }
  try {
    await Notifications.setBadgeCountAsync(value);
  } catch {}
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data || {};
    const isLocalNotification = data[LOCAL_NOTIFICATION_MARKER] === "1";
    const shouldShow = isLocalNotification || shouldDisplayNotification(data.notif_id);
    return {
      shouldShowAlert: shouldShow,
      shouldPlaySound: shouldShow,
      shouldSetBadge: true,
      shouldShowBanner: shouldShow,
      shouldShowList: shouldShow,
    };
  },
});

export async function ensureNotificationsPermission(): Promise<boolean> {
  if (Platform.OS === "web") return setupWebPush();
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") {
    await registerNativePushToken();
    return true;
  }
  const { status: ask } = await Notifications.requestPermissionsAsync();
  if (ask === "granted") await registerNativePushToken();
  return ask === "granted";
}

async function registerNativePushToken() {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await registerFirebasePushToken(token.data, "expo");
  } catch {}
}

export async function setupAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "FX Pro",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#00FFFF",
    sound: "default",
  });
}

export async function notify(title: string, body: string, data?: any) {
  if (!shouldDisplayNotification(data?.notif_id)) return;
  if (Platform.OS === "web") {
    await showWebNotification(title, body, data);
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { ...(data || {}), [LOCAL_NOTIFICATION_MARKER]: "1" },
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  } catch {}
}
