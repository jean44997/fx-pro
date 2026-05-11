import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, GhostButton } from "../../src/ui";
import { Colors } from "../../src/theme";
import { useAuth } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const confirmLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnexion",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const items: { icon: any; label: string; route?: any; color?: string; testID: string; onPress?: () => void }[] = [
    { icon: "qr-code", label: "Mon QR Code", route: "/receive-qr", testID: "menu-qr" },
    { icon: "notifications", label: "Notifications", route: "/notifications", testID: "menu-notif" },
    { icon: "alert-circle", label: "Alertes de taux", route: "/rate-alerts", testID: "menu-alerts" },
    { icon: "settings", label: "Paramètres", route: "/settings", testID: "menu-settings" },
    { icon: "shield-checkmark", label: "Statut KYC", route: "/kyc", testID: "menu-kyc" },
    { icon: "help-circle", label: "Aide & FAQ", testID: "menu-help", onPress: () => Alert.alert("Aide", "Support: support@fxpro.com") },
  ];

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          <Animated.View entering={FadeInUp.duration(500)} style={{ alignItems: "center", padding: 24 }}>
            <View style={styles.avatar}>
              <Text style={{ color: Colors.cyan, fontSize: 36, fontWeight: "900" }}>
                {(user?.name || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text testID="profile-name" style={{ color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 14 }}>{user?.name}</Text>
            <Text style={{ color: Colors.textSoft, marginTop: 4 }}>{user?.email}</Text>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={12} color={user?.kyc_status === "verified" ? Colors.green : Colors.yellow} />
              <Text style={[styles.badgeText, { color: user?.kyc_status === "verified" ? Colors.green : Colors.yellow }]}>
                KYC {user?.kyc_status === "verified" ? "vérifié" : "en attente"}
              </Text>
            </View>
          </Animated.View>

          {items.map((it, i) => (
            <Animated.View key={it.label} entering={FadeInUp.delay(i * 50)}>
              <Pressable testID={it.testID} onPress={() => (it.onPress ? it.onPress() : router.push(it.route))}>
                <GlassCard>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <View style={styles.iconBox}>
                      <Ionicons name={it.icon} size={20} color={Colors.cyan} />
                    </View>
                    <Text style={{ color: "#fff", flex: 1, fontWeight: "700", fontSize: 15 }}>{it.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color={Colors.textSoft} />
                  </View>
                </GlassCard>
              </Pressable>
            </Animated.View>
          ))}

          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <GhostButton testID="logout-btn" title="Se déconnecter" icon={<Ionicons name="log-out-outline" size={16} color={Colors.danger} />} onPress={confirmLogout} />
            <Text style={{ color: Colors.textMuted, textAlign: "center", marginTop: 18, fontSize: 11 }}>FX Pro 2026 · v1.0.0</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,255,255,0.08)",
    borderWidth: 2,
    borderColor: Colors.cyan,
    shadowColor: Colors.cyan,
    shadowOpacity: 0.6,
    shadowRadius: 18,
  },
  badge: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.border },
  badgeText: { fontSize: 11, fontWeight: "800" },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,255,255,0.08)", borderWidth: 1, borderColor: Colors.border },
});
