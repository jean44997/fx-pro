import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton } from "../src/ui";
import { Colors } from "../src/theme";
import { api } from "../src/auth";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChangePassword() {
  const router = useRouter();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async () => {
    if (!oldPw || !newPw) return Alert.alert("Champs requis");
    if (newPw.length < 6) return Alert.alert("Mot de passe", "Minimum 6 caractères");
    if (newPw !== confirm) return Alert.alert("Confirmation", "Les deux mots de passe ne correspondent pas");
    setLoading(true);
    try {
      await api.post("/profile/change-password", { old_password: oldPw, new_password: newPw });
      Alert.alert("✅ Succès", "Mot de passe modifié avec succès", [{ text: "OK", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.top}>
            <Pressable testID="cp-back" onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="arrow-back" size={26} color="#fff" />
            </Pressable>
            <Text style={styles.title}>Changer le mot de passe</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <GlassCard>
              <Text style={styles.lbl}>Ancien mot de passe</Text>
              <View style={styles.row}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textSoft} />
                <TextInput testID="cp-old" value={oldPw} onChangeText={setOldPw} secureTextEntry={!show} style={styles.input} placeholder="••••••••" placeholderTextColor={Colors.textMuted} />
              </View>
              <Text style={[styles.lbl, { marginTop: 16 }]}>Nouveau mot de passe</Text>
              <View style={styles.row}>
                <Ionicons name="key-outline" size={18} color={Colors.textSoft} />
                <TextInput testID="cp-new" value={newPw} onChangeText={setNewPw} secureTextEntry={!show} style={styles.input} placeholder="Min 6 caractères" placeholderTextColor={Colors.textMuted} />
              </View>
              <Text style={[styles.lbl, { marginTop: 16 }]}>Confirmer</Text>
              <View style={styles.row}>
                <Ionicons name="checkmark-outline" size={18} color={Colors.textSoft} />
                <TextInput testID="cp-confirm" value={confirm} onChangeText={setConfirm} secureTextEntry={!show} style={styles.input} placeholder="Retapez le mot de passe" placeholderTextColor={Colors.textMuted} />
              </View>
              <Pressable testID="cp-toggle" onPress={() => setShow(!show)} style={{ alignSelf: "flex-end", marginTop: 8, padding: 6 }}>
                <Text style={{ color: Colors.cyan, fontSize: 12 }}>{show ? "Masquer" : "Afficher"}</Text>
              </Pressable>
              <PrimaryButton testID="cp-submit" title="Mettre à jour" loading={loading} onPress={submit} />
            </GlassCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  lbl: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.18)", paddingBottom: 6 },
  input: { flex: 1, color: "#fff", fontSize: 16, paddingVertical: 10 },
});
