import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInRight, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Line, Circle } from "react-native-svg";
import { GradientBg, GlassCard, NeoCard, PrimaryButton } from "../../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../../src/theme";
import { isFirebaseDirectMode, useAuth, api } from "../../src/auth";
import { subscribeFirebaseNotifications } from "../../src/firebaseDirect";

type RatePoint = { t: string; v: number };

const DEFAULT_RATE_PAIRS: [string, string][] = [
  ["EUR", "USD"],
  ["EUR", "GBP"],
  ["EUR", "NGN"],
  ["EUR", "XOF"],
  ["EUR", "XAF"],
];

export default function Home() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, refresh } = useAuth();
  const [rates, setRates] = useState<Record<string, number>>({});
  const [updated, setUpdated] = useState<string>("");
  const [rateSource, setRateSource] = useState<string>("");
  const [historySource, setHistorySource] = useState<string>("");
  const [history, setHistory] = useState<RatePoint[]>([]);
  const [pair, setPair] = useState("EUR_USD");
  const [rateError, setRateError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const load = useCallback(async () => {
    let nextRates: Record<string, number> = {};
    try {
      const r = await api.get("/rates");
      nextRates = sanitizeRates(r.rates || {});
      setRates(nextRates);
      setUpdated(r.updated_at || "");
      setRateSource(r.provider || r.source || "");
      setRateError("");
    } catch (e: any) {
      setRateError(e?.message || "Taux live indisponibles");
    }

    try {
      const h = await api.get(`/rates/history?pair=${encodeURIComponent(pair)}`);
      const points = sanitizeHistory(h.points || []);
      const liveRate = getPairRate(nextRates, pair);
      setHistory(points.length >= 2 ? points : buildFlatHistory(pair, liveRate));
      setHistorySource(h.source || (points.length >= 2 ? "live" : "latest-live"));
    } catch {
      setHistory(buildFlatHistory(pair, getPairRate(nextRates, pair)));
      setHistorySource("latest-live");
    }

    try {
      const n = await api.get("/notifications");
      setNotifCount((n.items || []).filter((x: any) => !x.read).length);
    } catch {}
  }, [pair]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

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

  const totalEur = useMemo(() => {
    if (!user || !rates.EUR) return 0;
    let sum = 0;
    Object.entries(user.balances || {}).forEach(([c, amt]) => {
      const rate = rates[c];
      if (!rate) return;
      sum += (amt as number) / rate;
    });
    return sum;
  }, [user, rates]);

  const favoritePairs = useMemo(() => buildPairOptions(user?.favorite_pairs), [user?.favorite_pairs]);
  const livePairRate = getPairRate(rates, pair);
  const chartPoints = useMemo(() => {
    const clean = sanitizeHistory(history);
    if (clean.length >= 2) return clean.slice(-30);
    return buildFlatHistory(pair, livePairRate).slice(-30);
  }, [history, livePairRate, pair]);

  const chartW = Math.max(220, Math.min(width - 64, 680));
  const chartH = width < 380 ? 124 : 136;
  const chart = useMemo(() => buildChartShape(chartPoints, chartW, chartH), [chartPoints, chartW, chartH]);
  const lastVal = chartPoints.length ? chartPoints[chartPoints.length - 1].v : livePairRate;
  const firstVal = chartPoints.length ? chartPoints[0].v : livePairRate;
  const trend = lastVal - firstVal;
  const trendPct = firstVal ? (trend / firstVal) * 100 : 0;
  const [fromCurrency, toCurrency] = pair.split("_");

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
        >
          <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.hello}>Bonjour</Text>
              <Text style={styles.name} numberOfLines={1}>{user?.name || "Utilisateur"}</Text>
            </View>
            <View style={styles.headerActions}>
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

          <Animated.View entering={FadeInUp.duration(500).delay(100)}>
            <NeoCard color={Colors.cyan}>
              <Text style={styles.totalLabel}>SOLDE TOTAL ESTIME</Text>
              <Text testID="total-balance" style={styles.totalValue} adjustsFontSizeToFit numberOfLines={1}>{formatMoney(totalEur, "EUR")}</Text>
              <View style={styles.quickGrid}>
                <QuickAction testID="quick-convert" icon="swap-horizontal" color={Colors.cyan} label="Convertir" onPress={() => router.push("/convert")} />
                <QuickAction testID="quick-deposit" icon="add-circle" color={Colors.green} label="Depot" onPress={() => router.push("/deposit")} />
                <QuickAction testID="quick-withdraw" icon="cash-outline" color={Colors.yellow} label="Retrait" onPress={() => router.push("/withdraw")} />
                <QuickAction testID="quick-transfer" icon="paper-plane" color={Colors.magenta} label="Envoyer" onPress={() => router.push("/(tabs)/transfer")} />
                <QuickAction testID="quick-receive" icon="qr-code" color={Colors.green} label="Recevoir" onPress={() => router.push("/receive-qr")} />
                <QuickAction testID="quick-bonus" icon="gift" color={Colors.yellow} label="Bonus" onPress={() => router.push("/bonus")} />
                <QuickAction testID="quick-gift-cards" icon="card" color={Colors.green} label="Gift cards" onPress={() => router.push("/gift-cards" as any)} />
                <QuickAction testID="quick-movies" icon="film" color={Colors.orange} label="Films" onPress={() => router.push("/movies")} />
              </View>
            </NeoCard>
          </Animated.View>

          <GlassCard testID="rate-chart-card">
            <View style={styles.chartHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionTitle}>Taux reels 30 jours</Text>
                <Text style={styles.sectionSub}>{fromCurrency} / {toCurrency}</Text>
              </View>
              <View style={styles.chartValueBlock}>
                <Text style={styles.bigVal} adjustsFontSizeToFit numberOfLines={1}>
                  {lastVal ? lastVal.toLocaleString("fr-FR", { maximumFractionDigits: rateDecimals(toCurrency) }) : "--"}
                </Text>
                <Text style={[styles.trendText, { color: trend >= 0 ? Colors.green : Colors.danger }]}>
                  {trend >= 0 ? "+" : "-"} {Math.abs(trendPct).toFixed(2)}%
                </Text>
              </View>
            </View>

            <View style={styles.chartCanvas}>
              {chartPoints.length >= 2 && chart.path ? (
                <Svg width={chartW} height={chartH}>
                  {[0.2, 0.5, 0.8].map((ratio) => (
                    <Line
                      key={ratio}
                      x1={0}
                      x2={chartW}
                      y1={chartH * ratio}
                      y2={chartH * ratio}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth={1}
                    />
                  ))}
                  <Path d={chart.path} stroke={chart.flat ? Colors.yellow : Colors.cyan} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <Circle cx={chart.lastX} cy={chart.lastY} r={4.5} fill={chart.flat ? Colors.yellow : Colors.cyan} />
                </Svg>
              ) : (
                <View style={[styles.chartEmpty, { width: chartW, height: chartH }]}>
                  <Ionicons name="analytics-outline" size={24} color={Colors.textMuted} />
                  <Text style={styles.chartEmptyText}>Synchronisation des taux...</Text>
                </View>
              )}
            </View>

            <View style={styles.chartFooter}>
              <Text style={styles.sourceLine}>{chartSourceLabel(historySource, chart.flat, rateSource)}</Text>
              {rateError ? <Text style={styles.errorLine}>{rateError}</Text> : null}
              {updated ? (
                <Text style={styles.sourceLine}>
                  Mis a jour {new Date(updated).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </Text>
              ) : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {favoritePairs.map(([f, t]) => {
                const p = `${f}_${t}`;
                const active = p === pair;
                return (
                  <Pressable key={p} testID={`pair-${p}`} onPress={() => setPair(p)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f}/{t}</Text>
                  </Pressable>
                );
              })}
              <Pressable testID="manage-pairs" onPress={() => router.push("/rate-alerts")} style={[styles.chip, { borderStyle: "dashed" }]}>
                <Ionicons name="add" size={14} color={Colors.textSoft} />
                <Text style={styles.chipText}>Gerer</Text>
              </Pressable>
            </ScrollView>
          </GlassCard>

          <View style={styles.sectionPad}>
            <Text style={styles.sectionLabel}>Taux en direct - 1 EUR =</Text>
          </View>
          <View style={styles.ratesWrap}>
            {CURRENCIES.filter((c) => c.code !== "EUR").map((c, i) => {
              const v = rates[c.code];
              return (
                <Animated.View key={c.code} entering={FadeInRight.delay(Math.min(i, 12) * 24)} style={styles.rateRow} testID={`rate-${c.code}`}>
                  <View style={styles.rateIdentity}>
                    <Text style={styles.rateFlag}>{c.flag}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rateCode}>{c.code}</Text>
                      <Text style={styles.rateName} numberOfLines={1}>{c.name}</Text>
                    </View>
                  </View>
                  <Text style={styles.rateValue} adjustsFontSizeToFit numberOfLines={1}>
                    {v ? v.toLocaleString("fr-FR", { maximumFractionDigits: rateDecimals(c.code) }) : "--"}
                  </Text>
                </Animated.View>
              );
            })}
          </View>

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <PrimaryButton testID="goto-convert" title="Convertir maintenant" icon={<Ionicons name="swap-horizontal" size={18} color="#000" />} onPress={() => router.push("/convert")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function QuickAction({ testID, icon, color, label, onPress }: { testID: string; icon: any; color: string; label: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.quickBtn}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.quickText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function sanitizeRates(raw: Record<string, any>) {
  const clean: Record<string, number> = {};
  Object.entries(raw || {}).forEach(([key, value]) => {
    const n = Number(value);
    if (key && Number.isFinite(n) && n > 0) clean[key.toUpperCase()] = n;
  });
  return clean;
}

function sanitizeHistory(raw: any[]): RatePoint[] {
  return (Array.isArray(raw) ? raw : [])
    .map((point) => ({ t: String(point?.t || ""), v: Number(point?.v) }))
    .filter((point) => point.t && Number.isFinite(point.v) && point.v > 0)
    .sort((a, b) => a.t.localeCompare(b.t));
}

function getPairRate(rates: Record<string, number>, pair: string) {
  const [from, to] = pair.split("_");
  if (!from || !to || !rates[from] || !rates[to]) return 0;
  return rates[to] / rates[from];
}

function buildFlatHistory(pair: string, rate: number): RatePoint[] {
  if (!rate) return [];
  return Array.from({ length: 30 }, (_, index) => ({
    t: new Date(Date.now() - (29 - index) * 86400000).toISOString(),
    v: Number(rate.toFixed(6)),
  }));
}

function buildChartShape(points: RatePoint[], width: number, height: number) {
  if (points.length < 2) return { path: "", lastX: 0, lastY: height / 2, flat: false };
  const pad = 10;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const flat = range === 0;
  let lastX = pad;
  let lastY = height / 2;
  const path = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * innerW;
      const y = flat ? height / 2 : pad + innerH - ((p.v - min) / range) * innerH;
      lastX = x;
      lastY = y;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return { path, lastX, lastY, flat };
}

function buildPairOptions(raw?: [string, string][]) {
  const seen = new Set<string>();
  const result: [string, string][] = [];
  [...DEFAULT_RATE_PAIRS, ...(Array.isArray(raw) ? raw : [])].forEach(([from, to]) => {
    const pair = `${from}_${to}`.toUpperCase();
    if (!from || !to || seen.has(pair)) return;
    seen.add(pair);
    result.push([from.toUpperCase(), to.toUpperCase()]);
  });
  return result.slice(0, 8);
}

function rateDecimals(code: string) {
  if (["XOF", "XAF", "JPY", "NGN", "KES", "GHS"].includes(code)) return 2;
  return 4;
}

function chartSourceLabel(source: string, flat: boolean, provider: string) {
  const providerText = provider ? ` - ${provider}` : "";
  if (source === "frankfurter") return `${flat ? "Taux stable reel" : "Historique reel"}${providerText}`;
  if (source === "latest-live") return `Dernier taux live${providerText}`;
  return `Taux synchronises${providerText}`;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 16, gap: 12 },
  hello: { color: Colors.textSoft, fontSize: 13 },
  name: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 10, flexShrink: 0 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.border },
  dot: { position: "absolute", top: 4, right: 4, backgroundColor: Colors.magenta, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  dotText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  totalLabel: { color: Colors.textSoft, fontSize: 11, letterSpacing: 2 },
  totalValue: { color: "#fff", fontSize: 36, fontWeight: "900", marginTop: 6 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 18, gap: 10 },
  quickBtn: {
    flexBasis: "30%",
    flexGrow: 1,
    minWidth: 96,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  chartHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  chartValueBlock: { alignItems: "flex-end", flexShrink: 0, maxWidth: 150 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  sectionSub: { color: Colors.textSoft, fontSize: 12, marginTop: 2 },
  bigVal: { color: "#fff", fontSize: 22, fontWeight: "900", fontFamily: "monospace" },
  trendText: { fontSize: 12, fontWeight: "800", marginTop: 3 },
  chartCanvas: { marginTop: 14, alignItems: "center", overflow: "hidden" },
  chartEmpty: { alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.035)" },
  chartEmptyText: { color: Colors.textSoft, fontSize: 12, marginTop: 6 },
  chartFooter: { marginTop: 8, gap: 3 },
  sourceLine: { color: Colors.textMuted, fontSize: 11 },
  errorLine: { color: Colors.yellow, fontSize: 11, fontWeight: "700" },
  chip: { minHeight: 36, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, marginRight: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.035)" },
  chipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.6, shadowRadius: 12 },
  chipText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: "#000", fontWeight: "900" },
  sectionPad: { paddingHorizontal: 16, marginTop: 6 },
  sectionLabel: { color: Colors.textSoft, fontSize: 12, letterSpacing: 2, marginTop: 12, marginBottom: 4, textTransform: "uppercase" },
  ratesWrap: { paddingHorizontal: 16, marginTop: 6 },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rateIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  rateFlag: { color: "#fff", fontSize: 16, fontWeight: "900", minWidth: 32, textAlign: "center" },
  rateCode: { color: "#fff", fontWeight: "900" },
  rateName: { color: Colors.textSoft, fontSize: 11 },
  rateValue: { color: Colors.cyan, fontFamily: "monospace", fontWeight: "900", maxWidth: 130 },
});
