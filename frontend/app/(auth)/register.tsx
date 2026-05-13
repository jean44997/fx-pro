import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, PrimaryButton, GlassCard } from "../../src/ui";
import { Colors } from "../../src/theme";
import { useAuth } from "../../src/auth";
import { showAlert } from "../../src/platformAlert";
import { requestWebInstallPermissions } from "../../src/webPermissions";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !pwd || !name) return showAlert("Champs requis", "Nom, email et mot de passe requis");
    if (pwd.length < 6) return showAlert("Mot de passe", "Minimum 6 caractères");
    if (Platform.OS === "web") requestWebInstallPermissions().catch(() => {});
    setLoading(true);
    try {
      await register(email.trim(), pwd, name.trim(), phone.trim());
      router.replace("/(tabs)/home");
    } catch (e: any) {
      showAlert("Erreur", e.message || "Inscription échouée");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 40 }} keyboardShouldPersistTaps="handled">
            <Pressable testID="back-btn" onPress={() => router.back()} style={{ marginBottom: 16 }} hitSlop={12}>
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            <Animated.View entering={FadeIn.duration(500)}>
              <Text style={styles.title}>Créer un compte</Text>
              <Text style={styles.sub}>+100 € et +50 000 FCFA offerts pour démarrer</Text>
            </Animated.View>

            <GlassCard style={{ marginTop: 30, marginHorizontal: 0 }}>
              <Animated.View entering={FadeInDown.delay(80)}>
                <Text style={styles.label}>Nom complet</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="person-outline" size={20} color={Colors.textSoft} />
                  <TextInput testID="reg-name" value={name} onChangeText={setName} placeholder="Jean Dupont" placeholderTextColor={Colors.textMuted} style={styles.input} />
                </View>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(140)}>
                <Text style={[styles.label, { marginTop: 16 }]}>Email</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="mail-outline" size={20} color={Colors.textSoft} />
                  <TextInput testID="reg-email" value={email} onChangeText={setEmail} placeholder="vous@email.com" placeholderTextColor={Colors.textMuted} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
                </View>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(200)}>
                <Text style={[styles.label, { marginTop: 16 }]}>Téléphone (optionnel)</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="call-outline" size={20} color={Colors.textSoft} />
                  <TextInput testID="reg-phone" value={phone} onChangeText={setPhone} placeholder="+221 77 000 0000" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" style={styles.input} />
                </View>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(260)}>
                <Text style={[styles.label, { marginTop: 16 }]}>Mot de passe</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textSoft} />
                  <TextInput testID="reg-password" value={pwd} onChangeText={setPwd} placeholder="••••••••" placeholderTextColor={Colors.textMuted} secureTextEntry style={styles.input} />
                </View>
              </Animated.View>
              <PrimaryButton testID="reg-submit" title="Créer le compte" onPress={submit} loading={loading} />
            </GlassCard>

            <Pressable testID="goto-login" onPress={() => router.replace("/(auth)/login")} style={{ marginTop: 24, alignItems: "center" }}>
              <Text style={{ color: Colors.textSoft }}>
                Déjà inscrit ? <Text style={{ color: Colors.cyan, fontWeight: "800" }}>Se connecter</Text>
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  title: { color: "#fff", fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  sub: { color: Colors.textSoft, fontSize: 14, marginTop: 6 },
  label: { color: Colors.textSoft, fontSize: 12, marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" },
  inputRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.18)", paddingBottom: 6, gap: 10 },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 10 },
});
