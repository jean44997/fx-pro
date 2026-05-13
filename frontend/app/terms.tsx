import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBg, GlassCard } from "../src/ui";
import { Colors } from "../src/theme";

export default function Terms() {
  const router = useRouter();
  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="terms-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Conditions</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          <GlassCard>
            <Text style={styles.h}>Utilisation</Text>
            <Text style={styles.p}>
              {"L'utilisateur doit fournir des informations exactes et garder ses identifiants confidentiels. Toute opération validée depuis le compte est considérée comme initiée par son titulaire."}
            </Text>
            <Text style={styles.h}>Transferts</Text>
            <Text style={styles.p}>
              Un transfert ne peut être envoyé que si le solde disponible couvre le montant choisi. Les reçus et historiques
              affichent les informations utiles à la vérification de chaque opération.
            </Text>
            <Text style={styles.h}>Disponibilité</Text>
            <Text style={styles.p}>
              {"Les services web, notifications et fonctions Firebase peuvent dépendre du réseau, des permissions de l'appareil et des services Firebase activés dans le projet."}
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
