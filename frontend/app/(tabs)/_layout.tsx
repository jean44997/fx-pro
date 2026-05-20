import React from "react";
import { Tabs, useRouter } from "expo-router";
import { View, StyleSheet, Pressable, Text, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../src/theme";
import { useAuth } from "../../src/auth";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";

function TabBarBtn({ onPress, focused, icon, label, testID }: any) {
  const s = useSharedValue(focused ? 1.1 : 1);
  useEffect(() => {
    s.value = withSpring(focused ? 1.15 : 1, { damping: 12 });
  }, [focused, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={styles.tabBtn}
    >
      <Animated.View style={[styles.tabInner, focused && styles.tabInnerActive, st]}>
        <Ionicons name={icon} size={22} color={focused ? Colors.cyan : Colors.textSoft} />
      </Animated.View>
      <Text style={[styles.tabLabel, focused && { color: Colors.cyan, fontWeight: "800" }]}>{label}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/(auth)/login");
  }, [user, loading, router]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
      tabBar={(props) => (
        <View style={styles.tabBarWrap}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)", borderTopWidth: 1, borderTopColor: Colors.border }]} />
          <View style={styles.tabRow}>
            {props.state.routes.map((route, idx) => {
              const focused = props.state.index === idx;
              const opts = props.descriptors[route.key].options;
              const icon = (opts as any).tabBarIcon || "ellipse";
              const label = (opts as any).title || route.name;
              return (
                <TabBarBtn
                  key={route.key}
                  testID={`tab-${route.name}`}
                  focused={focused}
                  icon={icon}
                  label={label}
                  onPress={() => props.navigation.navigate(route.name as never)}
                />
              );
            })}
          </View>
        </View>
      )}
    >
      <Tabs.Screen name="home" options={{ title: "Accueil", tabBarIcon: "home" as any }} />
      <Tabs.Screen name="wallet" options={{ title: "Portefeuille", tabBarIcon: "wallet" as any }} />
      <Tabs.Screen name="transfer" options={{ title: "Envoyer", tabBarIcon: "paper-plane" as any }} />
      <Tabs.Screen name="history" options={{ title: "Historique", tabBarIcon: "time" as any }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: "person" as any }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: Platform.OS === "ios" ? 24 : 14,
    height: 76,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6 },
  tabInner: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  tabInnerActive: {
    backgroundColor: "rgba(0,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,255,255,0.4)",
    shadowColor: Colors.cyan,
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  tabLabel: { color: Colors.textSoft, fontSize: 10, letterSpacing: 0.5 },
});
