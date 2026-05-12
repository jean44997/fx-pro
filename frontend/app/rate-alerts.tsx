import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton } from "../src/ui";
import { Colors, CURRENCIES } from "../src/theme";
import { api } from "../src/auth";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";

export default function RateAlerts() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState("XOF");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");

  const load = async () => {
    try {
      const r = await api.get("/alerts");
      setItems(r.items || []);
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const n = parseFloat(target.replace(",", "."));
    if (!n) return Alert.alert("Taux cible invalide");
    if (from === to) return Alert.alert("Paire invalide");
    try {
      await api.post("/alerts", { from_currency: from, to_currency: to, target_rate: n, direction });
      setTarget("");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const remove = async (id: string) => {
    await api.del(`/alerts/${id}`);
    load();
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="alerts-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Alertes de taux</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <GlassCard testID="add-alert-card">
            <Text style={styles.lbl}>Nouvelle alerte</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <CurrencyChip code={from} onPick={(c) => setFrom(c)} testIDPrefix="alert-from" />
              <Ionicons name="arrow-forward" size={20} color={Colors.textSoft} style={{ alignSelf: "center" }} />
              <CurrencyChip code={to} onPick={(c) => setTo(c)} testIDPrefix="alert-to" />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable testID="dir-above" onPress={() => setDirection("above")} style={[styles.dir, direction === "above" && styles.dirActive]}>
                <Ionicons name="trending-up" size={14} color={direction === "above" ? "#000" : Colors.green} />
                <Text style={[styles.dirText, direction === "above" && { color: "#000" }]}>Au-dessus</Text>
              </Pressable>
              <Pressable testID="dir-below" onPress={() => setDirection("below")} style={[styles.dir, direction === "below" && styles.dirActive]}>
                <Ionicons name="trending-down" size={14} color={direction === "below" ? "#000" : Colors.danger} />
                <Text style={[styles.dirText, direction === "below" && { color: "#000" }]}>En dessous</Text>
              </Pressable>
            </View>
            <TextInput
              testID="alert-target"
              value={target}
              onChangeText={setTarget}
              placeholder={`Ex: 660 (pour 1 ${from} = 660 ${to})`}
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <PrimaryButton testID="alert-add" title="Créer l'alerte" onPress={add} />
          </GlassCard>

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <Text style={styles.lbl}>Mes alertes ({items.length})</Text>
          </View>
          {items.length === 0 ? (
            <Text style={{ color: Colors.textSoft, textAlign: "center", marginTop: 20 }}>Aucune alerte</Text>
          ) : (
            items.map((a, i) => (
              <Animated.View key={a.alert_id} entering={FadeIn.delay(i * 40)}>
                <GlassCard>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontWeight: "800" }}>{a.from_currency} → {a.to_currency}</Text>
                      <Text style={{ color: Colors.textSoft, marginTop: 4, fontSize: 12 }}>
                        {a.direction === "above" ? "Au-dessus de" : "En dessous de"} {a.target_rate}
                      </Text>
                    </View>
                    <Pressable testID={`alert-del-${a.alert_id}`} onPress={() => remove(a.alert_id)} style={styles.delBtn}>
                      <Ionicons name="trash" size={18} color={Colors.danger} />
                    </Pressable>
                  </View>
                </GlassCard>
              </Animated.View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

type Currency = (typeof CURRENCIES)[number];

type CurrencyChipProps = {
  code: string;
  onPick: (code: string) => void;
  testIDPrefix: string;
};

function CurrencyChip({ code, onPick, testIDPrefix }: CurrencyChipProps) {
  const [open, setOpen] = useState(false);
  const meta = CURRENCIES.find((c: Currency) => c.code === code) || CURRENCIES[0];
  return (
    <View style={{ flex: 1 }}>
      <Pressable testID={`${testIDPrefix}-toggle`} onPress={() => setOpen(!open)} style={styles.chip}>
        <Text style={{ fontSize: 18 }}>{meta.flag}</Text>
        <Text style={{ color: "#fff", fontWeight: "800" }}>{meta.code}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSoft} />
      </Pressable>
      {open && (
        <View style={styles.drop}>
          <ScrollView style={{ maxHeight: 200 }}>
            {CURRENCIES.map((c: Currency) => (
              <Pressable
                key={c.code}
                testID={`${testIDPrefix}-${c.code}`}
                onPress={() => { onPick(c.code); setOpen(false); }}
                style={styles.dropItem}
              >
                <Text style={{ fontSize: 16 }}>{c.flag}</Text>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{c.code}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  lbl: { color: Colors.textSoft, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" },
  input: { color: "#fff", fontSize: 16, padding: 12, marginTop: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.border },
  chip: { flexDirection: "row", gap: 6, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.border, justifyContent: "center" },
  drop: { position: "absolute", top: 50, left: 0, right: 0, backgroundColor: "#0c0c14", borderRadius: 12, borderWidth: 1, borderColor: Colors.border, zIndex: 10, padding: 4 },
  dropItem: { flexDirection: "row", gap: 8, alignItems: "center", padding: 10 },
  dir: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)" },
  dirActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  dirText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  delBtn: { padding: 10, borderRadius: 10, backgroundColor: "rgba(255,59,92,0.1)", borderWidth: 1, borderColor: "rgba(255,59,92,0.3)" },
});
