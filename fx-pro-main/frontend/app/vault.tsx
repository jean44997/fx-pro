import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, NeoCard, PrimaryButton, GhostButton } from "../src/ui";
import { Colors, formatMoney } from "../src/theme";
import { useAuth, api } from "../src/auth";
import { CurrencyPickerButton } from "../src/CurrencyPicker";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import Animated, { FadeInUp } from "react-native-reanimated";

export default function Vault() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [label, setLabel] = useState("");
  const [period, setPeriod] = useState<number>(30); // days
  const [showPicker, setShowPicker] = useState(false);
  const [customDate, setCustomDate] = useState<Date>(new Date(Date.now() + 30 * 86400000));
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/vault");
      setItems(r.items || []);
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);

  const unlockDate =
    period === -1 ? customDate : new Date(Date.now() + period * 86400000);

  const create = async () => {
    const n = parseFloat(amount.replace(",", "."));
    if (!n || n <= 0) return Alert.alert("Montant invalide");
    const bal = (user?.balances || {})[currency] || 0;
    if (n > bal) return Alert.alert("Solde insuffisant", `Solde ${currency}: ${formatMoney(bal, currency)}`);
    setLoading(true);
    try {
      await api.post("/vault", {
        amount: n,
        currency,
        unlock_at: unlockDate.toISOString(),
        label: label || `Coffre ${currency}`,
      });
      await refresh();
      await load();
      setAmount("");
      setLabel("");
      Alert.alert("Coffre créé 🔒", `${n} ${currency} verrouillés jusqu'au ${unlockDate.toLocaleDateString("fr-FR")}`);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  const withdraw = async (v: any) => {
    const isReady = new Date(v.unlock_at) <= new Date();
    const msg = isReady ? `Retirer ${formatMoney(v.amount, v.currency)} maintenant ?` : `Retrait anticipé: pénalité 5% sera appliquée. Continuer ?`;
    Alert.alert("Retirer le coffre", msg, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Retirer",
        onPress: async () => {
          try {
            const r = await api.post(`/vault/${v.vault_id}/withdraw`, {});
            await refresh();
            await load();
            Alert.alert("Retiré", `+${r.amount_returned} ${v.currency}${r.penalty ? ` (pénalité ${r.penalty})` : ""}`);
          } catch (e: any) {
            Alert.alert("Erreur", e.message);
          }
        },
      },
    ]);
  };

  const active = items.filter((i) => i.status !== "withdrawn");
  const archived = items.filter((i) => i.status === "withdrawn");

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="vault-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>🔒 Coffre d'épargne</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          <NeoCard color={Colors.purple}>
            <Text style={styles.lbl}>Verrouillez votre argent</Text>
            <Text style={{ color: Colors.textSoft, fontSize: 12, marginTop: 4 }}>Choisissez une période. Retrait anticipé = 5% de pénalité.</Text>
            <Text style={[styles.lbl, { marginTop: 14 }]}>Devise</Text>
            <CurrencyPickerButton code={currency} onChange={setCurrency} testID="vault-cur" />
            <Text style={[styles.lbl, { marginTop: 14 }]}>Montant</Text>
            <View style={styles.inputRow}>
              <Text style={{ color: Colors.cyan, fontWeight: "900" }}>{currency}</Text>
              <TextInput testID="vault-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={Colors.textMuted} style={styles.input} />
            </View>
            <Text style={{ color: Colors.textSoft, fontSize: 12, marginTop: 4 }}>
              Disponible: {formatMoney((user?.balances || {})[currency] || 0, currency)}
            </Text>

            <Text style={[styles.lbl, { marginTop: 14 }]}>Étiquette (optionnel)</Text>
            <View style={styles.inputRow}>
              <Ionicons name="pricetag-outline" size={16} color={Colors.textSoft} />
              <TextInput testID="vault-label" value={label} onChangeText={setLabel} placeholder="Ex: Vacances 2026" placeholderTextColor={Colors.textMuted} style={styles.input} />
            </View>

            <Text style={[styles.lbl, { marginTop: 14 }]}>Durée</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {[
                { label: "1 mois", v: 30 },
                { label: "2 mois", v: 60 },
                { label: "3 mois", v: 90 },
                { label: "6 mois", v: 180 },
                { label: "1 an", v: 365 },
                { label: "📅 Date", v: -1 },
              ].map((p) => (
                <Pressable
                  key={p.label}
                  testID={`vault-period-${p.v}`}
                  onPress={() => {
                    setPeriod(p.v);
                    if (p.v === -1) setShowPicker(true);
                  }}
                  style={[styles.chip, period === p.v && styles.chipActive]}
                >
                  <Text style={[styles.chipText, period === p.v && { color: "#000", fontWeight: "900" }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: Colors.cyan, marginTop: 12, fontWeight: "700" }}>
              🔓 Déverrouillage : {unlockDate.toLocaleDateString("fr-FR")} ({Math.ceil((unlockDate.getTime() - Date.now()) / 86400000)} jours)
            </Text>
            {showPicker && (
              <DateTimePicker
                value={customDate}
                mode="date"
                minimumDate={new Date(Date.now() + 86400000)}
                onChange={(e, d) => {
                  setShowPicker(Platform.OS === "ios");
                  if (d) {
                    setCustomDate(d);
                    setPeriod(-1);
                  }
                }}
              />
            )}
            <PrimaryButton testID="vault-create" title="🔒 Verrouiller dans le coffre" loading={loading} onPress={create} />
          </NeoCard>

          {active.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <Text style={styles.section}>Coffres actifs ({active.length})</Text>
            </View>
          )}
          {active.map((v, i) => {
            const ua = new Date(v.unlock_at);
            const ready = ua <= new Date();
            const days = Math.max(0, Math.ceil((ua.getTime() - Date.now()) / 86400000));
            return (
              <Animated.View key={v.vault_id} entering={FadeInUp.delay(i * 50)}>
                <GlassCard>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={[styles.icon, { borderColor: ready ? Colors.green : Colors.cyan, shadowColor: ready ? Colors.green : Colors.cyan }]}>
                      <Ionicons name={ready ? "lock-open" : "lock-closed"} size={22} color={ready ? Colors.green : Colors.cyan} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{v.label || "Coffre"}</Text>
                      <Text style={{ color: Colors.cyan, fontFamily: "monospace", fontWeight: "800" }}>{formatMoney(v.amount, v.currency)}</Text>
                      <Text style={{ color: Colors.textSoft, fontSize: 11, marginTop: 4 }}>
                        {ready ? "✅ Disponible au retrait" : `🔒 ${days} jour(s) restant(s) · ${ua.toLocaleDateString("fr-FR")}`}
                      </Text>
                    </View>
                    <Pressable testID={`vault-withdraw-${v.vault_id}`} onPress={() => withdraw(v)} style={[styles.withdrawBtn, { backgroundColor: ready ? "rgba(57,255,20,0.15)" : "rgba(255,215,0,0.15)", borderColor: ready ? Colors.green : Colors.yellow }]}>
                      <Text style={{ color: ready ? Colors.green : Colors.yellow, fontWeight: "900", fontSize: 12 }}>Retirer</Text>
                    </Pressable>
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })}

          {archived.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              <Text style={styles.section}>Historique ({archived.length})</Text>
            </View>
          )}
          {archived.map((v) => (
            <GlassCard key={v.vault_id}>
              <Text style={{ color: Colors.textSoft }}>
                {v.label} · {formatMoney(v.amount, v.currency)} · retiré {v.withdrawn_at ? new Date(v.withdrawn_at).toLocaleDateString("fr-FR") : ""}
              </Text>
            </GlassCard>
          ))}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  lbl: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  inputRow: { flexDirection: "row", gap: 10, alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.18)", paddingBottom: 6 },
  input: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "800", paddingVertical: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)" },
  chipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.6, shadowRadius: 10 },
  chipText: { color: "#fff", fontWeight: "700" },
  section: { color: Colors.cyan, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: "900" },
  icon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1.5, shadowOpacity: 0.6, shadowRadius: 12 },
  withdrawBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
});
