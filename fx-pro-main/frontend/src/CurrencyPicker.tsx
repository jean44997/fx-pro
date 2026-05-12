// CurrencyPickerModal — replaces buggy dropdown (rendered above everything via Modal)
import React, { useState } from "react";
import { Modal, View, Text, StyleSheet, Pressable, TextInput, FlatList } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Colors, CURRENCIES, currencyMeta } from "./theme";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";

export function CurrencyPickerButton({
  code,
  onChange,
  testID,
  compact,
}: {
  code: string;
  onChange: (c: string) => void;
  testID?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const m = currencyMeta(code);
  return (
    <>
      <Pressable testID={testID} onPress={() => setOpen(true)} style={[styles.btn, compact && styles.btnCompact]}>
        <Text style={{ fontSize: compact ? 18 : 22 }}>{m.flag}</Text>
        <Text style={[styles.btnText, compact && { fontSize: 14 }]}>{m.code}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSoft} />
      </Pressable>
      <CurrencyPickerModal open={open} onClose={() => setOpen(false)} onPick={(c) => { onChange(c); setOpen(false); }} testID={testID} />
    </>
  );
}

export function CurrencyPickerModal({
  open,
  onClose,
  onPick,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (code: string) => void;
  testID?: string;
}) {
  const [q, setQ] = useState("");
  const data = CURRENCIES.filter(
    (c) => c.code.toLowerCase().includes(q.toLowerCase()) || c.name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={SlideInDown.duration(280).springify()} style={styles.sheet}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,20,0.92)" }]} />
          <View style={styles.handle} />
          <Text style={styles.title}>Choisir une devise</Text>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={Colors.textSoft} />
            <TextInput
              testID={`${testID}-search`}
              value={q}
              onChangeText={setQ}
              placeholder="Rechercher (EUR, dollar, etc)"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              style={styles.search}
            />
          </View>
          <FlatList
            data={data}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable testID={`${testID}-pick-${item.code}`} onPress={() => onPick(item.code)} style={styles.row}>
                <Text style={{ fontSize: 26 }}>{item.flag}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{item.code}</Text>
                  <Text style={{ color: Colors.textSoft, fontSize: 12 }}>{item.name}</Text>
                </View>
                <Text style={{ color: Colors.cyan, fontWeight: "700" }}>{item.symbol}</Text>
              </Pressable>
            )}
            style={{ maxHeight: 480 }}
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    paddingBottom: 24,
    paddingTop: 12,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", marginBottom: 8 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 16, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  search: { flex: 1, color: "#fff", fontSize: 14 },
  row: { flexDirection: "row", gap: 14, alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  btn: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: Colors.border },
  btnCompact: { paddingHorizontal: 10, paddingVertical: 6, gap: 5 },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
