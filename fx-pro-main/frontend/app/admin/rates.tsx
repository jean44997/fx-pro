import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton, GhostButton } from "../../src/ui";
import { Colors, CURRENCIES } from "../../src/theme";
import { api } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AdminRates() {
  const router = useRouter();
  const [rates, setRates] = useState<Record<string, string>>({});
  const [source, setSource] = useState<string>("live");

  const load = async () => {
    try {
      const r = await api.get("/rates");
      const obj: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.rates)) obj[k] = String(v);
      setRates(obj);
      setSource(r.source || "live");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(rates)) {
      const n = parseFloat(String(v).replace(",", "."));
      if (!n || n <= 0) return Alert.alert("Valeur invalide", `${k}: ${v}`);
      parsed[k] = n;
    }
    try {
      await api.put("/rates/override", { base: "EUR", rates: parsed });
      Alert.alert("OK", "Taux personnalisés enregistrés");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const refreshLive = async () => {
    try {
      await api.post("/rates/refresh", {});
      Alert.alert("OK", "Taux actualisés depuis l'API");
      load();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="adm-rates-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Taux de change</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <GlassCard>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.sectionLabel}>Source actuelle</Text>
              <Text style={{ color: source === "admin" ? Colors.yellow : Colors.green, fontWeight: "900" }}>{source.toUpperCase()}</Text>
            </View>
            <Text style={{ color: Colors.textSoft, marginTop: 8, fontSize: 13 }}>
              Base: 1 EUR = ... Modifiez les valeurs pour définir des taux personnalisés.
            </Text>
          </GlassCard>

          <GlassCard>
            {CURRENCIES.filter((c) => c.code !== "EUR").map((c) => (
              <View key={c.code} style={styles.row}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                  <Text style={{ color: "#fff", fontWeight: "800" }}>{c.code}</Text>
                </View>
                <TextInput
                  testID={`rate-input-${c.code}`}
                  value={rates[c.code] || ""}
                  onChangeText={(v) => setRates({ ...rates, [c.code]: v })}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
            ))}
          </GlassCard>

          <View style={{ paddingHorizontal: 16 }}>
            <PrimaryButton testID="adm-save-rates" title="Enregistrer les taux personnalisés" onPress={save} icon={<Ionicons name="save" size={16} color="#000" />} />
            <GhostButton testID="adm-refresh-live" title="Réinitialiser avec l'API live" icon={<Ionicons name="refresh" size={16} color="#fff" />} onPress={refreshLive} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sectionLabel: { color: Colors.cyan, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  input: { color: "#fff", fontSize: 16, fontWeight: "800", fontFamily: "monospace", textAlign: "right", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.border, minWidth: 110 },
});
