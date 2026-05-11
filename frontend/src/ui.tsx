// Reusable animated UI components
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ViewStyle, TextStyle, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors } from "./theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GradientBg({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <LinearGradient
        colors={["#1a0030", "#050505", "#001a1a"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <GlowOrb top={-80} left={-60} color="rgba(157,76,221,0.35)" size={220} />
      <GlowOrb top={120} left={220} color="rgba(0,255,255,0.20)" size={180} delay={400} />
      <GlowOrb top={500} left={-40} color="rgba(255,0,127,0.18)" size={200} delay={800} />
      {children}
    </View>
  );
}

export function GlowOrb({ top, left, color, size, delay = 0 }: any) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withDelay(delay, withRepeat(withTiming(1.2, { duration: 4000, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [delay, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", top, left, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        st,
      ]}
    />
  );
}

export function GlassCard({
  children,
  style,
  intensity = 30,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  intensity?: number;
  testID?: string;
}) {
  return (
    <Animated.View entering={FadeInUp.duration(500).springify()} style={[styles.glassWrap, style]} testID={testID}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.glass, borderRadius: 20 }]} />
      <View style={{ padding: 16 }}>{children}</View>
    </Animated.View>
  );
}

export function NeoCard({ children, style, color = Colors.cyan, testID }: any) {
  return (
    <Animated.View entering={FadeInDown.duration(450).springify()} style={[styles.neoCard, { shadowColor: color }, style]} testID={testID}>
      {children}
    </Animated.View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  testID,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const s = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      testID={testID}
      onPressIn={() => {
        s.value = withSpring(0.95);
      }}
      onPressOut={() => {
        s.value = withSpring(1);
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      disabled={disabled || loading}
      style={[styles.primaryBtn, disabled ? { opacity: 0.5 } : null, style, st]}
    >
      <LinearGradient colors={["#00FFFF", "#9D4CDD"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {loading ? (
        <ActivityIndicator color="#000" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon}
          <Text style={styles.primaryBtnText}>{title}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

export function GhostButton({ title, onPress, testID, icon, style }: any) {
  const s = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      testID={testID}
      onPressIn={() => (s.value = withSpring(0.95))}
      onPressOut={() => (s.value = withSpring(1))}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.ghostBtn, style, st]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {icon}
        <Text style={styles.ghostBtnText}>{title}</Text>
      </View>
    </AnimatedPressable>
  );
}

export function Pulse({ children, color = Colors.cyan }: any) {
  const s = useSharedValue(0.7);
  useEffect(() => {
    s.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [s]);
  const st = useAnimatedStyle(() => ({ opacity: s.value }));
  return <Animated.View style={[{ shadowColor: color, shadowOpacity: 0.8, shadowRadius: 12 }, st]}>{children}</Animated.View>;
}

export function ScreenTitle({ title, subtitle, testID }: { title: string; subtitle?: string; testID?: string }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }} testID={testID}>
      <Text style={styles.h1}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glassWrap: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  neoCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.borderStrong,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 0,
    elevation: 6,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginVertical: 6,
  },
  primaryBtnText: { color: "#000", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  ghostBtn: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginVertical: 6,
  },
  ghostBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  h1: { color: Colors.text, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  sub: { color: Colors.textSoft, fontSize: 14, marginTop: 4 },
});
