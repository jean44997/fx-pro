import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { GradientBg, GlassCard } from "../src/ui";
import { Colors } from "../src/theme";

const FAQ = [
  {
    q: "Pourquoi mon depot reste en attente ?",
    a: "Un depot doit etre valide avec sa reference avant de crediter le solde. Cela evite les credits frauduleux ou doubles.",
  },
  {
    q: "Pourquoi un retrait reserve mon solde ?",
    a: "La reserve empeche d'utiliser deux fois les memes fonds pendant que la demande de retrait est traitee.",
  },
  {
    q: "Je ne recois pas les notifications hors app.",
    a: "Active les notifications, ouvre l'app une fois apres connexion, puis garde HTTPS/PWA installee sur iOS. Sur mobile natif, le token push est enregistre apres autorisation.",
  },
  {
    q: "Comment scanner un QR ?",
    a: "Ouvre Envoyer, choisis QR Code, autorise la camera, scanne le QR du receveur, puis saisis seulement le montant.",
  },
  {
    q: "Comment partager un recu ?",
    a: "Ouvre le recu depuis l'historique, puis utilise Partager ou Telecharger. Chaque recu contient un ID de transaction et une reference si disponible.",
  },
  {
    q: "Que faire si la photo de profil echoue ?",
    a: "Choisis une image plus legere et verifie que les regles Firebase Storage sont deployees.",
  },
];

export default function Help() {
  const router = useRouter();
  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="help-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Aide & FAQ</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          <GlassCard>
            <Text style={styles.hero}>{"Centre d'aide FX Pro"}</Text>
            <Text style={styles.copy}>
              {"Transferts, depots, retraits, coffre, reçus, QR et notifications. Gardez toujours vos references de transaction."}
            </Text>
          </GlassCard>
          {FAQ.map((item) => (
            <GlassCard key={item.q}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Ionicons name="help-circle" size={20} color={Colors.cyan} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.q}>{item.q}</Text>
                  <Text style={styles.a}>{item.a}</Text>
                </View>
              </View>
            </GlassCard>
          ))}
          <GlassCard>
            <Text style={styles.q}>Support</Text>
            <Text style={styles.a}>Email: support@fxpro.com</Text>
            <Text style={styles.a}>{"Inclure l'ID transaction, la reference depot/retrait et une capture si besoin."}</Text>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  hero: { color: "#fff", fontSize: 20, fontWeight: "900" },
  copy: { color: Colors.textSoft, fontSize: 14, lineHeight: 21, marginTop: 8 },
  q: { color: "#fff", fontWeight: "900", fontSize: 15 },
  a: { color: Colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 6 },
});
