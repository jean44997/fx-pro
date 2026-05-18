import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton, NeoCard } from "../src/ui";
import { Colors, ZERO_DECIMALS, formatMoney } from "../src/theme";
import { useAuth, api } from "../src/auth";
import { CurrencyPickerButton } from "../src/CurrencyPicker";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { notify } from "../src/notifs";

export default function Convert() {
  const params = useLocalSearchParams<{ from?: string }>();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const [from, setFrom] = useState((params.from as string) || "EUR");
  const [to, setTo] = useState("XOF");
  const [amount, setAmount] = useState("100");
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const swapRot = useSharedValue(0);

  useEffect(() => {
    api.get("/rates").then((r) => setRates(r.rates)).catch(() => {});
    // Auto-refresh rates every 60s while screen is open
    const t = setInterval(() => {
      api.get("/rates").then((r) => setRates(r.rates)).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const num = parseFloat((amount || "0").replace(",", ".")) || 0;
  const rate = rates[from] && rates[to] ? rates[to] / rates[from] : 0;
  const converted = num * rate;
  const balFrom = (user?.balances || {})[from] || 0;
  const decTo = ZERO_DECIMALS.includes(to) ? 0 : 2;
  const compact = width < 430;
  const amountFont = width < 360 ? 23 : width < 430 ? 26 : 30;

  const swap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    swapRot.value = withSpring(swapRot.value + 180);
    const tmp = from;
    setFrom(to);
    setTo(tmp);
  };
  const swapStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${swapRot.value}deg` }] }));

  const submit = async () => {
    if (!num || num <= 0) return Alert.alert("Montant invalide");
    if (from === to) return Alert.alert("Devises identiques");
    if (num > balFrom) return Alert.alert("Solde insuffisant");
    setLoading(true);
    try {
      const r = await api.post("/convert", { from_currency: from, to_currency: to, amount: num });
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      notify("Conversion reussie", `${num} ${from} -> ${r.transaction.received} ${to}`);
      router.replace({ pathname: "/receipt/[id]", params: { id: r.transaction.txn_id } });
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Conversion echouee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.topBar}>
            <Pressable testID="conv-back" onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.title}>Convertir</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeIn.duration(400)}>
              <NeoCard color={Colors.cyan}>
                <Text style={styles.lbl}>Vous envoyez</Text>
                <View style={[styles.convertRow, compact && styles.convertRowCompact]}>
                  <CurrencyPickerButton testID="conv-from" code={from} onChange={setFrom} />
                  <TextInput
                    testID="conv-amount"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    style={[styles.amountInput, compact && styles.amountInputCompact, { fontSize: amountFont }]}
                  />
                </View>
                <Text style={styles.bal}>Solde: {formatMoney(balFrom, from)}</Text>
              </NeoCard>
            </Animated.View>

            <View style={{ alignItems: "center", marginVertical: -2, zIndex: 1 }}>
              <Pressable testID="conv-swap" onPress={swap} style={styles.swapBtn}>
                <Animated.View style={swapStyle}>
                  <Ionicons name="swap-vertical" size={24} color={Colors.cyan} />
                </Animated.View>
              </Pressable>
            </View>

            <Animated.View entering={FadeInDown.duration(400)}>
              <GlassCard>
                <Text style={styles.lbl}>Vous recevez</Text>
                <View style={[styles.convertRow, compact && styles.convertRowCompact]}>
                  <CurrencyPickerButton testID="conv-to" code={to} onChange={setTo} />
                  <Text testID="conv-received" style={[styles.amountInput, compact && styles.amountInputCompact, { color: Colors.cyan, fontSize: amountFont }]} numberOfLines={1} adjustsFontSizeToFit>
                    {converted.toLocaleString("fr-FR", { maximumFractionDigits: decTo })}
                  </Text>
                </View>
                <Text style={styles.rateLine}>1 {from} = {rate ? rate.toFixed(6) : "-"} {to}</Text>
                <Text style={styles.rateLine}>Taux mis a jour automatiquement chaque minute - API live</Text>
              </GlassCard>
            </Animated.View>

            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <View style={styles.summaryBox}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.summaryLabel}>Debit</Text>
                  <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(num || 0, from)}</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={Colors.textMuted} />
                <View style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}>
                  <Text style={styles.summaryLabel}>Reception</Text>
                  <Text style={[styles.summaryValue, { color: Colors.cyan }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(converted || 0, to)}</Text>
                </View>
              </View>
              <PrimaryButton testID="conv-submit" title="Confirmer la conversion" loading={loading} onPress={submit} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  lbl: { color: Colors.textSoft, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  convertRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  convertRowCompact: { flexDirection: "column", alignItems: "stretch" },
  amountInput: { flex: 1, minWidth: 0, color: "#fff", fontWeight: "900", textAlign: "right", paddingHorizontal: 12, paddingVertical: 8 },
  amountInputCompact: { width: "100%", textAlign: "left", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.055)", marginTop: 4 },
  bal: { color: Colors.textSoft, fontSize: 12, marginTop: 8 },
  rateLine: { color: Colors.textSoft, fontSize: 12, marginTop: 6 },
  summaryBox: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", padding: 13, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  summaryLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  summaryValue: { color: "#fff", fontSize: 16, fontWeight: "900", marginTop: 4 },
  swapBtn: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a14", borderWidth: 2, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.7, shadowRadius: 12 },
});
