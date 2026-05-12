import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, PrimaryButton, GhostButton } from "../src/ui";
import { Colors } from "../src/theme";
import { api } from "../src/auth";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  // Camera not available on web — guard imports
  const camMod = require("expo-camera");
  CameraView = camMod.CameraView;
  useCameraPermissions = camMod.useCameraPermissions;
} catch {}

export default function ScanQR() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions ? useCameraPermissions() : [null, async () => {}];
  const [scanned, setScanned] = useState(false);
  const [pasted, setPasted] = useState("");
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    if (!isWeb && useCameraPermissions && !permission?.granted) {
      requestPermission?.();
    }
  }, [permission, isWeb, requestPermission]);

  const handleCode = async (code: string) => {
    if (scanned) return;
    setScanned(true);
    try {
      const r = await api.get(`/qr/lookup?code=${encodeURIComponent(code)}`);
      router.replace({ pathname: "/(tabs)/transfer", params: { qr: code, name: r.name } });
    } catch (e: any) {
      Alert.alert("QR invalide", e.message || "Code introuvable");
      setScanned(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="scan-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Scanner QR</Text>
          <View style={{ width: 26 }} />
        </View>

        {!isWeb && CameraView && permission?.granted ? (
          <View style={styles.cam}>
            <CameraView
              testID="qr-camera"
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={(r: any) => handleCode(r.data)}
            />
            <View pointerEvents="none" style={styles.frame} />
          </View>
        ) : (
          <View style={{ padding: 20 }}>
            <GlassCard>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Caméra indisponible</Text>
              <Text style={{ color: Colors.textSoft, marginTop: 6, fontSize: 13 }}>
                Sur ce navigateur, collez le code QR ci-dessous ou ouvrez l'app sur mobile.
              </Text>
              <TextInput
                testID="qr-paste"
                value={pasted}
                onChangeText={setPasted}
                placeholder="FXPRO:user_xxx:CODE"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                style={styles.input}
              />
              <PrimaryButton testID="qr-paste-submit" title="Valider le code" onPress={() => pasted && handleCode(pasted)} />
              <GhostButton testID="qr-cancel" title="Annuler" onPress={() => router.back()} />
            </GlassCard>
          </View>
        )}
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  cam: { flex: 1, margin: 16, borderRadius: 28, overflow: "hidden", borderWidth: 2, borderColor: Colors.cyan },
  frame: { position: "absolute", top: "20%", left: "10%", right: "10%", bottom: "20%", borderColor: Colors.cyan, borderWidth: 3, borderRadius: 24 },
  input: { color: "#fff", fontSize: 14, padding: 12, marginTop: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.border },
});
