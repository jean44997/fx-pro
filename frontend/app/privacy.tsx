import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBg, GlassCard } from "../src/ui";
import { Colors } from "../src/theme";

export default function PrivacyPolicy() {
  const router = useRouter();
  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="privacy-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Confidentialité</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          <GlassCard>
            <Text style={styles.h}>Données utilisées</Text>
            <Text style={styles.p}>
              FX Pro utilise ton email, ton nom, ton téléphone optionnel, ton QR de paiement, tes soldes, tes transactions
              et tes préférences pour faire fonctionner le compte, les transferts, les reçus et les notifications.
            </Text>
            <Text style={styles.h}>Photos et notifications</Text>
            <Text style={styles.p}>
              La photo de profil est stockée dans Firebase Storage. Les tokens de notification sont stockés dans Firestore
              uniquement pour envoyer les alertes de transaction à ton appareil.
            </Text>
            <Text style={styles.h}>Sécurité</Text>
            <Text style={styles.p}>
              {"L'accès au compte passe par Firebase Authentication. Les règles Firestore et Storage limitent l'accès aux données de l'utilisateur connecté."}
            </Text>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  h: { color: Colors.cyan, fontSize: 13, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginTop: 14 },
  p: { color: Colors.textSoft, fontSize: 14, lineHeight: 21, marginTop: 8 },
});
