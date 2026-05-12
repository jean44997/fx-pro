import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Share, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GradientBg, GlassCard, NeoCard, GhostButton, PrimaryButton } from "../../src/ui";
import { Colors, formatMoney } from "../../src/theme";
import { api } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<any>(null);

  useEffect(() => {
    if (id) api.get(`/transactions/${id}`).then(setT).catch((e) => Alert.alert("Erreur", e.message));
  }, [id]);

  const shareReceipt = async () => {
    if (!t) return;
    const text = buildReceiptText(t);
    try {
      if (Platform.OS === "web") {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          Alert.alert("Copié", "Reçu copié dans le presse-papier");
        }
      } else {
        await Share.share({ message: text, title: "Reçu FX Pro" });
      }
    } catch {}
  };

  if (!t) {
    return (
      <GradientBg>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.top}>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.title}>Reçu</Text>
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
        <View style={styles.top}>
          <Pressable testID="receipt-back" onPress={() => router.replace("/(tabs)/home")} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Reçu</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.successCircle}>
            <Ionicons name="checkmark-circle" size={80} color={Colors.green} />
            <Text style={styles.successText}>Transaction confirmée</Text>
            <Text style={styles.txnId} testID="receipt-id">{t.txn_id}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150)}>
            <NeoCard color={Colors.cyan}>
              <Row label="Type" value={typeLabel(t.type)} />
              {t.type === "convert" && (
                <>
                  <Row label="De" value={`${formatMoney(t.amount, t.from_currency)}`} />
                  <Row label="Vers" value={`${formatMoney(t.received, t.to_currency)}`} highlight />
                  <Row label="Taux" value={`1 ${t.from_currency} = ${t.rate?.toFixed(6)} ${t.to_currency}`} />
                </>
              )}
              {t.type === "transfer" && (
                <>
                  <Row label="Montant" value={`${formatMoney(t.amount, t.currency)}`} highlight />
                  <Row label="De" value={t.sender_email} />
                  <Row label="Vers" value={t.receiver_email} />
                  {t.note ? <Row label="Note" value={t.note} /> : null}
                </>
              )}
              {(t.type === "admin_credit" || t.type === "admin_debit") && (
                <>
                  <Row label="Montant" value={`${formatMoney(t.amount, t.currency)}`} highlight />
                </>
              )}
              <Row label="Statut" value={t.status} />
              <Row label="Date" value={new Date(t.created_at).toLocaleString("fr-FR")} />
            </NeoCard>
          </Animated.View>

          <View style={{ paddingHorizontal: 0, marginTop: 8 }}>
            <PrimaryButton testID="share-receipt" title="Partager le reçu" icon={<Ionicons name="share" size={16} color="#000" />} onPress={shareReceipt} />
            <GhostButton testID="back-home" title="Retour à l'accueil" onPress={() => router.replace("/(tabs)/home")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function typeLabel(t: string) {
  return ({ convert: "Conversion", transfer: "Transfert P2P", admin_credit: "Crédit admin", admin_debit: "Débit admin" } as any)[t] || t;
}

function buildReceiptText(t: any) {
  const lines = [
    "===== REÇU FX PRO 2026 =====",
    `ID: ${t.txn_id}`,
    `Type: ${typeLabel(t.type)}`,
    `Date: ${new Date(t.created_at).toLocaleString("fr-FR")}`,
    `Statut: ${t.status}`,
  ];
  if (t.type === "convert") {
    lines.push(`De: ${formatMoney(t.amount, t.from_currency)}`);
    lines.push(`Vers: ${formatMoney(t.received, t.to_currency)}`);
    lines.push(`Taux: 1 ${t.from_currency} = ${t.rate?.toFixed(6)} ${t.to_currency}`);
  } else if (t.type === "transfer") {
    lines.push(`Montant: ${formatMoney(t.amount, t.currency)}`);
    lines.push(`De: ${t.sender_email}`);
    lines.push(`Vers: ${t.receiver_email}`);
    if (t.note) lines.push(`Note: ${t.note}`);
  }
  lines.push("============================");
  return lines.join("\n");
}

function Row({ label, value, highlight }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rLbl}>{label}</Text>
      <Text style={[styles.rVal, highlight && { color: Colors.cyan, fontSize: 18, fontWeight: "900" }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  successCircle: { alignItems: "center", paddingVertical: 24 },
  successText: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 12 },
  txnId: { color: Colors.textSoft, marginTop: 6, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  rLbl: { color: Colors.textSoft, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  rVal: { color: "#fff", fontWeight: "700", maxWidth: "60%", textAlign: "right" },
});
