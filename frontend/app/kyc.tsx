import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton } from "../src/ui";
import { Colors } from "../src/theme";
import { useAuth, api } from "../src/auth";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

export default function KYC() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.patch("/profile", { kyc_status: "verified" });
      await refresh();
      Alert.alert("Bravo !", "Votre compte est maintenant vérifié.");
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
          <Text style={styles.title}>Vérification KYC</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          <GlassCard>
            <View style={{ alignItems: "center", padding: 12 }}>
              <Ionicons name="shield-checkmark" size={64} color={user?.kyc_status === "verified" ? Colors.green : Colors.yellow} />
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 12 }}>
                Statut: {user?.kyc_status === "verified" ? "Vérifié" : "En attente"}
              </Text>
              <Text style={{ color: Colors.textSoft, marginTop: 8, textAlign: "center", fontSize: 13 }}>
                Une vérification KYC simulée pour la démo. En production, vous téléchargeriez votre pièce d'identité.
              </Text>
            </View>
            {user?.kyc_status !== "verified" && (
              <PrimaryButton testID="kyc-verify" title="Vérifier maintenant (démo)" loading={submitting} onPress={submit} />
            )}
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
});
