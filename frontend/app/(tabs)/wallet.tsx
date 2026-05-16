import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard } from "../../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../../src/theme";
import { api, useAuth } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Wallet() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, refresh } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const compact = width < 390;

  useEffect(() => {
    api.get("/rates").then((r) => setRates(r.rates || {})).catch(() => undefined);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refresh(),
      api.get("/rates").then((r) => setRates(r.rates || {})).catch(() => undefined),
    ]);
    setRefreshing(false);
  };

  const balances = user?.balances || {};
  const orderedCurrencies = useMemo(
    () => [...CURRENCIES].sort((a, b) => ((balances[b.code] || 0) > 0 ? 1 : 0) - ((balances[a.code] || 0) > 0 ? 1 : 0)),
    [balances]
  );
  const totalEur = useMemo(() => {
    return Object.entries(balances).reduce((sum, [code, amount]) => {
      const rate = rates[code];
      return rate ? sum + Number(amount || 0) / rate : sum;
    }, 0);
  }, [balances, rates]);
  const activeCount = Object.values(balances).filter((amount) => Number(amount || 0) > 0).length;

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}>
          <View style={{ padding: 20 }}>
            <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>Portefeuille</Text>
            <Text style={{ color: Colors.textSoft, marginTop: 4 }}>Vos soldes multi-devises en temps reel</Text>
            <View style={styles.topActions}>
              <Pressable testID="wallet-deposit" onPress={() => router.push("/deposit")} style={[styles.topAction, { borderColor: Colors.green }]}>
                <Ionicons name="add-circle" size={17} color={Colors.green} />
                <Text style={styles.actionText}>Depot</Text>
              </Pressable>
              <Pressable testID="wallet-withdraw" onPress={() => router.push("/withdraw")} style={[styles.topAction, { borderColor: Colors.yellow }]}>
                <Ionicons name="remove-circle" size={17} color={Colors.yellow} />
                <Text style={styles.actionText}>Retrait</Text>
              </Pressable>
              <Pressable testID="wallet-receive" onPress={() => router.push("/receive-qr")} style={[styles.topAction, { borderColor: Colors.cyan }]}>
                <Ionicons name="qr-code" size={17} color={Colors.cyan} />
                <Text style={styles.actionText}>Recevoir</Text>
              </Pressable>
            </View>
          </View>

          <GlassCard testID="wallet-summary">
            <Text style={styles.summaryLabel}>Valeur estimee</Text>
            <Text style={styles.summaryValue} adjustsFontSizeToFit numberOfLines={1}>{formatMoney(totalEur, "EUR")}</Text>
            <View style={styles.summaryLine}>
              <InfoPill icon="wallet" label={`${activeCount} devise${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}`} color={Colors.cyan} />
              <InfoPill icon="shield-checkmark" label="Solde synchronise" color={Colors.green} />
            </View>
            <Text style={styles.summaryHint}>Les montants convertis utilisent le dernier taux live disponible et restent indicatifs.</Text>
          </GlassCard>

          {orderedCurrencies.map((c, i) => {
            const v = (user?.balances || {})[c.code] || 0;
            const estimatedEur = rates[c.code] ? v / rates[c.code] : 0;
            const share = totalEur > 0 && estimatedEur > 0 ? Math.min(100, Math.max(3, (estimatedEur / totalEur) * 100)) : 0;
            return (
              <Animated.View key={c.code} entering={FadeInUp.delay(i * 40)}>
                <GlassCard testID={`balance-${c.code}`}>
                  <View style={[styles.balanceHeader, compact && styles.balanceHeaderCompact]}>
                    <View style={styles.currencyInfo}>
                      <View style={[styles.flagWrap, { borderColor: Colors.cyan }]}>
                        <Text style={{ fontSize: 28 }}>{c.flag}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>{c.code}</Text>
                        <Text style={styles.currencyName} numberOfLines={2}>{c.name}</Text>
                      </View>
                    </View>
                    <View style={[styles.amountBlock, compact && styles.amountBlockCompact]}>
                      <Text style={styles.balanceAmount} adjustsFontSizeToFit numberOfLines={1}>{formatMoney(v, c.code)}</Text>
                      <Text style={styles.eurHint}>{rates[c.code] ? `~ ${formatMoney(estimatedEur, "EUR")}` : "Taux en attente"}</Text>
                    </View>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${share}%`, opacity: share ? 1 : 0.25 }]} />
                  </View>
                  <View style={styles.actionWrap}>
                        <Pressable
                          testID={`convert-${c.code}`}
                          onPress={() => router.push({ pathname: "/convert", params: { from: c.code } })}
                          style={styles.action}
                        >
                          <Ionicons name="swap-horizontal" size={14} color={Colors.cyan} />
                          <Text style={styles.actionText}>Convertir</Text>
                        </Pressable>
                        <Pressable
                          testID={`send-${c.code}`}
                          onPress={() => router.push({ pathname: "/(tabs)/transfer", params: { currency: c.code } })}
                          style={styles.action}
                        >
                          <Ionicons name="paper-plane" size={14} color={Colors.magenta} />
                          <Text style={styles.actionText}>Envoyer</Text>
                        </Pressable>
                        <Pressable
                          testID={`deposit-${c.code}`}
                          onPress={() => router.push({ pathname: "/deposit", params: { currency: c.code } })}
                          style={styles.action}
                        >
                          <Ionicons name="add" size={14} color={Colors.green} />
                          <Text style={styles.actionText}>Depot</Text>
                        </Pressable>
                        <Pressable
                          testID={`withdraw-${c.code}`}
                          onPress={() => router.push({ pathname: "/withdraw", params: { currency: c.code } })}
                          style={styles.action}
                        >
                          <Ionicons name="cash-outline" size={14} color={Colors.yellow} />
                          <Text style={styles.actionText}>Retrait</Text>
                        </Pressable>
                        <Pressable
                          testID={`receive-${c.code}`}
                          onPress={() => router.push("/receive-qr")}
                          style={styles.action}
                        >
                          <Ionicons name="qr-code" size={14} color={Colors.green} />
                          <Text style={styles.actionText}>Recevoir</Text>
                        </Pressable>
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function InfoPill({ icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <View style={[styles.infoPill, { borderColor: color }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={styles.infoPillText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  topAction: {
    flex: 1,
    minWidth: 96,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
  },
  flagWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,255,255,0.06)",
    borderWidth: 1.5,
  },
  summaryLabel: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase" },
  summaryValue: { color: "#fff", fontSize: 34, fontWeight: "900", marginTop: 6 },
  summaryLine: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  summaryHint: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  infoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    maxWidth: "100%",
  },
  infoPillText: { color: "#fff", fontSize: 11, fontWeight: "800", flexShrink: 1 },
  balanceHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  balanceHeaderCompact: { alignItems: "flex-start", flexDirection: "column" },
  currencyInfo: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 14 },
  currencyName: { color: Colors.textSoft, fontSize: 12, lineHeight: 16, flexShrink: 1 },
  amountBlock: { alignItems: "flex-end", maxWidth: "48%" },
  amountBlockCompact: { alignItems: "flex-start", maxWidth: "100%", width: "100%" },
  balanceAmount: { color: "#fff", fontSize: 18, fontWeight: "900", fontFamily: "monospace", maxWidth: "100%" },
  eurHint: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 14 },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: Colors.cyan },
  actionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  action: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
