import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Image, Platform, TextInput, Modal, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard, GhostButton, PrimaryButton } from "../../src/ui";
import { Colors } from "../../src/theme";
import { useAuth, api } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import * as Haptics from "expo-haptics";

export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const isFxAdmin = String(user?.email || "").toLowerCase() === "fxpro@gmail.com";

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission refusée", "Autorisez l'accès aux photos dans les paramètres.");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.18,
      base64: true,
      exif: false,
    });
    const asset = res.canceled ? null : res.assets[0];
    if (asset?.base64) {
      if (asset.base64.length > 1900000) {
        return Alert.alert("Photo trop lourde", "Choisissez une image plus légère pour le profil.");
      }
      const mimeType = asset.mimeType || "image/jpeg";
      const picture = `data:${mimeType};base64,${asset.base64}`;
      try {
        setPhotoSaving(true);
        await api.patch("/profile", { picture });
        await refresh();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (e: any) {
        Alert.alert("Erreur", e.message);
      } finally {
        setPhotoSaving(false);
      }
    }
  };

  const removePhoto = async () => {
    try {
      setPhotoSaving(true);
      await api.patch("/profile", { picture: null });
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setPhotoSaving(false);
    }
  };

  const openPhotoActions = () => {
    if (!user?.picture) {
      pickPhoto();
      return;
    }
    Alert.alert("Photo de profil", "Remplacer ou supprimer la photo actuelle.", [
      { text: "Remplacer", onPress: pickPhoto },
      { text: "Supprimer", style: "destructive", onPress: removePhoto },
      { text: "Annuler", style: "cancel" },
    ]);
  };

  const testBiometric = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Biométrie", "Disponible uniquement sur mobile (iOS/Android)");
      return;
    }
    const hw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hw || !enrolled) {
      return Alert.alert("Biométrie", "Aucune empreinte/Face ID configurée sur l'appareil.");
    }
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authentifiez-vous avec votre empreinte ou Face ID",
      cancelLabel: "Annuler",
      disableDeviceFallback: false,
    });
    if (r.success) Alert.alert("✅ Authentifié", "Identification biométrique réussie");
    else Alert.alert("Échec", "Authentification annulée ou échouée");
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch("/profile", { name, phone });
      await refresh();
      setEditing(false);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnexion",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const items: { icon: any; label: string; route?: any; testID: string; onPress?: () => void; color?: string }[] = [
    ...(isFxAdmin ? [{ icon: "shield", label: "Administration FX Pro", route: "/admin", testID: "menu-admin", color: Colors.cyan }] : []),
    { icon: "lock-closed", label: "🔒 Coffre d'épargne", route: "/vault", testID: "menu-vault", color: Colors.purple },
    { icon: "add-circle", label: "Depot d'argent", route: "/deposit", testID: "menu-deposit", color: Colors.green },
    { icon: "cash", label: "Retrait d'argent", route: "/withdraw", testID: "menu-withdraw", color: Colors.yellow },
    { icon: "bag-handle", label: "Boutique en ligne", route: "/shop", testID: "menu-shop", color: Colors.orange },
    { icon: "card", label: "Cartes cadeaux", route: "/gift-cards", testID: "menu-gift-cards", color: Colors.green },
    { icon: "film", label: "Films & series", route: "/movies", testID: "menu-movies", color: Colors.orange },
    { icon: "game-controller", label: "Jeux bonus", route: "/games", testID: "menu-games", color: Colors.green },
    { icon: "gift", label: "Bonus premier depot", route: "/bonus", testID: "menu-bonus", color: Colors.yellow },
    { icon: "qr-code", label: "Mon QR Code", route: "/receive-qr", testID: "menu-qr" },
    { icon: "key", label: "Changer le mot de passe", route: "/change-password", testID: "menu-password" },
    { icon: "finger-print", label: "Tester biométrie / Face ID", testID: "menu-biometric", onPress: testBiometric },
    { icon: "notifications", label: "Notifications", route: "/notifications", testID: "menu-notif" },
    { icon: "alert-circle", label: "Alertes de taux", route: "/rate-alerts", testID: "menu-alerts" },
    { icon: "settings", label: "Paramètres", route: "/settings", testID: "menu-settings" },
    { icon: "shield-checkmark", label: "Statut KYC", route: "/kyc", testID: "menu-kyc" },
    { icon: "help-circle", label: "Aide & FAQ", route: "/help", testID: "menu-help" },
  ];

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
          <Animated.View entering={FadeInUp.duration(500)} style={{ alignItems: "center", padding: 24 }}>
            <Pressable testID="profile-photo" onPress={openPhotoActions} disabled={photoSaving} style={styles.avatarWrap}>
              {photoSaving ? (
                <ActivityIndicator color={Colors.cyan} />
              ) : user?.picture ? (
                <Image source={{ uri: user.picture }} style={styles.avatarImg} />
              ) : (
                <Text style={{ color: Colors.cyan, fontSize: 36, fontWeight: "900" }}>
                  {(user?.name || "?").charAt(0).toUpperCase()}
                </Text>
              )}
              <View style={styles.cam}>
                <Ionicons name="camera" size={14} color="#000" />
              </View>
            </Pressable>
            <View style={styles.photoActions}>
              <Pressable testID="change-photo" onPress={pickPhoto} disabled={photoSaving} style={styles.photoActionBtn}>
                <Ionicons name="image-outline" size={14} color={Colors.cyan} />
                <Text style={styles.photoActionText}>{user?.picture ? "Changer" : "Ajouter une photo"}</Text>
              </Pressable>
              {user?.picture ? (
                <Pressable testID="remove-photo" onPress={removePhoto} disabled={photoSaving} style={[styles.photoActionBtn, styles.photoDeleteBtn]}>
                  <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                  <Text style={[styles.photoActionText, { color: Colors.danger }]}>Supprimer</Text>
                </Pressable>
              ) : null}
            </View>
            <Text testID="profile-name" style={{ color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 14 }}>{user?.name}</Text>
            <Text style={{ color: Colors.textSoft, marginTop: 4 }}>{user?.email}</Text>
            {user?.phone ? <Text style={{ color: Colors.textSoft, fontSize: 12, marginTop: 2 }}>📞 {user.phone}</Text> : null}
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={12} color={user?.kyc_status === "verified" ? Colors.green : Colors.yellow} />
              <Text style={[styles.badgeText, { color: user?.kyc_status === "verified" ? Colors.green : Colors.yellow }]}>
                KYC {user?.kyc_status === "verified" ? "vérifié" : "en attente"}
              </Text>
            </View>
            <Pressable testID="edit-profile" onPress={() => setEditing(true)} style={styles.editBtn}>
              <Ionicons name="create-outline" size={14} color={Colors.cyan} />
              <Text style={{ color: Colors.cyan, fontWeight: "800", fontSize: 12 }}>Modifier le profil</Text>
            </Pressable>
          </Animated.View>

          {items.map((it, i) => (
            <Animated.View key={it.label} entering={FadeInUp.delay(i * 40)}>
              <Pressable testID={it.testID} onPress={() => (it.onPress ? it.onPress() : router.push(it.route))}>
                <GlassCard>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <View style={[styles.iconBox, it.color && { borderColor: it.color, shadowColor: it.color }]}>
                      <Ionicons name={it.icon} size={20} color={it.color || Colors.cyan} />
                    </View>
                    <Text style={{ color: "#fff", flex: 1, fontWeight: "700", fontSize: 15 }}>{it.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color={Colors.textSoft} />
                  </View>
                </GlassCard>
              </Pressable>
            </Animated.View>
          ))}

          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <GhostButton testID="logout-btn" title="Se déconnecter" icon={<Ionicons name="log-out-outline" size={16} color={Colors.danger} />} onPress={confirmLogout} />
            <Text style={{ color: Colors.textMuted, textAlign: "center", marginTop: 18, fontSize: 11 }}>FX Pro 2026 · v1.1.0</Text>
          </View>
        </ScrollView>

        {/* Edit modal */}
        <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
          <Animated.View entering={FadeIn} style={styles.modalBg}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(false)} />
            <View style={styles.editModal}>
              <View style={styles.handle} />
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 16 }}>Modifier le profil</Text>
              <Text style={styles.lbl}>Nom</Text>
              <TextInput testID="edit-name" value={name} onChangeText={setName} style={styles.modalInput} placeholderTextColor={Colors.textMuted} />
              <Text style={[styles.lbl, { marginTop: 14 }]}>Téléphone</Text>
              <TextInput testID="edit-phone" value={phone} onChangeText={setPhone} style={styles.modalInput} keyboardType="phone-pad" placeholderTextColor={Colors.textMuted} />
              <PrimaryButton testID="save-profile" title="Enregistrer" loading={saving} onPress={saveProfile} />
              <GhostButton title="Annuler" onPress={() => setEditing(false)} />
            </View>
          </Animated.View>
        </Modal>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,255,255,0.08)", borderWidth: 2, borderColor: Colors.cyan,
    shadowColor: Colors.cyan, shadowOpacity: 0.6, shadowRadius: 18, overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  cam: { position: "absolute", bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cyan, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#050505" },
  photoActions: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 12 },
  photoActionBtn: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(0,255,255,0.08)", borderWidth: 1, borderColor: Colors.cyan },
  photoDeleteBtn: { backgroundColor: "rgba(255,70,100,0.08)", borderColor: Colors.danger },
  photoActionText: { color: Colors.cyan, fontWeight: "800", fontSize: 12 },
  badge: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.border },
  badgeText: { fontSize: 11, fontWeight: "800" },
  editBtn: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(0,255,255,0.08)", borderWidth: 1, borderColor: Colors.cyan },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,255,255,0.08)", borderWidth: 1, borderColor: Colors.border, shadowOpacity: 0.4, shadowRadius: 8 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  editModal: { backgroundColor: "#0a0a14", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, borderWidth: 1, borderColor: Colors.border },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", marginBottom: 12 },
  lbl: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  modalInput: { color: "#fff", fontSize: 16, paddingVertical: 10, borderBottomWidth: 1.5, borderBottomColor: "rgba(255,255,255,0.18)", marginTop: 4 },
});
