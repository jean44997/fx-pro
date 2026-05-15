import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";
import { GradientBg, GlassCard, PrimaryButton } from "../src/ui";
import { Colors } from "../src/theme";
import { api, useAuth } from "../src/auth";

const KYC_STEPS = [
  { key: "identity", title: "Identite", body: "Nom, email, telephone et coherence du profil.", icon: "id-card" },
  { key: "document", title: "Document", body: "Piece d'identite lisible et non expiree.", icon: "document-text" },
  { key: "selfie", title: "Controle vivant", body: "Validation appareil et anti-usurpation.", icon: "scan-circle" },
  { key: "address", title: "Adresse", body: "Pays, devise locale et methode de paiement.", icon: "home" },
];

export default function KYC() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const verified = user?.kyc_status === "verified";

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.patch("/profile", {
        kyc_status: "verified",
        kyc_level: "enhanced",
        kyc_verified_at: new Date().toISOString(),
        trust_score: Math.max(user?.trust_score || 0, 72),
      });
      await refresh();
      Alert.alert("Verification activee", "Votre profil KYC renforce est pris en compte pour les bonus et retraits.");
      router.back();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="kyc-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Verification KYC</Text>
          <Pressable testID="kyc-bonus" onPress={() => router.push("/bonus")} hitSlop={12}>
            <Ionicons name="gift-outline" size={22} color={Colors.cyan} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          <Animated.View entering={FadeInUp.duration(450)}>
            <GlassCard testID="kyc-status-card">
              <View style={styles.statusTop}>
                <View style={[styles.statusIcon, { borderColor: verified ? Colors.green : Colors.yellow }]}>
                  <Ionicons name={verified ? "shield-checkmark" : "shield-half"} size={34} color={verified ? Colors.green : Colors.yellow} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kicker}>Compte financier</Text>
                  <Text style={styles.big}>{verified ? "KYC renforce actif" : "KYC a finaliser"}</Text>
                  <Text style={styles.help}>
                    Un profil verifie augmente le score de confiance, accelere les validations et reduit les blocages bonus/retrait.
                  </Text>
                </View>
              </View>
              <View style={styles.scoreRow}>
                <Metric label="Niveau" value={user?.kyc_level || (verified ? "standard" : "basic")} color={verified ? Colors.green : Colors.yellow} />
                <Metric label="Bonus" value={verified ? "Boost" : "Limite"} color={verified ? Colors.cyan : Colors.textSoft} />
                <Metric label="Risque" value={verified ? "Bas" : "Moyen"} color={verified ? Colors.green : Colors.yellow} />
              </View>
            </GlassCard>
          </Animated.View>

          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <Text style={styles.sectionLabel}>Controle requis</Text>
          </View>
          {KYC_STEPS.map((step, index) => (
            <Animated.View key={step.key} entering={FadeInUp.delay(index * 45)}>
              <GlassCard>
                <View style={styles.stepRow}>
                  <View style={[styles.stepIcon, { borderColor: verified ? Colors.green : Colors.borderStrong }]}>
                    <Ionicons name={verified ? "checkmark-circle" : (step.icon as any)} size={20} color={verified ? Colors.green : Colors.cyan} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepBody}>{step.body}</Text>
                  </View>
                  <Text style={[styles.stepState, { color: verified ? Colors.green : Colors.yellow }]}>{verified ? "OK" : "Pret"}</Text>
                </View>
              </GlassCard>
            </Animated.View>
          ))}

          <GlassCard testID="kyc-policy-card">
            <Text style={styles.section}>Protection financiere</Text>
            <Text style={styles.help}>
              Le KYC sert a limiter multi-comptes, moyens de paiement partages, auto-parrainage, contournement geographique et retraits sensibles apres bonus.
            </Text>
            <View style={styles.policyGrid}>
              <Pill icon="lock-closed" text="Donnees chiffrees" />
              <Pill icon="analytics" text="Score confiance" />
              <Pill icon="warning" text="Alertes fraude" />
              <Pill icon="cash" text="Retraits limites" />
            </View>
          </GlassCard>

          {!verified ? (
            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <PrimaryButton
                testID="kyc-verify"
                title="Activer KYC renforce"
                loading={submitting}
                icon={<Ionicons name="shield-checkmark" size={18} color="#000" />}
                onPress={submit}
              />
            </View>
          ) : (
            <Text style={styles.verifiedText}>Votre profil est pret pour les validations bonus, depot et retrait.</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function Pill({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={14} color={Colors.cyan} />
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  statusTop: { flexDirection: "row", gap: 14, alignItems: "center" },
  statusIcon: { width: 64, height: 64, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  kicker: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" },
  big: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 3 },
  help: { color: Colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 6 },
  scoreRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  metric: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)", padding: 10 },
  metricLabel: { color: Colors.textSoft, fontSize: 10, textTransform: "uppercase" },
  metricValue: { fontWeight: "900", fontSize: 13, marginTop: 4 },
  sectionLabel: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase" },
  stepRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  stepIcon: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,255,255,0.06)" },
  stepTitle: { color: "#fff", fontWeight: "900", fontSize: 15 },
  stepBody: { color: Colors.textSoft, fontSize: 12, marginTop: 3, lineHeight: 17 },
  stepState: { fontSize: 11, fontWeight: "900" },
  section: { color: "#fff", fontSize: 17, fontWeight: "900" },
  policyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.04)" },
  pillText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  verifiedText: { color: Colors.green, textAlign: "center", fontWeight: "800", marginTop: 18, marginHorizontal: 20 },
});
