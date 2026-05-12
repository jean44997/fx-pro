import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientBg, GlassCard, NeoCard, PrimaryButton, GhostButton } from "../../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../../src/theme";
import { api } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";

export default function AdminUser() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [target, setTarget] = useState<any>(null);
  const [currency, setCurrency] = useState("EUR");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const r = await api.get(`/admin/users?search=`);
      const u = (r.items || []).find((x: any) => x.user_id === id);
      setTarget(u || null);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  const adjust = async () => {
    const n = parseFloat(amount.replace(",", "."));
    if (!n || n <= 0) return Alert.alert("Montant invalide");
    setLoading(true);
    try {
      const signed = direction === "credit" ? n : -n;
      await api.patch(`/admin/users/${id}/balance`, { currency, amount: signed });
      setAmount("");
      await load();
      Alert.alert("OK", `${direction === "credit" ? "+" : "-"}${n} ${currency} appliqué`);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = async () => {
    if (!target) return;
    try {
      await api.patch(`/admin/users/${id}/block`, { is_blocked: !target.is_blocked });
      await load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const deleteUser = () => {
    Alert.alert("Supprimer", "Confirmer la suppression définitive ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            await api.del(`/admin/users/${id}`);
            router.back();
          } catch (e: any) {
            Alert.alert("Erreur", e.message);
          }
        },
      },
    ]);
  };

  if (!target) {
    return (
      <GradientBg>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.top}>
            <Pressable testID="adm-user-back" onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.title}>Utilisateur</Text>
            <View style={{ width: 26 }} />
          </View>
          <Text style={{ color: Colors.textSoft, textAlign: "center", marginTop: 40 }}>Chargement...</Text>
        </SafeAreaView>
      </GradientBg>
    );
  }

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.top}>
            <Pressable testID="adm-user-back" onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.title}>Utilisateur</Text>
            <Pressable testID="adm-user-delete" onPress={deleteUser} hitSlop={12}>
              <Ionicons name="trash" size={22} color={Colors.danger} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <NeoCard color={target.is_blocked ? Colors.danger : Colors.cyan}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={[styles.avatar, target.is_blocked && { borderColor: Colors.danger }]}>
                  <Text style={{ color: target.is_blocked ? Colors.danger : Colors.cyan, fontSize: 22, fontWeight: "900" }}>
                    {(target.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text testID="adm-user-name" style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>{target.name}</Text>
                  <Text style={{ color: Colors.textSoft, fontSize: 12 }}>{target.email}</Text>
                  <Text style={{ color: Colors.textSoft, fontSize: 11, marginTop: 2 }}>{target.phone || "Pas de téléphone"}</Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                    <Text style={[styles.tag, { color: Colors.cyan }]}>{target.role.toUpperCase()}</Text>
                    {target.is_blocked && <Text style={[styles.tag, { color: Colors.danger }]}>BLOQUÉ</Text>}
                  </View>
                </View>
              </View>
            </NeoCard>

            <GlassCard testID="adm-balance-card">
              <Text style={styles.sectionLabel}>Soldes</Text>
              {CURRENCIES.map((c) => {
                const v = (target.balances || {})[c.code] || 0;
                return (
                  <View key={c.code} style={styles.balRow}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>{c.flag} {c.code}</Text>
                    <Text testID={`adm-bal-${c.code}`} style={{ color: Colors.cyan, fontFamily: "monospace", fontWeight: "800" }}>{formatMoney(v, c.code)}</Text>
                  </View>
                );
              })}
            </GlassCard>

            <GlassCard testID="adm-adjust-card">
              <Text style={styles.sectionLabel}>Ajuster un solde en temps réel</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <Pressable testID="adm-credit" onPress={() => setDirection("credit")} style={[styles.dir, direction === "credit" && { backgroundColor: Colors.green, borderColor: Colors.green }]}>
                  <Ionicons name="add-circle" size={16} color={direction === "credit" ? "#000" : Colors.green} />
                  <Text style={[styles.dirText, direction === "credit" && { color: "#000" }]}>Créditer</Text>
                </Pressable>
                <Pressable testID="adm-debit" onPress={() => setDirection("debit")} style={[styles.dir, direction === "debit" && { backgroundColor: Colors.danger, borderColor: Colors.danger }]}>
                  <Ionicons name="remove-circle" size={16} color={direction === "debit" ? "#000" : Colors.danger} />
                  <Text style={[styles.dirText, direction === "debit" && { color: "#000" }]}>Débiter</Text>
                </Pressable>
              </View>

              <Text style={[styles.label, { marginTop: 14 }]}>Devise</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {CURRENCIES.map((c) => {
                  const active = c.code === currency;
                  return (
                    <Pressable key={c.code} testID={`adm-cur-${c.code}`} onPress={() => setCurrency(c.code)} style={[styles.chip, active && { backgroundColor: Colors.cyan, borderColor: Colors.cyan }]}>
                      <Text style={{ fontSize: 14 }}>{c.flag}</Text>
                      <Text style={[styles.chipText, active && { color: "#000", fontWeight: "900" }]}>{c.code}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={[styles.label, { marginTop: 14 }]}>Montant</Text>
              <View style={styles.inputRow}>
                <Text style={{ color: Colors.cyan, fontWeight: "900" }}>{currency}</Text>
                <TextInput
                  testID="adm-amount"
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>

              <PrimaryButton testID="adm-apply" title={`${direction === "credit" ? "Créditer" : "Débiter"} le compte`} loading={loading} onPress={adjust} />
            </GlassCard>

            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <GhostButton
                testID="adm-block-toggle"
                title={target.is_blocked ? "Débloquer le compte" : "Bloquer le compte"}
                icon={<Ionicons name={target.is_blocked ? "checkmark-circle" : "ban"} size={16} color={target.is_blocked ? Colors.green : Colors.danger} />}
                onPress={toggleBlock}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.cyan, backgroundColor: "rgba(0,255,255,0.08)" },
  tag: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  sectionLabel: { color: Colors.cyan, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 },
  balRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  label: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  inputRow: { flexDirection: "row", gap: 10, alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.18)", paddingBottom: 6 },
  input: { flex: 1, color: "#fff", fontSize: 22, fontWeight: "900", paddingVertical: 8 },
  dir: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)" },
  dirText: { color: "#fff", fontWeight: "800" },
  chip: { flexDirection: "row", gap: 4, alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, marginRight: 6, backgroundColor: "rgba(255,255,255,0.04)" },
  chipText: { color: "#fff", fontWeight: "700", fontSize: 11 },
});
