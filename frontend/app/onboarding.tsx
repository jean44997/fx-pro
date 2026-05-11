import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Dimensions, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, PrimaryButton, GhostButton } from "../src/ui";
import { Colors } from "../src/theme";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

const W = Dimensions.get("window").width;

const SLIDES = [
  {
    icon: "swap-horizontal" as const,
    title: "Conversion en temps réel",
    desc: "Taux EUR ↔ FCFA + 9 devises mondiales, mis à jour en direct.",
    color: Colors.cyan,
  },
  {
    icon: "send" as const,
    title: "Transferts instantanés",
    desc: "Envoyez de l’argent à un email ou scannez un QR code en 1 seconde.",
    color: Colors.magenta,
  },
  {
    icon: "shield-checkmark" as const,
    title: "Sécurité 2026",
    desc: "JWT + Google Auth, notifications et reçus signés pour chaque transaction.",
    color: Colors.green,
  },
];

export default function Onboarding() {
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();

  const next = () => {
    if (page < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (page + 1) * W, animated: true });
      setPage(page + 1);
    } else {
      router.replace("/(auth)/login");
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.skipRow}>
          <Pressable testID="skip-onboarding" onPress={() => router.replace("/(auth)/login")} hitSlop={12}>
            <Text style={styles.skip}>Passer</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
        >
          {SLIDES.map((s, i) => (
            <View key={i} style={{ width: W, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
              <Animated.View entering={FadeIn.delay(100).duration(600)} style={[styles.iconCircle, { shadowColor: s.color, borderColor: s.color }]}>
                <Ionicons name={s.icon} size={80} color={s.color} />
              </Animated.View>
              <Animated.Text entering={FadeInRight.delay(200)} style={styles.h1}>{s.title}</Animated.Text>
              <Animated.Text entering={FadeInRight.delay(300)} style={styles.desc}>{s.desc}</Animated.Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, page === i && styles.dotActive]} />
          ))}
        </View>
        <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
          <PrimaryButton
            testID="onboarding-next"
            title={page === SLIDES.length - 1 ? "Commencer" : "Suivant"}
            onPress={next}
          />
          <GhostButton testID="onboarding-signin" title="J'ai déjà un compte" onPress={() => router.replace("/(auth)/login")} />
        </View>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  skipRow: { width: "100%", alignItems: "flex-end", padding: 20 },
  skip: { color: Colors.textSoft, fontSize: 14, fontWeight: "600" },
  iconCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    shadowOpacity: 0.7,
    shadowRadius: 30,
    marginBottom: 40,
  },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", textAlign: "center", letterSpacing: -0.5 },
  desc: { color: Colors.textSoft, fontSize: 15, textAlign: "center", marginTop: 12, lineHeight: 22, paddingHorizontal: 8 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.2)" },
  dotActive: { width: 28, backgroundColor: Colors.cyan, shadowColor: Colors.cyan, shadowOpacity: 0.8, shadowRadius: 8 },
});
