import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { verifyBiometricLogin } from "../src/biometricAuth";
import { GradientBg } from "../src/ui";
import { Colors } from "../src/theme";
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";

export default function Index() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const rot = useSharedValue(0);

  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration: 4000, easing: Easing.linear }), -1, false);
  }, [rot]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(async () => {
      if (!user) router.replace("/onboarding");
      else {
        const unlocked = await verifyBiometricLogin().catch(() => false);
        if (!unlocked) {
          await logout();
          router.replace("/(auth)/login");
        } else if (user.role === "admin") router.replace("/admin");
        else router.replace("/(tabs)/home");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [loading, user, router, logout]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));

  return (
    <GradientBg>
      <View style={styles.center}>
        <Animated.View entering={FadeIn.duration(500)} style={styles.logoWrap}>
          <Animated.View style={[styles.ring, ringStyle]} />
          <View style={styles.coin}>
            <Text style={styles.logoText}>€</Text>
          </View>
        </Animated.View>
        <Text style={styles.brand} testID="splash-brand">FX PRO 2026</Text>
        <Text style={styles.tagline}>Conversion · Transfert · Temps réel</Text>
        <ActivityIndicator color={Colors.cyan} style={{ marginTop: 24 }} />
      </View>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoWrap: { width: 140, height: 140, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: Colors.cyan,
    borderTopColor: "transparent",
    borderRightColor: Colors.magenta,
  },
  coin: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#0a0a14",
    borderWidth: 2,
    borderColor: Colors.cyan,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.cyan,
    shadowOpacity: 0.6,
    shadowRadius: 24,
  },
  logoText: { color: Colors.cyan, fontSize: 56, fontWeight: "900" },
  brand: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: 2, marginTop: 28 },
  tagline: { color: Colors.textSoft, marginTop: 6, fontSize: 13, letterSpacing: 1 },
});
