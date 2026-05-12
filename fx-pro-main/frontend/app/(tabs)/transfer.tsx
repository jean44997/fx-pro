import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton, GhostButton } from "../../src/ui";
import { Colors, formatMoney } from "../../src/theme";
import { useAuth, api } from "../../src/auth";
import { CurrencyPickerButton } from "../../src/CurrencyPicker";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { notify } from "../../src/notifs";

type CheckState = { status: "idle" | "checking" | "ok" | "not_found" | "self" | "blocked"; name?: string; email?: string; picture?: string };

export default function Transfer() {
  const params = useLocalSearchParams<{ currency?: string; qr?: string; name?: string }>();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [mode, setMode] = useState<"email" | "qr">(params.qr ? "qr" : "email");
  const [recipient, setRecipient] = useState((params.qr as string) || "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(params.currency || "EUR");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [check, setCheck] = useState<CheckState>({ status: "idle" });

  const bal = (user?.balances || {})[currency] || 0;

  // Realtime email check with debounce
  useEffect(() => {
    if (mode !== "email") {
      setCheck({ status: "idle" });
      return;
    }
    const v = recipient.trim();
    if (!v || !v.includes("@") || v.length < 5) {
      setCheck({ status: "idle" });
      return;
    }
    setCheck({ status: "checking" });
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/users/check?email=${encodeURIComponent(v)}`);
        if (!r.exists) setCheck({ status: "not_found" });
        else if (r.self) setCheck({ status: "self" });
        else if (r.blocked) setCheck({ status: "blocked" });
        else setCheck({ status: "ok", name: r.name, email: r.email, picture: r.picture });
      } catch {
        setCheck({ status: "not_found" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [recipient, mode]);

  const submit = async () => {
    if (!recipient.trim()) return Alert.alert("Destinataire requis");
    if (mode === "email" && check.status !== "ok") {
      return Alert.alert("Destinataire", check.status === "not_found" ? "Cet utilisateur n'existe pas dans FX Pro" : "Destinataire invalide");
    }
    const n = parseFloat(amount.replace(",", "."));
    if (!n || n <= 0) return Alert.alert("Montant invalide");
    if (n > bal) return Alert.alert("Solde insuffisant", `Solde ${currency}: ${formatMoney(bal, currency)}`);
    setLoading(true);
    try {
      const r = await api.post("/transfer", { recipient: recipient.trim(), by: mode, amount: n, currency, note });
      await refresh();
      notify("💸 Transfert envoyé", `-${n} ${currency} → ${check.email || recipient}`);
      router.push({ pathname: "/receipt/[id]", params: { id: r.transaction.txn_id } });
      setAmount("");
      setRecipient("");
      setNote("");
      setCheck({ status: "idle" });
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
                    autoCorrect={false}
                    keyboardType={mode === "email" ? "email-address" : "default"}
                    style={styles.input}
                  />
                  <CheckIcon state={check} />
                  {mode === "qr" && (
                    <Pressable testID="open-scan" onPress={() => router.push("/scan-qr")} style={styles.scanBtn}>
                      <Ionicons name="scan" size={18} color={Colors.cyan} />
                    </Pressable>
                  )}
                </View>
                {mode === "email" && check.status === "ok" && check.name && (
                  <Animated.View entering={FadeIn} style={styles.foundCard}>
                    <View style={styles.foundAvatar}>
                      <Text style={{ color: Colors.green, fontWeight: "900" }}>{(check.name || "?").charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontWeight: "800" }}>{check.name}</Text>
                      <Text style={{ color: Colors.textSoft, fontSize: 12 }}>{check.email}</Text>
                    </View>
                    <Ionicons name="checkmark-circle" size={22} color={Colors.green} />
                  </Animated.View>
                )}
                {mode === "email" && check.status === "not_found" && (
                  <Animated.View entering={FadeIn} style={[styles.foundCard, { borderColor: Colors.danger }]}>
                    <Ionicons name="close-circle" size={22} color={Colors.danger} />
                    <Text style={{ color: Colors.danger, fontWeight: "700", flex: 1 }}>Cet utilisateur n'existe pas dans FX Pro</Text>
                  </Animated.View>
                )}
                {check.status === "self" && (
                  <Text style={[styles.balHint, { color: Colors.yellow }]}>⚠️ Vous ne pouvez pas vous transférer à vous-même</Text>
                )}

                <Text style={[styles.label, { marginTop: 18 }]}>Devise</Text>
                <CurrencyPickerButton code={currency} onChange={setCurrency} testID="transfer-cur" />

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
                  <TextInput testID="note-input" value={note} onChangeText={setNote} placeholder="Pour la facture ..." placeholderTextColor={Colors.textMuted} style={styles.input} />
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

function CheckIcon({ state }: { state: CheckState }) {
  if (state.status === "checking") return <ActivityIndicator size="small" color={Colors.cyan} />;
  if (state.status === "ok") return <Ionicons name="checkmark-circle" size={22} color={Colors.green} />;
  if (state.status === "not_found") return <Ionicons name="close-circle" size={22} color={Colors.danger} />;
  if (state.status === "self") return <Ionicons name="warning" size={22} color={Colors.yellow} />;
  if (state.status === "blocked") return <Ionicons name="ban" size={22} color={Colors.danger} />;
  return null;
}

const styles = StyleSheet.create({
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)" },
  tabActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.6, shadowRadius: 12 },
  tabText: { color: "#fff", fontWeight: "800" },
  label: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.18)", paddingBottom: 6 },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 10 },
  scanBtn: { padding: 8, borderRadius: 10, backgroundColor: "rgba(0,255,255,0.1)", borderWidth: 1, borderColor: Colors.cyan },
  balHint: { color: Colors.textSoft, fontSize: 12, marginTop: 6 },
  foundCard: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: "rgba(57,255,20,0.08)", borderWidth: 1, borderColor: "rgba(57,255,20,0.3)" },
  foundAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(57,255,20,0.12)", borderWidth: 1, borderColor: Colors.green },
});
