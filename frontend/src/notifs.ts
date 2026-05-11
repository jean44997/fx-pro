// Local push notification helper
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationsPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const { status: ask } = await Notifications.requestPermissionsAsync();
  return ask === "granted";
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
  if (Platform.OS === "web") return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  } catch {}
}
