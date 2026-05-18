import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { GradientBg, GlassCard, GhostButton, PrimaryButton } from "../src/ui";
import { api, useAuth } from "../src/auth";
import { Colors, formatMoney } from "../src/theme";

type GameItem = {
  id: string;
  name: string;
  win_chance: number;
  min_prize: number;
  max_prize: number;
};

const GAME_LOOK: Record<string, { icon: any; color: string; label: string }> = {
  scratch: { icon: "sparkles", color: Colors.cyan, label: "Gratte la carte au bon moment" },
  vault: { icon: "cube", color: Colors.yellow, label: "Ouvre le coffre sans forcer" },
  reflex: { icon: "flash", color: Colors.green, label: "Reflexe rapide, gain rapide" },
};

export default function GamesScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.04, { duration: 900 }), withTiming(1, { duration: 900 })), -1, true);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const columns = width >= 860 ? 3 : width >= 620 ? 2 : 1;
  const cardWidth = `${100 / columns}%`;
  const games: GameItem[] = status?.games || [];

  const totals = useMemo<{ plays: number; wins: number; prizes: number }>(() => {
    const stats = (status?.stats || {}) as Record<string, any>;
    return Object.values(stats).reduce(
      (acc, item: any) => ({
        plays: acc.plays + Number(item?.plays || 0),
        wins: acc.wins + Number(item?.wins || 0),
        prizes: acc.prizes + Number(item?.prizes || 0),
      }),
      { plays: 0, wins: 0, prizes: 0 }
    );
  }, [status]);

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.get("/games/status");
      setStatus(data);
    } catch (e: any) {
      Alert.alert("Jeux indisponibles", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const play = async (gameId: string) => {
    if (!status?.tickets) {
      Alert.alert("Tickets epuises", "Les tickets bonus seront recharges automatiquement. Reviens apres la recharge.");
      return;
    }
    try {
      setPlaying(gameId);
      const res = await api.post("/games/play", { game_id: gameId });
      setResult({ ...res, game: games.find((g) => g.id === gameId) });
      setStatus((prev: any) => ({ ...prev, tickets: res.tickets, balances: res.balances || prev?.balances }));
      await refresh();
      if (res.won) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      load().catch(() => undefined);
    } catch (e: any) {
      Alert.alert("Jeu bloque", e.message);
    } finally {
      setPlaying(null);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Pressable testID="games-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={Colors.cyan} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>PROFIL FX PRO</Text>
              <Text testID="games-title" style={styles.title}>Jeux bonus</Text>
            </View>
            <Animated.View style={[styles.ticketBubble, pulseStyle]}>
              <Ionicons name="ticket" size={18} color="#000" />
              <Text testID="game-ticket-count" style={styles.ticketText}>{loading ? "..." : status?.tickets ?? 0}</Text>
            </Animated.View>
          </View>

          <GlassCard style={styles.notice}>
            <View style={styles.noticeRow}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.green} />
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>Tickets gratuits, credit en live</Text>
                <Text style={styles.noticeBody}>
                  Les tickets se rechargent automatiquement une fois par jour. Si une notification de recharge a deja ete envoyee aujourd'hui, elle ne sera pas renvoyee.
                </Text>
              </View>
            </View>
          </GlassCard>

          <View style={styles.statsRow}>
            <MiniStat label="Parties" value={totals.plays} color={Colors.cyan} />
            <MiniStat label="Gains" value={totals.wins} color={Colors.green} />
            <MiniStat label="Credit" value={formatMoney(totals.prizes || 0, "XOF")} color={Colors.yellow} />
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.cyan} />
              <Text style={{ color: Colors.textSoft, marginTop: 10 }}>Chargement des jeux...</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {games.map((game, index) => (
                <Animated.View key={game.id} entering={FadeInUp.delay(index * 70)} style={{ width: cardWidth as any, padding: 8 }}>
                  <GameCard game={game} disabled={Boolean(playing) || !status?.tickets} loading={playing === game.id} onPlay={() => play(game.id)} />
                </Animated.View>
              ))}
            </View>
          )}

          <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
            <GhostButton testID="games-refresh" title="Actualiser tickets" onPress={load} icon={<Ionicons name="refresh" size={16} color={Colors.cyan} />} />
          </View>
        </ScrollView>

        <Modal visible={Boolean(result)} transparent animationType="fade" onRequestClose={() => setResult(null)}>
          <Animated.View entering={FadeIn} style={styles.modalBg}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setResult(null)} />
            <Animated.View entering={SlideInUp.springify()} style={[styles.resultCard, result?.won ? styles.winCard : styles.lossCard]}>
              <View style={[styles.resultIcon, { backgroundColor: result?.won ? Colors.green : Colors.danger }]}>
                <Ionicons name={result?.won ? "trophy" : "close"} size={34} color="#000" />
              </View>
              <Text testID="game-result-title" style={styles.resultTitle}>{result?.won ? "Gain credite" : "Perdu cette fois"}</Text>
              <Text style={styles.resultBody}>
                {result?.won
                  ? `${formatMoney(result?.prize || 0, "XOF")} ajoute au solde. La transaction apparait dans les recus.`
                  : "Aucun debit d'argent: seul un ticket gratuit a ete consomme."}
              </Text>
              <PrimaryButton testID="game-result-close" title="Continuer" onPress={() => setResult(null)} />
            </Animated.View>
          </Animated.View>
        </Modal>
      </SafeAreaView>
    </GradientBg>
  );
}

function GameCard({ game, onPlay, loading, disabled }: { game: GameItem; onPlay: () => void; loading: boolean; disabled: boolean }) {
  const look = GAME_LOOK[game.id] || GAME_LOOK.scratch;
  const tilt = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: tilt.value }] }));

  useEffect(() => {
    tilt.value = withRepeat(withSequence(withTiming(-4, { duration: 1000 }), withTiming(0, { duration: 1000 })), -1, true);
  }, [tilt]);

  return (
    <Animated.View style={[styles.gameCard, { borderColor: look.color, shadowColor: look.color }, animated]}>
      <View style={styles.gameTop}>
        <View style={[styles.gameIcon, { backgroundColor: look.color }]}>
          <Ionicons name={look.icon} size={26} color="#000" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.gameName}>{game.name}</Text>
          <Text style={styles.gameHint}>{look.label}</Text>
        </View>
      </View>
      <View style={styles.rangeBox}>
        <Text style={styles.rangeText}>Bonus possible</Text>
        <Text style={[styles.rangeValue, { color: look.color }]}>{formatMoney(game.min_prize, "XOF")} - {formatMoney(game.max_prize, "XOF")}</Text>
      </View>
      <PrimaryButton
        testID={`play-${game.id}`}
        title={disabled ? "Ticket requis" : "Jouer"}
        loading={loading}
        disabled={disabled}
        onPress={onPlay}
        icon={<Ionicons name="play" size={16} color="#000" />}
      />
    </Animated.View>
  );
}

function MiniStat({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <Animated.View entering={FadeInDown} style={[styles.stat, { borderColor: color }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>{value}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 80 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6 },
  backBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  kicker: { color: Colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: "#fff", fontSize: 30, fontWeight: "900", marginTop: 2 },
  ticketBubble: { minWidth: 62, height: 44, paddingHorizontal: 12, borderRadius: 18, backgroundColor: Colors.yellow, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  ticketText: { color: "#000", fontWeight: "900", fontSize: 18 },
  notice: { marginTop: 6 },
  noticeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noticeTitle: { color: "#fff", fontWeight: "900", fontSize: 15 },
  noticeBody: { color: Colors.textSoft, marginTop: 4, lineHeight: 19, fontSize: 13 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, marginTop: 10 },
  stat: { flex: 1, minWidth: 104, padding: 12, borderRadius: 14, borderWidth: 1.5, backgroundColor: "rgba(255,255,255,0.05)" },
  statLabel: { color: Colors.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  statValue: { fontWeight: "900", marginTop: 6, fontSize: 16 },
  loading: { alignItems: "center", padding: 28 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, marginTop: 8 },
  gameCard: { minHeight: 250, borderRadius: 18, borderWidth: 1.5, backgroundColor: "rgba(10,10,20,0.92)", padding: 14, shadowOpacity: 0.35, shadowRadius: 16 },
  gameTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  gameIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  gameName: { color: "#fff", fontSize: 18, fontWeight: "900" },
  gameHint: { color: Colors.textSoft, fontSize: 12, marginTop: 3 },
  rangeBox: { marginTop: 18, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: Colors.border },
  rangeText: { color: Colors.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  rangeValue: { fontSize: 14, fontWeight: "900", marginTop: 5 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 18 },
  resultCard: { borderRadius: 24, padding: 20, backgroundColor: "#0b0b14", borderWidth: 2, alignItems: "center" },
  winCard: { borderColor: Colors.green },
  lossCard: { borderColor: Colors.danger },
  resultIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  resultTitle: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center" },
  resultBody: { color: Colors.textSoft, textAlign: "center", marginTop: 8, marginBottom: 14, lineHeight: 20 },
});
