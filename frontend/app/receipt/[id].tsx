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
    const html = buildReceiptHtml(t);
    const fileName = `fxpro-recu-${t.txn_id}.html`;
    try {
      if (Platform.OS === "web") {
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const uri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: "Recu FX Pro", mimeType: "text/html" });
      else await Share.share({ message: buildReceiptText(t), title: "Recu FX Pro" });
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

  const primary = getPrimaryAmount(t);
  const shopStats = t.type === "shop_purchase" ? getShopStats(t) : null;

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
              <View style={styles.amountHero}>
                <Text style={styles.amountLabel}>Montant principal</Text>
                <Text style={styles.amountValue} adjustsFontSizeToFit numberOfLines={1}>{primary}</Text>
                <View style={[styles.statusPill, { borderColor: t.status === "completed" ? Colors.green : Colors.yellow }]}>
                  <Ionicons name={t.status === "completed" ? "shield-checkmark" : "hourglass"} size={14} color={t.status === "completed" ? Colors.green : Colors.yellow} />
                  <Text style={styles.statusPillText}>{statusLabel(t.status)}</Text>
                </View>
              </View>
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
              {t.type === "shop_purchase" && (
                <>
                  <Row label="Commande" value={t.reference || t.shop_order_id || t.txn_id} />
                  <Row label="Total boutique" value={formatMoney(Number(t.order_total || t.amount || 0), t.order_currency || t.currency)} highlight />
                  <Row label="Portefeuille debite" value={formatMoney(Number(t.amount || 0), t.currency)} />
                  <Row label="Articles" value={`${t.item_count || t.items?.length || 0} article(s)`} />
                  <Row label="Retrait" value="Agence FX Pro partenaire" />
                </>
              )}
              <Row label="Statut" value={statusLabel(t.status)} />
              <Row label="Date" value={new Date(t.created_at).toLocaleString("fr-FR")} />
            </NeoCard>
          </Animated.View>

          {shopStats ? (
            <Animated.View entering={FadeInDown.delay(240)} style={styles.shopStats}>
              <ReceiptStat icon="cube-outline" label="Articles" value={shopStats.items} color={Colors.cyan} />
              <ReceiptStat icon="pricetag-outline" label="Economies" value={shopStats.savings} color={Colors.yellow} />
              <ReceiptStat icon="storefront-outline" label="Retrait" value={shopStats.pickup} color={Colors.green} />
            </Animated.View>
          ) : null}

          {t.type === "shop_purchase" && Array.isArray(t.items) ? (
            <Animated.View entering={FadeInDown.delay(300)} style={styles.receiptItems}>
              <Text style={styles.receiptItemsTitle}>Articles commandes</Text>
              {t.items.slice(0, 10).map((item: any) => (
                <View key={`${item.product_id}-${item.title}`} style={styles.receiptItemLine}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.receiptItemTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.receiptItemSub}>{item.sku || item.ref || item.category || "Produit boutique"} x {item.quantity}</Text>
                  </View>
                  <Text style={styles.receiptItemAmount}>{formatMoney(Number(item.line_total || 0), t.order_currency || t.currency)}</Text>
                </View>
              ))}
            </Animated.View>
          ) : null}

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
    shop_purchase: "Achat boutique",
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

function getPrimaryAmount(t: any) {
  if (t.type === "convert") return formatMoney(t.received || 0, t.to_currency || t.currency || "EUR");
  if (t.type === "shop_purchase") return formatMoney(t.order_total || t.amount || 0, t.order_currency || t.currency || "EUR");
  return formatMoney(t.amount || 0, t.currency || t.from_currency || "EUR");
}

function getShopStats(t: any) {
  const itemCount = Number(t.item_count || t.items?.reduce?.((sum: number, item: any) => sum + Number(item.quantity || 0), 0) || 0);
  return {
    items: `${itemCount}`,
    savings: formatMoney(Number(t.discount_total || 0), t.order_currency || t.currency || "EUR"),
    pickup: t.pickup_status === "ready" ? "Pret" : t.pickup_status === "picked_up" ? "Livre" : "Agence",
  };
}

function ReceiptStat({ icon, label, value, color }: any) {
  return (
    <View style={styles.receiptStat}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={styles.receiptStatLabel}>{label}</Text>
      <Text style={styles.receiptStatValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function buildReceiptText(t: any) {
  const lines = [
    "FX PRO 2026 - RECU SECURISE",
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
  } else if (t.type === "shop_purchase") {
    lines.push(`Commande: ${t.reference || t.shop_order_id || ""}`);
    lines.push(`Total boutique: ${formatMoney(t.order_total || t.amount || 0, t.order_currency || t.currency)}`);
    lines.push(`Portefeuille debite: ${formatMoney(t.amount || 0, t.currency)}`);
    lines.push(`Economies: ${formatMoney(t.discount_total || 0, t.order_currency || t.currency)}`);
    lines.push(`Articles: ${t.item_count || t.items?.length || 0}`);
    if (Array.isArray(t.items)) {
      t.items.slice(0, 8).forEach((item: any) => lines.push(`- ${item.quantity} x ${item.title}`));
    }
    lines.push("Retrait: agence FX Pro partenaire");
  }
  lines.push(`Signature: FXP-${String(t.txn_id || "").slice(-10).toUpperCase()}`);
  return lines.join("\n");
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function receiptRows(t: any) {
  const rows = [
    ["ID transaction", t.txn_id],
    ["Reference", t.reference || t.txn_id],
    ["Type", typeLabel(t.type)],
    ["Statut", statusLabel(t.status)],
    ["Date", new Date(t.created_at).toLocaleString("fr-FR")],
  ];
  if (t.type === "transfer") {
    rows.push(["De", t.sender_email || ""], ["Vers", t.receiver_email || ""]);
    if (t.note) rows.push(["Note", t.note]);
  } else if (t.type === "convert") {
    rows.push(["De", formatMoney(t.amount, t.from_currency)], ["Vers", formatMoney(t.received, t.to_currency)], ["Taux", `1 ${t.from_currency} = ${t.rate?.toFixed(6)} ${t.to_currency}`]);
  } else if (t.type === "deposit" || t.type === "withdraw") {
    rows.push(["Methode", methodLabel(t.method)], [t.type === "deposit" ? "Source" : "Destination", t.account_ref || ""], ["Frais", formatMoney(t.fees || 0, t.currency)]);
  } else if (t.type === "bonus_credit") {
    rows.push(["Bonus", t.bonus_id || ""], ["Reference bonus", t.reference || ""]);
  } else if (t.type === "shop_purchase") {
    rows.push(
      ["Commande", t.reference || t.shop_order_id || ""],
      ["Total boutique", formatMoney(t.order_total || t.amount || 0, t.order_currency || t.currency)],
      ["Portefeuille debite", formatMoney(t.amount || 0, t.currency)],
      ["Economies", formatMoney(t.discount_total || 0, t.order_currency || t.currency)],
      ["Articles", `${t.item_count || t.items?.length || 0}`],
      ["Retrait", "Agence FX Pro partenaire"],
      ["Signature prix", t.price_snapshot_hash || "Recalculee"]
    );
  }
  return rows;
}

function buildReceiptHtml(t: any) {
  const rows = receiptRows(t)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const statusColor = t.status === "completed" ? "#39FF14" : "#FFD700";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Recu FX Pro ${escapeHtml(t.txn_id)}</title>
  <style>
    body{margin:0;background:#050505;color:#fff;font-family:Inter,Arial,sans-serif;padding:24px}
    .receipt{max-width:680px;margin:0 auto;background:#111118;border:1px solid rgba(255,255,255,.16);border-radius:22px;overflow:hidden;box-shadow:0 20px 80px rgba(0,255,255,.12)}
    .head{padding:28px;background:linear-gradient(135deg,rgba(0,255,255,.18),rgba(157,76,221,.22));border-bottom:1px solid rgba(255,255,255,.12)}
    .brand{font-size:13px;letter-spacing:2px;color:#A1A1AA;text-transform:uppercase;font-weight:800}
    h1{margin:8px 0 0;font-size:30px;line-height:1.08}
    .amount{margin-top:18px;font-size:34px;font-weight:900;color:#00FFFF;word-break:break-word}
    .pill{display:inline-flex;margin-top:14px;border:1px solid ${statusColor};color:${statusColor};border-radius:999px;padding:8px 12px;font-size:12px;font-weight:900}
    table{width:100%;border-collapse:collapse}
    th,td{padding:15px 18px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
    th{text-align:left;color:#A1A1AA;text-transform:uppercase;letter-spacing:1px;font-size:11px;width:38%}
    td{text-align:right;font-weight:800;word-break:break-word}
    .foot{padding:18px;color:#6b6b75;font-size:12px;line-height:1.5}
    .sig{color:#00FFFF;font-weight:900}
  </style>
</head>
<body>
  <main class="receipt">
    <section class="head">
      <div class="brand">FX Pro 2026</div>
      <h1>Recu de transaction</h1>
      <div class="amount">${escapeHtml(getPrimaryAmount(t))}</div>
      <div class="pill">${escapeHtml(statusLabel(t.status))}</div>
    </section>
    <table>${rows}</table>
    <section class="foot">
      Document genere automatiquement. Verifiez toujours l'ID transaction avant partage.<br />
      <span class="sig">Signature FXP-${escapeHtml(String(t.txn_id || "").slice(-10).toUpperCase())}</span>
    </section>
  </main>
</body>
</html>`;
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
  amountHero: { alignItems: "center", paddingVertical: 12, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  amountLabel: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: "800" },
  amountValue: { color: Colors.cyan, fontSize: 30, fontWeight: "900", marginTop: 6, maxWidth: "100%" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  statusPillText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  shopStats: { flexDirection: "row", gap: 8, marginTop: 12 },
  receiptStat: { flex: 1, minHeight: 74, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 11, backgroundColor: "rgba(255,255,255,0.055)" },
  receiptStatLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", marginTop: 6 },
  receiptStatValue: { color: "#fff", fontSize: 13, fontWeight: "900", marginTop: 4 },
  receiptItems: { marginTop: 12, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", padding: 14 },
  receiptItemsTitle: { color: "#fff", fontSize: 15, fontWeight: "900", marginBottom: 8 },
  receiptItemLine: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  receiptItemTitle: { color: "#fff", fontSize: 12, fontWeight: "900" },
  receiptItemSub: { color: Colors.textMuted, fontSize: 10, marginTop: 3 },
  receiptItemAmount: { color: Colors.cyan, fontSize: 12, fontWeight: "900" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  rLbl: { color: Colors.textSoft, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", width: 112, flexShrink: 0 },
  rVal: { color: "#fff", fontWeight: "700", flex: 1, minWidth: 0, textAlign: "right" },
});
