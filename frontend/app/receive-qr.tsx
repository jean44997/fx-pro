import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, GhostButton } from "../src/ui";
import { Colors } from "../src/theme";
import { useAuth, api } from "../src/auth";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";

export default function ReceiveQR() {
  const router = useRouter();
  const { user } = useAuth();
  const [code, setCode] = useState<string>("");

  useEffect(() => {
    api.get("/qr/me").then((r) => setCode(r.qr_code)).catch(() => {});
  }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    Alert.alert("Copié", "Code QR copié dans le presse-papier");
  };
  const copyEmail = async () => {
    if (user?.email) {
      await Clipboard.setStringAsync(user.email);
      Alert.alert("Copié", "Email copié");
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="qr-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Recevoir</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.sub}>{"Demandez à l'expéditeur de scanner ce QR code pour vous envoyer de l'argent."}</Text>
          <Animated.View entering={FadeIn.duration(500)} style={styles.qrWrap}>
            <View style={styles.qrInner}>
              {code ? <QRCode value={code} size={220} backgroundColor="#ffffff" color="#000000" /> : null}
            </View>
            <Text style={styles.qrCode} testID="qr-code-text" selectable>{code || "..."}</Text>
          </Animated.View>

          <GlassCard testID="qr-user-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={styles.avatar}>
                <Text style={{ color: Colors.cyan, fontSize: 22, fontWeight: "900" }}>{(user?.name || "?").charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{user?.name}</Text>
                <Text style={{ color: Colors.textSoft, fontSize: 12 }}>{user?.email}</Text>
              </View>
            </View>
          </GlassCard>

          <View style={{ paddingHorizontal: 0, marginTop: 10 }}>
            <GhostButton testID="copy-qr" title="Copier le code QR" icon={<Ionicons name="copy" size={16} color="#fff" />} onPress={copy} />
            <GhostButton testID="copy-email" title="Copier mon email" icon={<Ionicons name="mail" size={16} color="#fff" />} onPress={copyEmail} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sub: { color: Colors.textSoft, fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
  qrWrap: { alignItems: "center", marginVertical: 30 },
  qrInner: { backgroundColor: "#fff", padding: 20, borderRadius: 24, shadowColor: Colors.cyan, shadowOpacity: 0.8, shadowRadius: 24 },
  qrCode: { color: Colors.cyan, marginTop: 16, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,255,255,0.08)", borderWidth: 1.5, borderColor: Colors.cyan },
});
