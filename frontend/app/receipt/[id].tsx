import React, { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { GradientBg, GhostButton, NeoCard, PrimaryButton } from "../../src/ui";
import { Colors, formatMoney } from "../../src/theme";
import { api } from "../../src/auth";

export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [t, setT] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const txn = await api.get(`/transactions/${id}`);
          if (!cancelled) setT(txn);
          return;
        } catch (e: any) {
          if (attempt === 4 && !cancelled) Alert.alert("Erreur", e.message);
          await new Promise((resolve) => setTimeout(resolve, 450));
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const shareReceipt = async () => {
    if (!t) return;
    const text = buildReceiptText(t);
    try {
      if (Platform.OS === "web") {
        if (navigator.share) await navigator.share({ title: "Reçu FX Pro", text });
        else if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          Alert.alert("Copié", "Reçu copié dans le presse-papier");
        }
      } else {
        await Share.share({ message: text, title: "Reçu FX Pro" });
      }
    } catch {}
  };

  const downloadReceipt = async () => {
    if (!t) return;
    const text = buildReceiptText(t);
    const fileName = `fxpro-recu-${t.txn_id}.txt`;
    try {
      if (Platform.OS === "web") {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const uri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: "Reçu FX Pro" });
      else await Share.share({ message: text, title: "Reçu FX Pro" });
    } catch (e: any) {
      Alert.alert("Téléchargement impossible", e.message || "Réessayez.");
    }
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
            <Ionicons name={t.status === "completed" ? "checkmark-circle" : "time"} size={78} color={t.status === "completed" ? Colors.green : Colors.yellow} />
            <Text style={styles.successText}>{t.status === "completed" ? "Transaction confirmée" : "Transaction en traitement"}</Text>
            <Text style={styles.txnId} testID="receipt-id">{t.txn_id}</Text>
            {t.reference ? <Text style={styles.reference}>Référence {t.reference}</Text> : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150)}>
            <NeoCard color={t.status === "completed" ? Colors.cyan : Colors.yellow}>
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
              {(t.type === "deposit" || t.type === "withdraw") && (
                <>
                  <Row label="Montant" value={`${formatMoney(t.amount, t.currency)}`} highlight />
                  <Row label="Référence" value={t.reference || t.txn_id} />
                  <Row label="Méthode" value={methodLabel(t.method)} />
                  <Row label={t.type === "deposit" ? "Source" : "Destination"} value={t.account_ref || "A renseigner"} />
                  <Row label="Frais" value={`${formatMoney(t.fees || 0, t.currency)}`} />
                  {t.note ? <Row label="Note" value={t.note} /> : null}
                </>
              )}
              {(t.type === "vault_lock" || t.type === "vault_withdraw") && (
                <>
                  <Row label="Montant" value={`${formatMoney(t.amount, t.currency)}`} highlight />
                  {t.vault_id ? <Row label="Coffre" value={t.vault_id} /> : null}
                  {t.penalty ? <Row label="Pénalité" value={formatMoney(t.penalty, t.currency)} /> : null}
                </>
              )}
              {(t.type === "admin_credit" || t.type === "admin_debit") && (
                <Row label="Montant" value={`${formatMoney(t.amount, t.currency)}`} highlight />
              )}
              {t.type === "bonus_credit" && (
                <>
                  <Row label="Montant" value={`${formatMoney(t.amount, t.currency)}`} highlight />
                  <Row label="Reference" value={t.reference || t.bonus_id || t.txn_id} />
                  {t.bonus_id ? <Row label="Bonus" value={t.bonus_id} /> : null}
                </>
              )}
              <Row label="Statut" value={statusLabel(t.status)} />
              <Row label="Date" value={new Date(t.created_at).toLocaleString("fr-FR")} />
            </NeoCard>
          </Animated.View>

          <View style={{ paddingHorizontal: 0, marginTop: 8 }}>
            <PrimaryButton testID="share-receipt" title="Partager le reçu" icon={<Ionicons name="share" size={16} color="#000" />} onPress={shareReceipt} />
            <GhostButton testID="download-receipt" title="Télécharger le reçu" icon={<Ionicons name="download-outline" size={16} color="#fff" />} onPress={downloadReceipt} />
            <GhostButton testID="back-home" title="Retour à l'accueil" onPress={() => router.replace("/(tabs)/home")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function typeLabel(t: string) {
  return ({
    convert: "Conversion",
    transfer: "Transfert P2P",
    deposit: "Dépôt",
    withdraw: "Retrait",
    vault_lock: "Coffre verrouillé",
    vault_withdraw: "Retrait coffre",
    admin_credit: "Crédit admin",
    admin_debit: "Débit admin",
    bonus_credit: "Bonus credite",
  } as any)[t] || t;
}

function methodLabel(method?: string) {
  return ({
    mobile_money: "Mobile Money",
    card: "Carte bancaire",
    bank_transfer: "Virement bancaire",
    cash_agent: "Agent FX Pro",
    manual: "Validation manuelle",
  } as any)[method || ""] || method || "Non renseigné";
}

function statusLabel(status?: string) {
  return ({ completed: "Confirmée", pending: "En traitement", failed: "Échouée" } as any)[status || ""] || status || "Inconnu";
}

function buildReceiptText(t: any) {
  const lines = [
    "===== RECU FX PRO 2026 =====",
    `ID: ${t.txn_id}`,
    `Reference: ${t.reference || t.txn_id}`,
    `Type: ${typeLabel(t.type)}`,
    `Date: ${new Date(t.created_at).toLocaleString("fr-FR")}`,
    `Statut: ${statusLabel(t.status)}`,
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
  } else if (t.type === "deposit" || t.type === "withdraw") {
    lines.push(`Montant: ${formatMoney(t.amount, t.currency)}`);
    lines.push(`Methode: ${methodLabel(t.method)}`);
    lines.push(`${t.type === "deposit" ? "Source" : "Destination"}: ${t.account_ref || ""}`);
    lines.push(`Frais: ${formatMoney(t.fees || 0, t.currency)}`);
    if (t.note) lines.push(`Note: ${t.note}`);
  } else if (t.type === "vault_lock" || t.type === "vault_withdraw") {
    lines.push(`Montant: ${formatMoney(t.amount, t.currency)}`);
    if (t.vault_id) lines.push(`Coffre: ${t.vault_id}`);
    if (t.penalty) lines.push(`Penalite: ${formatMoney(t.penalty, t.currency)}`);
  } else if (t.type === "bonus_credit") {
    lines.push(`Montant: ${formatMoney(t.amount, t.currency)}`);
    lines.push(`Bonus: ${t.bonus_id || ""}`);
  }
  lines.push("============================");
  return lines.join("\n");
}

function Row({ label, value, highlight }: any) {
  return (
    <View style={styles.row}>
      <Text style={styles.rLbl}>{label}</Text>
      <Text style={[styles.rVal, highlight && { color: Colors.cyan, fontSize: 18, fontWeight: "900" }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  successCircle: { alignItems: "center", paddingVertical: 24 },
  successText: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 12 },
  txnId: { color: Colors.textSoft, marginTop: 6, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 },
  reference: { color: Colors.cyan, marginTop: 6, fontSize: 12, fontWeight: "900" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  rLbl: { color: Colors.textSoft, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  rVal: { color: "#fff", fontWeight: "700", maxWidth: "60%", textAlign: "right" },
});
