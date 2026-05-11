import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, GhostButton } from "../src/ui";
import { Colors } from "../src/theme";
import { useAuth } from "../src/auth";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Settings() {
  const router = useRouter();
  const { user, logout, refresh } = useAuth();
  const [notif, setNotif] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [hideBal, setHideBal] = useState(false);

  useEffect(() => {
    (async () => {
      const n = await AsyncStorage.getItem("pref_notif");
      const b = await AsyncStorage.getItem("pref_biometric");
      const h = await AsyncStorage.getItem("pref_hideBal");
      if (n !== null) setNotif(n === "1");
      if (b !== null) setBiometric(b === "1");
      if (h !== null) setHideBal(h === "1");
    })();
  }, []);

  const save = async (k: string, v: boolean) => {
    await AsyncStorage.setItem(k, v ? "1" : "0");
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="settings-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Paramètres</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <GlassCard testID="settings-account">
            <Text style={styles.sectionLabel}>Compte</Text>
            <Row icon="person" label="Nom" value={user?.name || ""} />
            <Row icon="mail" label="Email" value={user?.email || ""} />
            <Row icon="call" label="Téléphone" value={user?.phone || "—"} />
            <Row icon="key" label="Méthode" value={user?.auth_provider === "google" ? "Google" : "Mot de passe"} />
          </GlassCard>

          <GlassCard>
            <Text style={styles.sectionLabel}>Préférences</Text>
            <SwitchRow testID="pref-notif" icon="notifications" label="Notifications push" value={notif} onChange={(v) => { setNotif(v); save("pref_notif", v); }} />
            <SwitchRow testID="pref-biometric" icon="finger-print" label="Verrouillage biométrique" value={biometric} onChange={(v) => { setBiometric(v); save("pref_biometric", v); }} />
            <SwitchRow testID="pref-hide-bal" icon="eye-off" label="Masquer les soldes" value={hideBal} onChange={(v) => { setHideBal(v); save("pref_hideBal", v); }} />
          </GlassCard>

          <GlassCard>
            <Text style={styles.sectionLabel}>Sécurité & Légal</Text>
            <NavRow icon="shield-checkmark" label="KYC" onPress={() => router.push("/kyc")} testID="nav-kyc" />
            <NavRow icon="document-text" label="Conditions d'utilisation" onPress={() => Alert.alert("CGU", "© FX Pro 2026")} testID="nav-cgu" />
            <NavRow icon="lock-closed" label="Politique de confidentialité" onPress={() => Alert.alert("Privacy", "Vos données sont protégées.")} testID="nav-privacy" />
          </GlassCard>

          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <GhostButton
              testID="settings-logout"
              title="Se déconnecter"
              icon={<Ionicons name="log-out-outline" size={16} color={Colors.danger} />}
              onPress={() => {
                Alert.alert("Déconnexion", "Confirmer ?", [
                  { text: "Annuler", style: "cancel" },
                  { text: "OK", style: "destructive", onPress: async () => { await logout(); router.replace("/(auth)/login"); } },
                ]);
              }}
            />
          </View>
          <Text style={{ color: Colors.textMuted, textAlign: "center", marginTop: 16, fontSize: 11 }}>FX Pro 2026 · Build {Platform.OS}</Text>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function Row({ icon, label, value }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={Colors.cyan} />
      <Text style={{ color: Colors.textSoft, flex: 1, marginLeft: 12, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SwitchRow({ icon, label, value, onChange, testID }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={Colors.cyan} />
      <Text style={{ color: "#fff", flex: 1, marginLeft: 12, fontWeight: "700" }}>{label}</Text>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ false: "#333", true: Colors.cyan }} thumbColor="#fff" />
    </View>
  );
}

function NavRow({ icon, label, onPress, testID }: any) {
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={18} color={Colors.cyan} />
      <Text style={{ color: "#fff", flex: 1, marginLeft: 12, fontWeight: "700" }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sectionLabel: { color: Colors.cyan, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
});
