import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { CurrencyPickerButton } from "../src/CurrencyPicker";
import { useAuth, api } from "../src/auth";
import { Colors, formatMoney } from "../src/theme";
import { GradientBg, GlassCard, PrimaryButton } from "../src/ui";

const METHODS = [
  { id: "mobile_money", label: "Mobile Money", icon: "phone-portrait" },
  { id: "card", label: "Carte bancaire", icon: "card" },
  { id: "bank_transfer", label: "Virement bancaire", icon: "business" },
  { id: "cash_agent", label: "Agent FX Pro", icon: "storefront" },
];

export default function Deposit() {
  const router = useRouter();
  const params = useLocalSearchParams<{ currency?: string }>();
  const { user, refresh } = useAuth();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(params.currency || "EUR");
  const [method, setMethod] = useState(METHODS[0].id);
  const [accountName, setAccountName] = useState(user?.name || "");
  const [accountRef, setAccountRef] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const numericAmount = Number(amount.replace(",", "."));

  const submit = async () => {
    if (!numericAmount || numericAmount <= 0) return Alert.alert("Montant invalide");
    setLoading(true);
    try {
      const r = await api.post("/cash/deposit", {
        amount: numericAmount,
        currency,
        method,
        account_name: accountName,
        account_ref: accountRef,
        note,
      });
      await refresh();
      Alert.alert("Depot cree", `Reference ${r.transaction.reference}. Le solde sera credite apres validation.`);
      router.replace({ pathname: "/receipt/[id]", params: { id: r.transaction.txn_id } });
    } catch (e: any) {
      Alert.alert("Depot impossible", e.message || "Reessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="deposit-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Depot</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
          <GlassCard>
            <Text style={styles.section}>Recharge securisee</Text>
            <Text style={styles.help}>
              Une reference unique est creee pour chaque depot. Le solde est credite apres validation du paiement.
            </Text>
            <Text style={styles.lbl}>Devise</Text>
            <CurrencyPickerButton code={currency} onChange={setCurrency} testID="deposit-currency" />
            <Text style={styles.lbl}>Montant</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputPrefix}>{currency}</Text>
              <TextInput
                testID="deposit-amount"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
              />
            </View>
            <Text style={styles.preview}>
              {numericAmount > 0 ? `Demande: ${formatMoney(numericAmount, currency)} - frais 0` : "Saisissez le montant a recharger"}
            </Text>
          </GlassCard>

          <GlassCard>
            <Text style={styles.section}>Methode de depot</Text>
            <View style={styles.methodGrid}>
              {METHODS.map((item) => (
                <Pressable
                  key={item.id}
                  testID={`deposit-method-${item.id}`}
                  onPress={() => setMethod(item.id)}
                  style={[styles.method, method === item.id && styles.methodActive]}
                >
                  <Ionicons name={item.icon as any} size={18} color={method === item.id ? "#000" : Colors.cyan} />
                  <Text style={[styles.methodText, method === item.id && { color: "#000" }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.lbl}>Nom du titulaire</Text>
            <TextInput testID="deposit-name" value={accountName} onChangeText={setAccountName} placeholder="Nom complet" placeholderTextColor={Colors.textMuted} style={styles.lineInput} />
            <Text style={styles.lbl}>Reference externe</Text>
            <TextInput testID="deposit-ref" value={accountRef} onChangeText={setAccountRef} placeholder="Numero, IBAN, transaction operateur..." placeholderTextColor={Colors.textMuted} style={styles.lineInput} />
            <Text style={styles.lbl}>Note</Text>
            <TextInput testID="deposit-note" value={note} onChangeText={setNote} placeholder="Optionnel" placeholderTextColor={Colors.textMuted} style={styles.lineInput} />
          </GlassCard>

          <GlassCard>
            <View style={styles.securityRow}>
              <Ionicons name="shield-checkmark" size={22} color={Colors.green} />
              <View style={{ flex: 1 }}>
                <Text style={styles.securityTitle}>Controle financier</Text>
                <Text style={styles.help}>
                  Les depots ne modifient pas le solde sans validation. Gardez la reference de depot pour le support.
                </Text>
              </View>
            </View>
          </GlassCard>

          <PrimaryButton testID="deposit-submit" title="Creer la demande de depot" loading={loading} onPress={submit} />
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  section: { color: "#fff", fontSize: 17, fontWeight: "900" },
  help: { color: Colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 6 },
  lbl: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginTop: 16, marginBottom: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1.5, borderBottomColor: Colors.borderStrong },
  inputPrefix: { color: Colors.cyan, fontWeight: "900", fontSize: 18 },
  input: { flex: 1, color: "#fff", fontSize: 26, fontWeight: "900", paddingVertical: 8 },
  preview: { color: Colors.cyan, marginTop: 8, fontWeight: "800", fontSize: 12 },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  method: { flexGrow: 1, minWidth: "47%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12, backgroundColor: "rgba(255,255,255,0.05)" },
  methodActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  methodText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  lineInput: { color: "#fff", fontSize: 15, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  securityRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  securityTitle: { color: "#fff", fontWeight: "900" },
});
