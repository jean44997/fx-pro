import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, GhostButton } from "../src/ui";
import { Colors } from "../src/theme";
import { isFirebaseDirectMode, api } from "../src/auth";
import { subscribeFirebaseNotifications } from "../src/firebaseDirect";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInRight } from "react-native-reanimated";

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/notifications");
      setItems(r.items || []);
    } catch {}
  };

  useEffect(() => {
    if (isFirebaseDirectMode) {
      return subscribeFirebaseNotifications(setItems);
    }
    load();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markAll = async () => {
    await api.post("/notifications/read-all", {});
    await load();
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="notif-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Notifications</Text>
          <Pressable testID="mark-all-read" onPress={markAll} hitSlop={12}>
            <Ionicons name="checkmark-done" size={22} color={Colors.cyan} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}>
          {items.length === 0 ? (
            <Text style={{ color: Colors.textSoft, textAlign: "center", marginTop: 60 }}>Aucune notification</Text>
          ) : (
            items.map((n, i) => (
              <Animated.View key={n.notif_id} entering={FadeInRight.delay(i * 30)}>
                <GlassCard>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={[styles.dot, !n.read && { backgroundColor: Colors.cyan }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontWeight: "800" }}>{n.title}</Text>
                      <Text style={{ color: Colors.textSoft, marginTop: 4, fontSize: 13 }}>{n.body}</Text>
                      <Text style={{ color: Colors.textMuted, marginTop: 6, fontSize: 11 }}>
                        {new Date(n.created_at).toLocaleString("fr-FR")}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              </Animated.View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "transparent", marginTop: 6, borderWidth: 1, borderColor: Colors.border },
});
