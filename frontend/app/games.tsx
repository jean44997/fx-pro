import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
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
  mode?: string;
};

type HeroItem = {
  id: number;
  name: string;
  publisher?: string;
  alignment?: string;
  image?: string;
  stats?: Record<string, number>;
};

const GAME_LOOK: Record<string, { icon: any; color: string; label: string }> = {
  scratch: { icon: "sparkles", color: Colors.cyan, label: "Gratte la carte au bon moment" },
  vault: { icon: "cube", color: Colors.yellow, label: "Ouvre le coffre sans forcer" },
  reflex: { icon: "flash", color: Colors.green, label: "Reflexe rapide, gain rapide" },
  hero_duel: { icon: "people-circle", color: Colors.magenta, label: "Combat stats contre stats" },
  power_match: { icon: "barbell", color: Colors.orange, label: "Puissance, force et resistance" },
  speed_run: { icon: "flash", color: Colors.cyan, label: "Vitesse et reflexes en direct" },
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
  const heroes: HeroItem[] = status?.heroes || [];

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
                  Regle obligatoire: un ticket est consomme a chaque partie. Sans ticket, les jeux restent verrouilles par cadenas et aucun debit d'argent n'est possible.
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
            <>
              {heroes.length ? <HeroStrip heroes={heroes} /> : null}
              <View style={styles.grid}>
                {games.map((game, index) => (
                  <Animated.View key={game.id} entering={FadeInUp.delay(index * 70)} style={{ width: cardWidth as any, padding: 8 }}>
                    <GameCard game={game} disabled={Boolean(playing) || !status?.tickets} locked={!status?.tickets} loading={playing === game.id} onPlay={() => play(game.id)} />
                  </Animated.View>
                ))}
              </View>
            </>
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
              {result?.event?.details ? <HeroResult details={result.event.details} won={Boolean(result?.won)} /> : null}
              <PrimaryButton testID="game-result-close" title="Continuer" onPress={() => setResult(null)} />
            </Animated.View>
          </Animated.View>
        </Modal>
      </SafeAreaView>
    </GradientBg>
  );
}

function GameCard({ game, onPlay, loading, disabled, locked }: { game: GameItem; onPlay: () => void; loading: boolean; disabled: boolean; locked: boolean }) {
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
      <View style={styles.rulesRow}>
        <Ionicons name={locked ? "lock-closed" : "ticket-outline"} size={15} color={locked ? Colors.danger : Colors.green} />
        <Text style={[styles.rulesText, locked && { color: Colors.danger }]}>
          {locked ? "Cadenas: ticket requis" : "1 ticket obligatoire"}
        </Text>
      </View>
      <PrimaryButton
        testID={`play-${game.id}`}
        title={locked ? "Cadenas ticket" : "Jouer"}
        loading={loading}
        disabled={disabled}
        onPress={onPlay}
        icon={<Ionicons name={locked ? "lock-closed" : "play"} size={16} color="#000" />}
      />
    </Animated.View>
  );
}

function HeroStrip({ heroes }: { heroes: HeroItem[] }) {
  return (
    <View style={styles.heroSection}>
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.sectionKicker}>Nouveaux jeux</Text>
          <Text style={styles.heroTitle}>Rosters heros en temps reel</Text>
        </View>
        <Ionicons name="pulse" size={20} color={Colors.cyan} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroTrack}>
        {heroes.slice(0, 18).map((hero, index) => {
          const total = heroTotal(hero);
          return (
            <Animated.View key={`${hero.id}-${hero.name}`} entering={FadeInRight.delay(index * 30)} style={styles.heroCard}>
              <Image source={{ uri: hero.image }} style={styles.heroImage} resizeMode="cover" />
              <View style={styles.heroShade} />
              <View style={styles.heroCardBody}>
                <Text style={styles.heroName} numberOfLines={1}>{hero.name}</Text>
                <Text style={styles.heroMeta} numberOfLines={1}>{hero.publisher || "Comics"} - score {total}</Text>
                <View style={styles.heroBars}>
                  <HeroBar label="PWR" value={Number(hero.stats?.power || 0)} color={Colors.cyan} />
                  <HeroBar label="CBT" value={Number(hero.stats?.combat || 0)} color={Colors.magenta} />
                </View>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function HeroBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.heroBarRow}>
      <Text style={styles.heroBarLabel}>{label}</Text>
      <View style={styles.heroBarTrack}>
        <View style={[styles.heroBarFill, { width: `${Math.max(4, Math.min(100, value))}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function HeroResult({ details, won }: { details: any; won: boolean }) {
  return (
    <View style={styles.duelBox}>
      <View style={styles.duelHero}>
        <Image source={{ uri: details.player?.image }} style={styles.duelImage} resizeMode="cover" />
        <Text style={styles.duelName} numberOfLines={1}>{details.player?.name || "Hero"}</Text>
        <Text style={[styles.duelScore, { color: won ? Colors.green : Colors.textSoft }]}>{details.player_score}</Text>
      </View>
      <View style={styles.vsPill}>
        <Text style={styles.vsText}>VS</Text>
        <Text style={styles.marginText}>{Number(details.margin || 0) >= 0 ? "+" : ""}{details.margin}</Text>
      </View>
      <View style={styles.duelHero}>
        <Image source={{ uri: details.rival?.image }} style={styles.duelImage} resizeMode="cover" />
        <Text style={styles.duelName} numberOfLines={1}>{details.rival?.name || "Rival"}</Text>
        <Text style={[styles.duelScore, { color: !won ? Colors.danger : Colors.textSoft }]}>{details.rival_score}</Text>
      </View>
    </View>
  );
}

function heroTotal(hero: HeroItem) {
  const stats = hero.stats || {};
  return ["intelligence", "strength", "speed", "durability", "power", "combat"].reduce((sum, key) => sum + Number(stats[key] || 0), 0);
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
  rulesRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, marginBottom: 6 },
  rulesText: { color: Colors.green, fontSize: 12, fontWeight: "900" },
  heroSection: { marginTop: 8, marginBottom: 2 },
  heroHeader: { paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionKicker: { color: Colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 2, textTransform: "uppercase" },
  heroTitle: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 3 },
  heroTrack: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  heroCard: { width: 152, height: 214, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, backgroundColor: "#101018" },
  heroImage: { width: "100%", height: "100%" },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.18)" },
  heroCardBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10, backgroundColor: "rgba(5,5,10,0.82)" },
  heroName: { color: "#fff", fontWeight: "900", fontSize: 14 },
  heroMeta: { color: Colors.textSoft, fontSize: 10, marginTop: 2 },
  heroBars: { marginTop: 8, gap: 5 },
  heroBarRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroBarLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: "900", width: 24 },
  heroBarTrack: { flex: 1, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" },
  heroBarFill: { height: "100%", borderRadius: 999 },
  duelBox: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)" },
  duelHero: { flex: 1, minWidth: 0, alignItems: "center" },
  duelImage: { width: 62, height: 62, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  duelName: { color: "#fff", fontWeight: "900", marginTop: 6, fontSize: 12 },
  duelScore: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  vsPill: { width: 58, alignItems: "center" },
  vsText: { color: "#000", backgroundColor: Colors.yellow, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, fontWeight: "900" },
  marginText: { color: Colors.textSoft, fontSize: 11, fontWeight: "900", marginTop: 5 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 18 },
  resultCard: { borderRadius: 24, padding: 20, backgroundColor: "#0b0b14", borderWidth: 2, alignItems: "center" },
  winCard: { borderColor: Colors.green },
  lossCard: { borderColor: Colors.danger },
  resultIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  resultTitle: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center" },
  resultBody: { color: Colors.textSoft, textAlign: "center", marginTop: 8, marginBottom: 14, lineHeight: 20 },
});
