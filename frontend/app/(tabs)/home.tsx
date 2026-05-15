import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, NeoCard, PrimaryButton } from "../../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../../src/theme";
import { isFirebaseDirectMode, useAuth, api } from "../../src/auth";
import { subscribeFirebaseNotifications } from "../../src/firebaseDirect";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInRight, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Circle } from "react-native-svg";

const W = Dimensions.get("window").width;

export default function Home() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [rates, setRates] = useState<Record<string, number>>({});
  const [updated, setUpdated] = useState<string>("");
  const [history, setHistory] = useState<{ t: string; v: number }[]>([]);
  const [pair, setPair] = useState("EUR_XOF");
  const [refreshing, setRefreshing] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/rates");
      setRates(r.rates);
      setUpdated(r.updated_at);
      const h = await api.get(`/rates/history?pair=${pair}`);
      setHistory(h.points);
      const n = await api.get("/notifications");
      setNotifCount((n.items || []).filter((x: any) => !x.read).length);
    } catch {}
  }, [pair]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  // Watch for new server notifications → trigger real local push
  useEffect(() => {
    if (isFirebaseDirectMode) {
      return subscribeFirebaseNotifications((items) => {
        setNotifCount((items || []).filter((x: any) => !x.read).length);
      });
    }

    const tick = async () => {
      try {
        const n = await api.get("/notifications");
        setNotifCount((n.items || []).filter((x: any) => !x.read).length);
      } catch {}
    };
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  const totalEur = React.useMemo(() => {
    if (!user || !rates || !rates.EUR) return 0;
    let sum = 0;
    Object.entries(user.balances || {}).forEach(([c, amt]) => {
      const rate = rates[c];
      if (!rate) return;
      sum += (amt as number) / rate; // EUR base => amount_in_eur = amount / rate(c)
    });
    return sum;
  }, [user, rates]);

  const points = history.slice(-30);
  const chartW = W - 64;
  const chartH = 110;
  const path = React.useMemo(() => {
    if (!points.length) return "";
    const vals = points.map((p) => p.v);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    return points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * chartW;
        const y = chartH - ((p.v - min) / range) * chartH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points, chartW, chartH]);

  const lastVal = points.length ? points[points.length - 1].v : 0;
  const firstVal = points.length ? points[0].v : 0;
  const trend = lastVal - firstVal;
  const trendPct = firstVal ? (trend / firstVal) * 100 : 0;

  const favoritePairs = (user?.favorite_pairs as [string, string][]) || [["EUR", "XOF"], ["EUR", "USD"]];

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
        >
          {/* Header */}
          <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
            <View>
              <Text style={styles.hello}>Bonjour 👋</Text>
              <Text style={styles.name}>{user?.name || "Utilisateur"}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable testID="open-notifications" onPress={() => router.push("/notifications")} style={styles.iconBtn}>
                <Ionicons name="notifications-outline" size={22} color="#fff" />
                {notifCount > 0 && (
                  <View style={styles.dot}>
                    <Text style={styles.dotText}>{notifCount}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable testID="open-settings" onPress={() => router.push("/settings")} style={styles.iconBtn}>
                <Ionicons name="settings-outline" size={22} color="#fff" />
              </Pressable>
            </View>
          </Animated.View>

          {/* Balance card */}
          <Animated.View entering={FadeInUp.duration(500).delay(100)}>
            <NeoCard color={Colors.cyan}>
              <Text style={styles.totalLabel}>SOLDE TOTAL ESTIMÉ</Text>
              <Text testID="total-balance" style={styles.totalValue}>{formatMoney(totalEur, "EUR")}</Text>
              <View style={styles.quickGrid}>
                <Pressable testID="quick-convert" onPress={() => router.push("/convert")} style={styles.quickBtn}>
                  <Ionicons name="swap-horizontal" size={18} color={Colors.cyan} />
                  <Text style={styles.quickText}>Convertir</Text>
                </Pressable>
                <Pressable testID="quick-deposit" onPress={() => router.push("/deposit")} style={styles.quickBtn}>
                  <Ionicons name="add-circle" size={18} color={Colors.green} />
                  <Text style={styles.quickText}>Depot</Text>
                </Pressable>
                <Pressable testID="quick-withdraw" onPress={() => router.push("/withdraw")} style={styles.quickBtn}>
                  <Ionicons name="cash-outline" size={18} color={Colors.yellow} />
                  <Text style={styles.quickText}>Retrait</Text>
                </Pressable>
                <Pressable testID="quick-transfer" onPress={() => router.push("/(tabs)/transfer")} style={styles.quickBtn}>
                  <Ionicons name="paper-plane" size={18} color={Colors.magenta} />
                  <Text style={styles.quickText}>Envoyer</Text>
                </Pressable>
                <Pressable testID="quick-receive" onPress={() => router.push("/receive-qr")} style={styles.quickBtn}>
                  <Ionicons name="qr-code" size={18} color={Colors.green} />
                  <Text style={styles.quickText}>Recevoir</Text>
                </Pressable>
                <Pressable testID="quick-bonus" onPress={() => router.push("/bonus")} style={styles.quickBtn}>
                  <Ionicons name="gift" size={18} color={Colors.yellow} />
                  <Text style={styles.quickText}>Bonus</Text>
                </Pressable>
              </View>
            </NeoCard>
          </Animated.View>

          {/* Chart */}
          <GlassCard testID="rate-chart-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={styles.sectionTitle}>Taux 30 jours</Text>
                <Text style={styles.sectionSub}>{pair.replace("_", " / ")}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.bigVal}>{lastVal.toFixed(pair.endsWith("_XOF") || pair.endsWith("_XAF") || pair.endsWith("_JPY") ? 2 : 4)}</Text>
                <Text style={{ color: trend >= 0 ? Colors.green : Colors.danger, fontSize: 12, fontWeight: "700" }}>
                  {trend >= 0 ? "▲" : "▼"} {trendPct.toFixed(2)}%
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              {points.length > 1 && (
                <Svg width={chartW} height={chartH}>
                  <Defs>
                    <SvgGrad id="grad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={Colors.cyan} stopOpacity="1" />
                      <Stop offset="1" stopColor={Colors.magenta} stopOpacity="1" />
                    </SvgGrad>
                  </Defs>
                  <Path d={path} stroke="url(#grad)" strokeWidth={2.5} fill="none" />
                  {points.length > 0 && (
                    <Circle
                      cx={chartW}
                      cy={(() => {
                        const vals = points.map((p) => p.v);
                        const min = Math.min(...vals);
                        const max = Math.max(...vals);
                        const range = max - min || 1;
                        return chartH - ((lastVal - min) / range) * chartH;
                      })()}
                      r={4}
                      fill={Colors.cyan}
                    />
                  )}
                </Svg>
              )}
            </View>
            {/* Pair switcher */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {favoritePairs.map(([f, t]) => {
                const p = `${f}_${t}`;
                const active = p === pair;
                return (
                  <Pressable key={p} testID={`pair-${p}`} onPress={() => setPair(p)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && { color: "#000", fontWeight: "900" }]}>{f}/{t}</Text>
                  </Pressable>
                );
              })}
              <Pressable testID="manage-pairs" onPress={() => router.push("/rate-alerts")} style={[styles.chip, { borderStyle: "dashed" }]}>
                <Ionicons name="add" size={14} color={Colors.textSoft} />
                <Text style={styles.chipText}>Gérer</Text>
              </Pressable>
            </ScrollView>
          </GlassCard>

          {/* Live rates list */}
          <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
            <Text style={styles.sectionLabel}>Taux en direct · 1 EUR =</Text>
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
            {CURRENCIES.filter((c) => c.code !== "EUR").map((c, i) => {
              const v = rates[c.code];
              return (
                <Animated.View key={c.code} entering={FadeInRight.delay(i * 30)} style={styles.rateRow} testID={`rate-${c.code}`}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Text style={{ fontSize: 22 }}>{c.flag}</Text>
                    <View>
                      <Text style={{ color: "#fff", fontWeight: "800" }}>{c.code}</Text>
                      <Text style={{ color: Colors.textSoft, fontSize: 11 }}>{c.name}</Text>
                    </View>
                  </View>
                  <Text style={{ color: Colors.cyan, fontFamily: "monospace", fontWeight: "800" }}>
                    {v ? v.toLocaleString("fr-FR", { maximumFractionDigits: 4 }) : "—"}
                  </Text>
                </Animated.View>
              );
            })}
          </View>

          {updated ? (
            <Text style={styles.updated}>
              Mis à jour {new Date(updated).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </Text>
          ) : null}

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <PrimaryButton testID="goto-convert" title="Convertir maintenant" icon={<Ionicons name="swap-horizontal" size={18} color="#000" />} onPress={() => router.push("/convert")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 16 },
  hello: { color: Colors.textSoft, fontSize: 13 },
  name: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 2 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.border },
  dot: { position: "absolute", top: 4, right: 4, backgroundColor: Colors.magenta, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  dotText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  totalLabel: { color: Colors.textSoft, fontSize: 11, letterSpacing: 2 },
  totalValue: { color: "#fff", fontSize: 36, fontWeight: "900", marginTop: 6, letterSpacing: -1 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 18, gap: 10 },
  quickBtn: {
    flexBasis: "30%",
    flexGrow: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  sectionSub: { color: Colors.textSoft, fontSize: 12, marginTop: 2 },
  sectionLabel: { color: Colors.textSoft, fontSize: 12, letterSpacing: 2, marginTop: 12, marginBottom: 4, textTransform: "uppercase" },
  bigVal: { color: "#fff", fontSize: 22, fontWeight: "900", fontFamily: "monospace" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, marginRight: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  chipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.6, shadowRadius: 12 },
  chipText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  updated: { color: Colors.textMuted, fontSize: 11, textAlign: "center", marginTop: 12 },
});
