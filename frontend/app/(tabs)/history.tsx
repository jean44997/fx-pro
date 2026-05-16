import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, useWindowDimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInRight } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBg, GlassCard } from "../../src/ui";
import { Colors, formatMoney } from "../../src/theme";
import { useAuth, api } from "../../src/auth";

type HistoryFilter = "all" | "transfer" | "convert" | "cash" | "vault" | "bonus" | "admin";

const FILTERS: { key: HistoryFilter; label: string; icon: any }[] = [
  { key: "all", label: "Tout", icon: "apps" },
  { key: "transfer", label: "Transferts", icon: "paper-plane" },
  { key: "convert", label: "Conversions", icon: "swap-horizontal" },
  { key: "cash", label: "Depot/Retrait", icon: "cash" },
  { key: "vault", label: "Coffre", icon: "lock-closed" },
  { key: "bonus", label: "Bonus", icon: "gift" },
  { key: "admin", label: "Admin", icon: "shield-checkmark" },
];

export default function History() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/transactions");
      setItems(Array.isArray(r.items) ? r.items : []);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = useMemo(() => items.filter((t) => {
    if (filter === "all") return true;
    if (filter === "admin") return t.type === "admin_credit" || t.type === "admin_debit";
    if (filter === "cash") return t.type === "deposit" || t.type === "withdraw";
    if (filter === "vault") return t.type === "vault_lock" || t.type === "vault_withdraw";
    if (filter === "bonus") return t.type === "bonus_credit";
    return t.type === filter;
  }), [filter, items]);

  const summary = useMemo(() => {
    let received = 0;
    let sent = 0;
    items.forEach((t) => {
      if (t.type === "transfer" && t.receiver_id === user?.user_id) received += 1;
      if (t.type === "transfer" && t.sender_id === user?.user_id) sent += 1;
    });
    return { received, sent };
  }, [items, user?.user_id]);

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Historique</Text>
            <Text style={styles.subtitle}>
              {filtered.length} sur {items.length} transactions
            </Text>
          </View>
          <View style={[styles.summaryBox, compact && styles.summaryBoxCompact]}>
            <SummaryPill label="Recus" value={summary.received} color={Colors.green} />
            <SummaryPill label="Envoyes" value={summary.sent} color={Colors.danger} />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
          style={styles.filterScroll}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable key={f.key} testID={`filter-${f.key}`} onPress={() => setFilter(f.key)} style={[styles.chip, active && styles.chipActive]}>
                <Ionicons name={f.icon} size={14} color={active ? "#000" : Colors.textSoft} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
        >
          {filtered.length === 0 ? (
            <GlassCard>
              <View style={styles.emptyState}>
                <Ionicons name="receipt-outline" size={28} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Aucune transaction</Text>
                <Text style={styles.emptyText}>Tirez vers le bas pour synchroniser l'historique.</Text>
              </View>
            </GlassCard>
          ) : (
            filtered.map((t, i) => (
              <TxnItem
                key={t.txn_id || `${t.type}-${i}`}
                t={t}
                index={i}
                userId={user?.user_id}
                onPress={() => router.push({ pathname: "/receipt/[id]", params: { id: t.txn_id } })}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

function TxnItem({ t, index, userId, onPress }: any) {
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const visual = getTransactionVisual(t, userId);
  const txId = String(t.txn_id || "");

  return (
    <Animated.View entering={FadeInRight.delay(Math.min(index, 12) * 24)}>
      <Pressable testID={`txn-${txId}`} onPress={onPress} disabled={!txId}>
        <GlassCard style={styles.txnCard}>
          <View style={[styles.txnTop, compact && styles.txnTopCompact]}>
            <View style={styles.txnIdentity}>
              <View style={[styles.iconWrap, { borderColor: visual.color, shadowColor: visual.color }]}>
                <Ionicons name={visual.icon} size={21} color={visual.color} />
              </View>
              <View style={styles.txnCopy}>
                <Text style={styles.txnTitle} numberOfLines={compact ? 2 : 1}>{visual.label}</Text>
                <Text style={styles.txnSub} numberOfLines={1}>{visual.detail}</Text>
              </View>
            </View>
            <View style={[styles.amountWrap, compact && styles.amountWrapCompact]}>
              <Text style={[styles.amountText, { color: visual.color }]} adjustsFontSizeToFit numberOfLines={1}>
                {visual.amountText}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <MetaPill icon="calendar-outline" text={formatTxnDate(t.created_at)} />
            <MetaPill icon="radio-button-on" text={statusLabel(t.status)} color={statusColor(t.status)} />
            {txId ? <MetaPill icon="finger-print" text={shortId(txId)} /> : null}
          </View>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

function MetaPill({ icon, text, color = Colors.textMuted }: { icon: any; text: string; color?: string }) {
  return (
    <View style={styles.metaPill}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.metaText, { color }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function getTransactionVisual(t: any, userId?: string) {
  let icon: any = "swap-horizontal";
  let color = Colors.cyan;
  let label = "Transaction";
  let detail = typeLabel(t.type);
  let amountText = "";

  if (t.type === "convert") {
    icon = "swap-horizontal";
    color = Colors.cyan;
    label = `${t.from_currency || ""} -> ${t.to_currency || ""}`.trim();
    detail = "Conversion multidevise";
    amountText = `${formatMoney(Number(t.amount || 0), t.from_currency)} -> ${formatMoney(Number(t.received || 0), t.to_currency)}`;
  } else if (t.type === "transfer") {
    const sent = t.sender_id === userId;
    icon = sent ? "arrow-up" : "arrow-down";
    color = sent ? Colors.danger : Colors.green;
    label = sent ? `Envoye a ${safeParty(t.receiver_email)}` : `Recu de ${safeParty(t.sender_email)}`;
    detail = sent ? "Transfert sortant" : "Transfert entrant";
    amountText = `${sent ? "-" : "+"}${formatMoney(Number(t.amount || 0), t.currency)}`;
  } else if (t.type === "admin_credit") {
    icon = "trending-up";
    color = Colors.green;
    label = "Credit admin";
    detail = safeParty(t.reference || "Ajustement securise");
    amountText = `+${formatMoney(Number(t.amount || 0), t.currency)}`;
  } else if (t.type === "admin_debit") {
    icon = "trending-down";
    color = Colors.danger;
    label = "Debit admin";
    detail = safeParty(t.reference || "Ajustement securise");
    amountText = `-${formatMoney(Number(t.amount || 0), t.currency)}`;
  } else if (t.type === "deposit") {
    icon = "add-circle";
    color = Colors.green;
    label = "Depot";
    detail = safeParty(t.reference || t.method || "Recharge portefeuille");
    amountText = `+${formatMoney(Number(t.amount || 0), t.currency)}`;
  } else if (t.type === "withdraw") {
    icon = "cash-outline";
    color = Colors.yellow;
    label = "Retrait";
    detail = safeParty(t.reference || t.method || "Sortie portefeuille");
    amountText = `-${formatMoney(Number(t.amount || 0), t.currency)}`;
  } else if (t.type === "vault_lock") {
    icon = "lock-closed";
    color = Colors.purple;
    label = "Coffre verrouille";
    detail = "Montant archive dans le coffre";
    amountText = `-${formatMoney(Number(t.amount || 0), t.currency)}`;
  } else if (t.type === "vault_withdraw") {
    icon = "lock-open";
    color = Colors.green;
    label = "Retrait coffre";
    detail = "Montant remis dans le portefeuille";
    amountText = `+${formatMoney(Number(t.amount || 0), t.currency)}`;
  } else if (t.type === "bonus_credit") {
    icon = "gift";
    color = Colors.cyan;
    label = "Bonus credite";
    detail = safeParty(t.reference || "Programme bonus");
    amountText = `+${formatMoney(Number(t.amount || 0), t.currency)}`;
  }

  return { icon, color, label, detail, amountText };
}

function safeParty(value?: string) {
  return value ? String(value) : "utilisateur";
}

function typeLabel(type?: string) {
  return String(type || "operation").replace(/_/g, " ");
}

function statusLabel(status?: string) {
  if (status === "pending") return "En traitement";
  if (status === "failed") return "Echec";
  if (status === "cancelled") return "Annule";
  return "Confirme";
}

function statusColor(status?: string) {
  if (status === "pending") return Colors.yellow;
  if (status === "failed" || status === "cancelled") return Colors.danger;
  return Colors.green;
}

function formatTxnDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function shortId(value: string) {
  return value.length > 10 ? `ID ${value.slice(-10)}` : `ID ${value}`;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900" },
  subtitle: { color: Colors.textSoft, marginTop: 4, fontSize: 13 },
  summaryBox: { flexDirection: "row", gap: 8, flexShrink: 0 },
  summaryBoxCompact: { flexDirection: "column", gap: 6 },
  summaryPill: { minWidth: 66, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 10, paddingVertical: 8 },
  summaryLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  summaryValue: { fontSize: 16, fontWeight: "900", marginTop: 2 },
  filterScroll: { flexGrow: 0, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 4 },
  chip: { minHeight: 36, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: "rgba(255,255,255,0.04)", flexDirection: "row", alignItems: "center", gap: 6 },
  chipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.45, shadowRadius: 10 },
  chipText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: "#000", fontWeight: "900" },
  listContent: { paddingBottom: 140, paddingTop: 2 },
  emptyState: { alignItems: "center", paddingVertical: 22 },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "900", marginTop: 10 },
  emptyText: { color: Colors.textSoft, fontSize: 12, textAlign: "center", marginTop: 4 },
  txnCard: { marginVertical: 6 },
  txnTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  txnTopCompact: { alignItems: "stretch", flexDirection: "column" },
  txnIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  txnCopy: { flex: 1, minWidth: 0 },
  txnTitle: { color: "#fff", fontWeight: "900", fontSize: 14, lineHeight: 19 },
  txnSub: { color: Colors.textSoft, fontSize: 12, marginTop: 3 },
  amountWrap: { maxWidth: 148, alignItems: "flex-end", borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.045)" },
  amountWrapCompact: { maxWidth: "100%", alignSelf: "stretch", alignItems: "flex-start" },
  amountText: { fontWeight: "900", fontSize: 13, fontFamily: "monospace" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 26, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.035)" },
  metaText: { fontSize: 10, fontWeight: "800" },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5, shadowOpacity: 0.45, shadowRadius: 10, backgroundColor: "rgba(255,255,255,0.05)" },
});
