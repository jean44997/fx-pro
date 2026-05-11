import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton, NeoCard } from "../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../src/theme";
import { useAuth, api } from "../src/auth";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

export default function Convert() {
  const params = useLocalSearchParams<{ from?: string }>();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [from, setFrom] = useState((params.from as string) || "EUR");
  const [to, setTo] = useState("XOF");
  const [amount, setAmount] = useState("100");
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const swapRot = useSharedValue(0);

  useEffect(() => {
    api.get("/rates").then((r) => setRates(r.rates)).catch(() => {});
  }, []);

  const num = parseFloat((amount || "0").replace(",", ".")) || 0;
  const rate = rates[from] && rates[to] ? rates[to] / rates[from] : 0;
  const converted = num * rate;
  const balFrom = (user?.balances || {})[from] || 0;

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
    if (num > balFrom) return Alert.alert("Solde insuffisant");
    setLoading(true);
    try {
      const r = await api.post("/convert", { from_currency: from, to_currency: to, amount: num });
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace({ pathname: "/receipt/[id]", params: { id: r.transaction.txn_id } });
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Conversion échouée");
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
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <CurrencyPicker testID="conv-from" code={from} onChange={setFrom} />
                  <TextInput
                    testID="conv-amount"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.amountInput}
                  />
                </View>
                <Text style={styles.bal}>Solde: {formatMoney(balFrom, from)}</Text>
              </NeoCard>
            </Animated.View>

            <View style={{ alignItems: "center", marginVertical: -2 }}>
              <Pressable testID="conv-swap" onPress={swap} style={styles.swapBtn}>
                <Animated.View style={swapStyle}>
                  <Ionicons name="swap-vertical" size={24} color={Colors.cyan} />
                </Animated.View>
              </Pressable>
            </View>

            <Animated.View entering={FadeInDown.duration(400)}>
              <GlassCard>
                <Text style={styles.lbl}>Vous recevez</Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <CurrencyPicker testID="conv-to" code={to} onChange={setTo} />
                  <Text testID="conv-received" style={[styles.amountInput, { color: Colors.cyan }]} numberOfLines={1}>
                    {converted.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <Text style={styles.rateLine}>1 {from} = {rate ? rate.toFixed(6) : "—"} {to}</Text>
              </GlassCard>
            </Animated.View>

            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <PrimaryButton testID="conv-submit" title="Confirmer la conversion" loading={loading} onPress={submit} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBg>
  );
}

function CurrencyPicker({ code, onChange, testID }: { code: string; onChange: (c: string) => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  const meta = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  return (
    <View>
      <Pressable testID={testID} onPress={() => setOpen(!open)} style={styles.pickerBtn}>
        <Text style={{ fontSize: 22 }}>{meta.flag}</Text>
        <Text style={{ color: "#fff", fontWeight: "900" }}>{meta.code}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSoft} />
      </Pressable>
      {open && (
        <View style={styles.dropdown}>
          <ScrollView style={{ maxHeight: 240 }}>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c.code}
                testID={`${testID}-${c.code}`}
                onPress={() => {
                  onChange(c.code);
                  setOpen(false);
                }}
                style={styles.dropItem}
              >
                <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }}>{c.code}</Text>
                <Text style={{ color: Colors.textSoft, fontSize: 11 }}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  lbl: { color: Colors.textSoft, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  amountInput: { flex: 1, color: "#fff", fontSize: 30, fontWeight: "900", textAlign: "right", paddingHorizontal: 12 },
  bal: { color: Colors.textSoft, fontSize: 12, marginTop: 8 },
  rateLine: { color: Colors.textSoft, fontSize: 12, marginTop: 8 },
  swapBtn: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a14", borderWidth: 2, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.7, shadowRadius: 12, zIndex: 5 },
  pickerBtn: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.border },
  dropdown: { position: "absolute", top: 50, left: 0, minWidth: 220, backgroundColor: "#0c0c14", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 6, zIndex: 10, shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 16, elevation: 12 },
  dropItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10 },
});
