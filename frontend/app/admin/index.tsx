import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { GradientBg, GlassCard, NeoCard, PrimaryButton, GhostButton } from "../../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../../src/theme";
import { useAuth, api } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/(tabs)/home");
  }, [user, router]);

  const load = useCallback(async () => {
    try {
      const s = await api.get("/admin/stats");
      setStats(s);
      const u = await api.get(`/admin/users?search=${encodeURIComponent(search)}`);
      setUsers(u.items || []);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refreshRates = async () => {
    try {
      await api.post("/rates/refresh", {});
      Alert.alert("OK", "Taux actualisés depuis l'API live");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const confirmDeposit = async (txnId: string) => {
    try {
      await api.post(`/admin/transactions/${txnId}/confirm-deposit`, {});
      Alert.alert("Depot confirme", "Solde credite et analyse bonus declenchee.");
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}>
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>FX PRO · ADMIN</Text>
              <Text style={styles.title}>Tableau de bord</Text>
            </View>
            <Pressable
              testID="admin-logout"
              onPress={async () => {
                await logout();
                router.replace("/(auth)/login");
              }}
              style={styles.iconBtn}
            >
              <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
            </Pressable>
          </View>

          {/* Stats grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 }}>
            <StatBox testID="stat-users" label="Utilisateurs" value={stats?.users ?? "—"} color={Colors.cyan} icon="people" />
            <StatBox testID="stat-txns" label="Transactions" value={stats?.transactions ?? "—"} color={Colors.magenta} icon="receipt" />
            <StatBox testID="stat-blocked" label="Bloqués" value={stats?.blocked ?? "—"} color={Colors.danger} icon="ban" />
            <StatBox testID="stat-live" label="Taux" value="Live" color={Colors.green} icon="pulse" />
          </View>

          {/* Quick actions */}
          <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginTop: 4 }}>
            <Pressable testID="admin-refresh-rates" onPress={refreshRates} style={[styles.qAction, { borderColor: Colors.green }]}>
              <Ionicons name="refresh" size={18} color={Colors.green} />
              <Text style={styles.qText}>Actualiser taux</Text>
            </Pressable>
            <Pressable testID="admin-rates-edit" onPress={() => router.push("/admin/rates")} style={[styles.qAction, { borderColor: Colors.yellow }]}>
              <Ionicons name="construct" size={18} color={Colors.yellow} />
              <Text style={styles.qText}>Modifier taux</Text>
            </Pressable>
          </View>

          {/* Users list */}
          <GlassCard testID="admin-users-card">
            <Text style={styles.sectionLabel}>Gestion des utilisateurs</Text>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={Colors.textSoft} />
              <TextInput
                testID="user-search"
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher email ou nom"
                placeholderTextColor={Colors.textMuted}
                style={styles.search}
              />
            </View>
            {users.map((u, i) => (
              <Animated.View key={u.user_id} entering={FadeInUp.delay(i * 30)}>
                <Pressable
                  testID={`admin-user-${u.email}`}
                  onPress={() => router.push({ pathname: "/admin/user", params: { id: u.user_id } })}
                  style={styles.userRow}
                >
                  <View style={[styles.avatar, u.is_blocked && { borderColor: Colors.danger }]}>
                    <Text style={{ color: u.is_blocked ? Colors.danger : Colors.cyan, fontWeight: "900" }}>
                      {(u.name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontWeight: "800" }} numberOfLines={1}>{u.name}</Text>
                    <Text style={{ color: Colors.textSoft, fontSize: 12 }} numberOfLines={1}>{u.email}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{formatMoney(u.balances?.EUR || 0, "EUR")}</Text>
                    {u.is_blocked && <Text style={{ color: Colors.danger, fontSize: 10, fontWeight: "900" }}>BLOQUÉ</Text>}
                    {u.role === "admin" && <Text style={{ color: Colors.yellow, fontSize: 10, fontWeight: "900" }}>ADMIN</Text>}
                  </View>
                </Pressable>
              </Animated.View>
            ))}
            {users.length === 0 && <Text style={{ color: Colors.textSoft, textAlign: "center", marginTop: 16 }}>Aucun utilisateur</Text>}
          </GlassCard>

          {/* Recent txns */}
          {stats?.recent_transactions?.length ? (
            <GlassCard>
              <Text style={styles.sectionLabel}>Activité récente</Text>
              {stats.recent_transactions.map((t: any) => (
                <View key={t.txn_id} style={styles.txnRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }} numberOfLines={1}>{t.type} - {t.txn_id.slice(-8)}</Text>
                    <Text style={{ color: Colors.textSoft, fontSize: 10, marginTop: 2 }}>{t.status || "completed"}</Text>
                  </View>
                  <Text style={{ color: Colors.cyan, fontSize: 12, fontWeight: "800" }}>{t.amount ? formatMoney(t.amount, t.currency || t.from_currency || "EUR") : ""}</Text>
                  {t.type === "deposit" && t.status === "pending" ? (
                    <Pressable testID={`confirm-deposit-${t.txn_id}`} onPress={() => confirmDeposit(t.txn_id)} style={styles.confirmBtn}>
                      <Ionicons name="checkmark" size={13} color="#000" />
                      <Text style={styles.confirmText}>Valider</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </GlassCard>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function StatBox({ label, value, color, icon, testID }: any) {
  return (
    <Animated.View entering={FadeInUp} style={{ width: "50%", padding: 8 }}>
      <NeoCard color={color} style={{ marginHorizontal: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name={icon} size={22} color={color} />
          <Text style={{ color: Colors.textSoft, fontSize: 11, letterSpacing: 1 }}>{label}</Text>
        </View>
        <Text testID={testID} style={{ color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 8 }}>{value}</Text>
      </NeoCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20 },
  brand: { color: Colors.cyan, fontSize: 12, fontWeight: "900", letterSpacing: 3 },
  title: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 4 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,59,92,0.08)", borderWidth: 1, borderColor: Colors.danger },
  qAction: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, backgroundColor: "rgba(255,255,255,0.04)" },
  qText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  sectionLabel: { color: Colors.cyan, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  search: { flex: 1, color: "#fff", fontSize: 14 },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: Colors.cyan, backgroundColor: "rgba(0,255,255,0.08)" },
  txnRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  confirmBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.green },
  confirmText: { color: "#000", fontWeight: "900", fontSize: 10 },
});
