import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { GradientBg, GlassCard } from "../../src/ui";
import { Colors, formatMoney } from "../../src/theme";
import { useAuth, api } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInRight } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function History() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "transfer" | "convert" | "admin">("all");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/transactions");
      setItems(r.items || []);
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

  const filtered = items.filter((t) => {
    if (filter === "all") return true;
    if (filter === "admin") return t.type === "admin_credit" || t.type === "admin_debit";
    return t.type === filter;
  });

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>Historique</Text>
          <Text style={{ color: Colors.textSoft, marginTop: 4 }}>{items.length} transactions</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          {(["all", "transfer", "convert", "admin"] as const).map((f) => (
            <Pressable key={f} testID={`filter-${f}`} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]}>
              <Text style={[styles.chipText, filter === f && { color: "#000", fontWeight: "900" }]}>
                {f === "all" ? "Tout" : f === "transfer" ? "Transferts" : f === "convert" ? "Conversions" : "Admin"}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}>
          {filtered.length === 0 ? (
            <Text style={{ color: Colors.textSoft, textAlign: "center", marginTop: 60 }}>Aucune transaction</Text>
          ) : (
            filtered.map((t, i) => <TxnItem key={t.txn_id} t={t} index={i} userId={user?.user_id} onPress={() => router.push({ pathname: "/receipt/[id]", params: { id: t.txn_id } })} />)
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function TxnItem({ t, index, userId, onPress }: any) {
  let icon: any = "swap-horizontal";
  let color = Colors.cyan;
  let label = "";
  let amountText = "";

  if (t.type === "convert") {
    icon = "swap-horizontal";
    color = Colors.cyan;
    label = `${t.from_currency} → ${t.to_currency}`;
    amountText = `${formatMoney(t.amount, t.from_currency)} → ${formatMoney(t.received, t.to_currency)}`;
  } else if (t.type === "transfer") {
    const sent = t.sender_id === userId;
    icon = sent ? "arrow-up" : "arrow-down";
    color = sent ? Colors.danger : Colors.green;
    label = sent ? `Envoyé à ${t.receiver_email}` : `Reçu de ${t.sender_email}`;
    amountText = `${sent ? "-" : "+"}${formatMoney(t.amount, t.currency)}`;
  } else if (t.type === "admin_credit") {
    icon = "trending-up";
    color = Colors.green;
    label = "Crédit admin";
    amountText = `+${formatMoney(t.amount, t.currency)}`;
  } else if (t.type === "admin_debit") {
    icon = "trending-down";
    color = Colors.danger;
    label = "Débit admin";
    amountText = `-${formatMoney(t.amount, t.currency)}`;
  }

  return (
    <Animated.View entering={FadeInRight.delay(index * 30)}>
      <Pressable testID={`txn-${t.txn_id}`} onPress={onPress}>
        <GlassCard>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={[styles.iconWrap, { borderColor: color, shadowColor: color }]}>
              <Ionicons name={icon} size={22} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "800" }} numberOfLines={1}>{label}</Text>
              <Text style={{ color: Colors.textSoft, fontSize: 12, marginTop: 2 }}>
                {new Date(t.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
              </Text>
            </View>
            <Text style={{ color, fontWeight: "900", fontSize: 13, fontFamily: "monospace" }}>{amountText}</Text>
          </View>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  chipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  chipText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1.5, shadowOpacity: 0.5, shadowRadius: 10, backgroundColor: "rgba(255,255,255,0.05)" },
});
