import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { AuthProvider } from "../src/auth";
import { ensureNotificationsPermission, setupAndroidChannel, setupWebNotifications } from "../src/notifs";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === "web") {
      setupWebNotifications();
    } else {
      (async () => {
        await setupAndroidChannel();
        await ensureNotificationsPermission();
      })();
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "fade",
              contentStyle: { backgroundColor: "#050505" },
            }}
          />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
