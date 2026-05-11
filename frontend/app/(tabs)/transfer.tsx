import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton, GhostButton } from "../../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../../src/theme";
import { useAuth, api } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Transfer() {
  const params = useLocalSearchParams<{ currency?: string }>();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [mode, setMode] = useState<"email" | "qr">("email");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(params.currency || "EUR");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const bal = (user?.balances || {})[currency] || 0;

  const submit = async () => {
    if (!recipient.trim()) return Alert.alert("Destinataire requis");
    const n = parseFloat(amount.replace(",", "."));
    if (!n || n <= 0) return Alert.alert("Montant invalide");
    if (n > bal) return Alert.alert("Solde insuffisant", `Solde ${currency}: ${formatMoney(bal, currency)}`);
    setLoading(true);
    try {
      const r = await api.post("/transfer", {
        recipient: recipient.trim(),
        by: mode,
        amount: n,
        currency,
        note,
      });
      await refresh();
      router.push({ pathname: "/receipt/[id]", params: { id: r.transaction.txn_id } });
      setAmount("");
      setRecipient("");
      setNote("");
    } catch (e: any) {
      Alert.alert("Échec", e.message || "Erreur de transfert");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
            <View style={{ padding: 20 }}>
              <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>Envoyer</Text>
              <Text style={{ color: Colors.textSoft, marginTop: 4 }}>Transfert instantané entre utilisateurs FX Pro</Text>
            </View>

            <View style={{ paddingHorizontal: 16, flexDirection: "row", gap: 10 }}>
              <Pressable testID="mode-email" onPress={() => setMode("email")} style={[styles.tab, mode === "email" && styles.tabActive]}>
                <Ionicons name="mail" size={16} color={mode === "email" ? "#000" : "#fff"} />
                <Text style={[styles.tabText, mode === "email" && { color: "#000" }]}>Email</Text>
              </Pressable>
              <Pressable testID="mode-qr" onPress={() => setMode("qr")} style={[styles.tab, mode === "qr" && styles.tabActive]}>
                <Ionicons name="qr-code" size={16} color={mode === "qr" ? "#000" : "#fff"} />
                <Text style={[styles.tabText, mode === "qr" && { color: "#000" }]}>QR Code</Text>
              </Pressable>
            </View>

            <Animated.View entering={FadeIn.duration(300)}>
              <GlassCard>
                <Text style={styles.label}>{mode === "email" ? "Email du destinataire" : "Code QR (collez ou scannez)"}</Text>
                <View style={styles.inputRow}>
                  <Ionicons name={mode === "email" ? "mail-outline" : "qr-code-outline"} size={18} color={Colors.textSoft} />
                  <TextInput
                    testID="recipient-input"
                    value={recipient}
                    onChangeText={setRecipient}
                    placeholder={mode === "email" ? "destinataire@email.com" : "FXPRO:user_xxx:CODE"}
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    style={styles.input}
                  />
                  {mode === "qr" && (
                    <Pressable testID="open-scan" onPress={() => router.push("/scan-qr")} style={styles.scanBtn}>
                      <Ionicons name="scan" size={18} color={Colors.cyan} />
                    </Pressable>
                  )}
                </View>

                <Text style={[styles.label, { marginTop: 18 }]}>Devise</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CURRENCIES.map((c) => {
                    const active = c.code === currency;
                    return (
                      <Pressable key={c.code} testID={`cur-${c.code}`} onPress={() => setCurrency(c.code)} style={[styles.curChip, active && styles.curChipActive]}>
                        <Text style={{ fontSize: 16 }}>{c.flag}</Text>
                        <Text style={[styles.curText, active && { color: "#000", fontWeight: "900" }]}>{c.code}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.label, { marginTop: 18 }]}>Montant</Text>
                <View style={styles.inputRow}>
                  <Text style={{ color: Colors.cyan, fontWeight: "900", fontSize: 18 }}>{currency}</Text>
                  <TextInput
                    testID="amount-input"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    style={[styles.input, { fontSize: 26, fontWeight: "900" }]}
                  />
                </View>
                <Text style={styles.balHint} testID="available-balance">Disponible: {formatMoney(bal, currency)}</Text>

                <Text style={[styles.label, { marginTop: 18 }]}>Note (optionnel)</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="document-text-outline" size={18} color={Colors.textSoft} />
                  <TextInput
                    testID="note-input"
                    value={note}
                    onChangeText={setNote}
                    placeholder="Pour la facture ..."
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                  />
                </View>

                <Animated.View entering={FadeInDown.delay(200)}>
                  <PrimaryButton testID="transfer-submit" title="Envoyer maintenant" loading={loading} onPress={submit} />
                  <GhostButton testID="show-my-qr" title="Afficher mon QR" icon={<Ionicons name="qr-code" size={16} color="#fff" />} onPress={() => router.push("/receive-qr")} />
                </Animated.View>
              </GlassCard>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)" },
  tabActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.6, shadowRadius: 12 },
  tabText: { color: "#fff", fontWeight: "800" },
  label: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.18)", paddingBottom: 6 },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 10 },
  scanBtn: { padding: 8, borderRadius: 10, backgroundColor: "rgba(0,255,255,0.1)", borderWidth: 1, borderColor: Colors.cyan },
  curChip: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: "rgba(255,255,255,0.05)" },
  curChipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.5, shadowRadius: 10 },
  curText: { color: "#fff", fontWeight: "700" },
  balHint: { color: Colors.textSoft, fontSize: 12, marginTop: 6 },
});
