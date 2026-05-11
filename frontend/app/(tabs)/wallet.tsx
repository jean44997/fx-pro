import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { GradientBg, GlassCard } from "../../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../../src/theme";
import { useAuth } from "../../src/auth";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Wallet() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}>
          <View style={{ padding: 20 }}>
            <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>Portefeuille</Text>
            <Text style={{ color: Colors.textSoft, marginTop: 4 }}>Vos soldes multi-devises</Text>
          </View>
          {CURRENCIES.map((c, i) => {
            const v = (user?.balances || {})[c.code] || 0;
            return (
              <Animated.View key={c.code} entering={FadeInUp.delay(i * 40)}>
                <GlassCard testID={`balance-${c.code}`}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <View style={[styles.flagWrap, { borderColor: Colors.cyan }]}>
                        <Text style={{ fontSize: 28 }}>{c.flag}</Text>
                      </View>
                      <View>
                        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>{c.code}</Text>
                        <Text style={{ color: Colors.textSoft, fontSize: 12 }}>{c.name}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900", fontFamily: "monospace" }}>{formatMoney(v, c.code)}</Text>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                        <Pressable
                          testID={`convert-${c.code}`}
                          onPress={() => router.push({ pathname: "/convert", params: { from: c.code } })}
                          style={styles.action}
                        >
                          <Ionicons name="swap-horizontal" size={14} color={Colors.cyan} />
                          <Text style={styles.actionText}>Convertir</Text>
                        </Pressable>
                        <Pressable
                          testID={`send-${c.code}`}
                          onPress={() => router.push({ pathname: "/(tabs)/transfer", params: { currency: c.code } })}
                          style={styles.action}
                        >
                          <Ionicons name="paper-plane" size={14} color={Colors.magenta} />
                          <Text style={styles.actionText}>Envoyer</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </GlassCard>
              </Animated.View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

const styles = StyleSheet.create({
  flagWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,255,255,0.06)",
    borderWidth: 1.5,
  },
  action: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
