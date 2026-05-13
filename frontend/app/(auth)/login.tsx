import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, PrimaryButton, GhostButton, GlassCard } from "../../src/ui";
import { Colors } from "../../src/theme";
import { isFirebaseDirectMode, useAuth } from "../../src/auth";
import { showAlert } from "../../src/platformAlert";
import { requestWebInstallPermissions } from "../../src/webPermissions";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Login() {
  const router = useRouter();
  const { login, loginGoogle, user } = useAuth();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.role === "admin") router.replace("/admin");
      else router.replace("/(tabs)/home");
    }
  }, [user, router]);

  const handleLogin = async () => {
    if (!email || !pwd) return showAlert("Champs requis", "Email et mot de passe requis");
    if (Platform.OS === "web") await requestWebInstallPermissions().catch(() => false);
    setLoading(true);
    try {
      await login(email.trim(), pwd);
    } catch (e: any) {
      showAlert("Erreur", e.message || "Échec de la connexion");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGLoading(true);
    try {
      if (Platform.OS === "web") await requestWebInstallPermissions().catch(() => false);
      if (Platform.OS === "web" && isFirebaseDirectMode) {
        await loginGoogle("");
        return;
      }
      const redirect = Platform.OS === "web" ? `${window.location.origin}/` : Linking.createURL("/");
      const url = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
      if (Platform.OS === "web") {
        window.location.href = url;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(url, redirect);
      if (result.type === "success" && result.url) {
        const m = result.url.match(/session_id=([^&]+)/);
        if (m && m[1]) {
          await loginGoogle(m[1]);
        }
      }
    } catch (e: any) {
      showAlert("Erreur", e.message || "Échec Google");
    } finally {
      setGLoading(false);
    }
  };

  // Web fallback: detect session_id on mount (Emergent redirect)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (m && m[1]) {
      (async () => {
        try {
          setGLoading(true);
          await loginGoogle(m[1]);
          window.history.replaceState({}, "", window.location.pathname);
        } catch (e: any) {
          showAlert("Erreur Google", e.message || "");
        } finally {
          setGLoading(false);
        }
      })();
    }
  }, [loginGoogle]);

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 40 }} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeIn.duration(500)}>
              <Text style={styles.brand}>FX PRO</Text>
              <Text style={styles.title}>Bon retour 👋</Text>
              <Text style={styles.sub}>Connectez-vous pour continuer vos transactions</Text>
            </Animated.View>

            <GlassCard style={{ marginTop: 30, marginHorizontal: 0 }}>
              <Animated.View entering={FadeInDown.delay(100)}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="mail-outline" size={20} color={Colors.textSoft} />
                  <TextInput
                    testID="login-email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="vous@email.com"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={styles.input}
                  />
                </View>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(200)}>
                <Text style={[styles.label, { marginTop: 16 }]}>Mot de passe</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textSoft} />
                  <TextInput
                    testID="login-password"
                    value={pwd}
                    onChangeText={setPwd}
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry
                    style={styles.input}
                  />
                </View>
              </Animated.View>
              <PrimaryButton testID="login-submit" title="Se connecter" onPress={handleLogin} loading={loading} />
              <GhostButton
                testID="login-google"
                title={gLoading ? "Connexion Google..." : "Continuer avec Google"}
                icon={<Ionicons name="logo-google" size={18} color="#fff" />}
                onPress={handleGoogle}
              />
            </GlassCard>

            <Pressable testID="goto-register" onPress={() => router.push("/(auth)/register")} style={{ marginTop: 24, alignItems: "center" }}>
              <Text style={styles.signup}>
                Pas de compte ? <Text style={{ color: Colors.cyan, fontWeight: "800" }}>Créer un compte</Text>
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  brand: { color: Colors.cyan, fontSize: 14, fontWeight: "900", letterSpacing: 4 },
  title: { color: "#fff", fontSize: 32, fontWeight: "900", marginTop: 8, letterSpacing: -0.5 },
  sub: { color: Colors.textSoft, fontSize: 14, marginTop: 6 },
  label: { color: Colors.textSoft, fontSize: 12, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(255,255,255,0.18)",
    paddingBottom: 6,
    gap: 10,
  },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 10 },
  signup: { color: Colors.textSoft, fontSize: 14 },
});
