import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
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
import { FREE_GAME_SNAPSHOT } from "../src/freeGamesSnapshot";
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

type FreeGameItem = {
  id: number;
  title: string;
  thumbnail?: string;
  short_description?: string;
  game_url?: string;
  genre?: string;
  platform?: string;
  publisher?: string;
  developer?: string;
  release_date?: string;
  freetogame_profile_url?: string;
};

type FreeGamesState = {
  items: FreeGameItem[];
  genres: string[];
  platforms: string[];
  page: number;
  has_more: boolean;
  total_results: number;
  source?: string;
};

type SteamGameItem = {
  appid: number;
  id?: number;
  title: string;
  name?: string;
  image?: string;
  thumbnail?: string;
  capsule_image?: string;
  background?: string;
  short_description?: string;
  price?: number | null;
  price_initial?: number | null;
  price_currency?: string;
  price_label?: string;
  fx_price?: number | null;
  fx_currency?: string;
  fx_price_label?: string;
  fx_discount_percent?: number;
  fx_price_source?: string;
  discount_percent?: number;
  is_free?: boolean;
  genres?: string[];
  genre?: string;
  developers?: string[];
  publishers?: string[];
  publisher?: string;
  release_date?: string;
  steam_url?: string;
  source?: string;
};

type SteamCatalogState = {
  items: SteamGameItem[];
  genres: string[];
  page: number;
  has_more: boolean;
  total_results: number;
  source?: string;
};

function gameSourceLabel(source?: string) {
  if (source === "snapshot") return "catalogue integre";
  if (source === "fallback") return "secours";
  if (source === "featured_fallback") return "Steam selection";
  return source || "live";
}

const GAME_LOOK: Record<string, { icon: any; color: string; label: string }> = {
  scratch: { icon: "sparkles", color: Colors.cyan, label: "Gratte la carte au bon moment" },
  vault: { icon: "cube", color: Colors.yellow, label: "Ouvre le coffre sans forcer" },
  reflex: { icon: "flash", color: Colors.green, label: "Reflexe rapide, gain rapide" },
  hero_duel: { icon: "people-circle", color: Colors.magenta, label: "Combat stats contre stats" },
  power_match: { icon: "barbell", color: Colors.orange, label: "Puissance, force et resistance" },
  speed_run: { icon: "flash", color: Colors.cyan, label: "Vitesse et reflexes en direct" },
};

const FREE_GAME_FALLBACK: FreeGameItem[] = FREE_GAME_SNAPSHOT.map((item) => ({ ...item }));
const STEAM_QUICK_SEARCHES = ["2026", "Upcoming", "Forza", "God of War", "Call of Duty", "EA SPORTS FC", "GTA", "Elden Ring", "Survival", "RPG", "Racing"];

export default function GamesScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [catalog, setCatalog] = useState<FreeGamesState>({ items: [], genres: [], platforms: [], page: 1, has_more: false, total_results: 0, source: "" });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [openingKey, setOpeningKey] = useState("");
  const [steamQuery, setSteamQuery] = useState("");
  const [steamGenre, setSteamGenre] = useState("all");
  const [steamCatalog, setSteamCatalog] = useState<SteamCatalogState>({ items: [], genres: [], page: 1, has_more: false, total_results: 0, source: "" });
  const [steamLoading, setSteamLoading] = useState(true);
  const [steamLoadingMore, setSteamLoadingMore] = useState(false);
  const [buyingSteamKey, setBuyingSteamKey] = useState("");
  const [steamCheckout, setSteamCheckout] = useState<SteamGameItem | null>(null);
  const [steamPayment, setSteamPayment] = useState({ email: user?.email || "", card: "", expiry: "", holder: user?.name || "" });
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.04, { duration: 900 }), withTiming(1, { duration: 900 })), -1, true);
  }, [pulse]);

  useEffect(() => {
    setSteamPayment((prev) => ({
      ...prev,
      email: prev.email || user?.email || "",
      holder: prev.holder || user?.name || "",
    }));
  }, [user?.email, user?.name]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const compact = width < 480;
  const bonusColumns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;
  const catalogColumns = width >= 1024 ? 4 : width >= 768 ? 3 : width >= 480 ? 2 : 1;
  const steamColumns = catalogColumns;
  const bonusCardWidth = `${100 / bonusColumns}%`;
  const catalogCardWidth = `${100 / catalogColumns}%`;
  const steamCardWidth = `${100 / steamColumns}%`;
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

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get("/games/status");
      setStatus(data);
    } catch {
      setStatus((prev: any) => prev || { tickets: 0, daily_tickets: 5, stats: {}, games: [], heroes: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(
    async (page = 1, append = false) => {
      try {
        if (append) setCatalogLoadingMore(true);
        else setCatalogLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", compact ? "14" : "24");
        params.set("genre", genre);
        params.set("platform", platform);
        if (query.trim()) params.set("q", query.trim());
        const payload = await withTimeout(api.get(`/games/catalog?${params.toString()}`), 6500, null as any);
        if (!payload) throw new Error("Catalogue jeux indisponible");
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setCatalog((prev) => ({
          items: append ? dedupeFreeGames([...prev.items, ...nextItems]) : nextItems,
          genres: Array.isArray(payload.genres) ? payload.genres : [],
          platforms: Array.isArray(payload.platforms) ? payload.platforms : [],
          page: Number(payload.page || page),
          has_more: Boolean(payload.has_more),
          total_results: Number(payload.total_results || nextItems.length),
          source: payload.source,
        }));
      } catch (e: any) {
        if (!append) {
          const fallbackPool = filterFreeGames(FREE_GAME_FALLBACK, query, genre, platform);
          const fallbackLimit = compact ? 14 : 24;
          const fallbackItems = fallbackPool.slice(0, fallbackLimit);
          const fallbackGenres = Array.from(new Set(FREE_GAME_FALLBACK.map((item) => item.genre || "Autre"))).sort();
          const fallbackPlatforms = Array.from(new Set(FREE_GAME_FALLBACK.map((item) => item.platform || "PC (Windows)"))).sort();
          setCatalog((prev) => ({
            ...prev,
            items: fallbackItems,
            genres: fallbackGenres,
            platforms: fallbackPlatforms,
            has_more: fallbackPool.length > fallbackItems.length,
            total_results: fallbackPool.length,
            source: "snapshot",
          }));
        }
      } finally {
        setCatalogLoading(false);
        setCatalogLoadingMore(false);
      }
    },
    [compact, genre, platform, query]
  );

  const loadSteamCatalog = useCallback(
    async (page = 1, append = false) => {
      try {
        if (append) setSteamLoadingMore(true);
        else setSteamLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "60");
        params.set("genre", steamGenre);
        if (steamQuery.trim()) params.set("q", steamQuery.trim());
        const payload = await withTimeout(api.get(`/games/steam/catalog?${params.toString()}`), 9000, {
          items: [],
          genres: ["Action", "Adventure", "RPG", "Simulation", "Sports", "Strategy", "Free to Play"],
          page,
          has_more: false,
          total_results: 0,
          source: "offline",
        });
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setSteamCatalog((prev) => ({
          items: append ? dedupeSteamGames([...prev.items, ...nextItems]) : nextItems,
          genres: Array.isArray(payload.genres) ? payload.genres : [],
          page: Number(payload.page || page),
          has_more: Boolean(payload.has_more),
          total_results: Number(payload.total_results || nextItems.length),
          source: payload.source,
        }));
      } catch {
        if (!append) {
          setSteamCatalog((prev) => ({ ...prev, items: [], genres: [], page: 1, has_more: false, total_results: 0, source: "offline" }));
        }
      } finally {
        setSteamLoading(false);
        setSteamLoadingMore(false);
      }
    },
    [steamGenre, steamQuery]
  );

  useEffect(() => {
    loadStatus().catch(() => undefined);
  }, [loadStatus]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSteamCatalog(1, false).catch(() => undefined);
    }, steamQuery.trim() ? 320 : 0);
    return () => clearTimeout(timer);
  }, [loadSteamCatalog, steamGenre, steamQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCatalog(1, false).catch(() => undefined);
    }, query.trim() ? 260 : 0);
    return () => clearTimeout(timer);
  }, [genre, loadCatalog, platform, query]);

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
      loadStatus().catch(() => undefined);
    } catch (e: any) {
      Alert.alert("Jeu bloque", e.message || "Impossible de lancer cette partie pour le moment.");
    } finally {
      setPlaying(null);
    }
  };

  const openFreeGame = async (item: FreeGameItem, preferred: "play" | "profile" = "play") => {
    const key = `${preferred}:${item.id}`;
    const target = preferred === "play" ? item.game_url || item.freetogame_profile_url : item.freetogame_profile_url || item.game_url;
    if (!target) {
      Alert.alert("Ouverture indisponible", "Aucun lien n'est disponible pour ce jeu.");
      return;
    }
    try {
      setOpeningKey(key);
      await Linking.openURL(target);
    } catch (e: any) {
      Alert.alert("Ouverture indisponible", e.message || "Impossible d'ouvrir ce jeu.");
    } finally {
      setOpeningKey("");
    }
  };

  const openSteamPage = async (item: SteamGameItem) => {
    const target = item.steam_url || `https://store.steampowered.com/app/${item.appid}`;
    try {
      await Linking.openURL(target);
    } catch (e: any) {
      Alert.alert("Steam indisponible", e.message || "Impossible d'ouvrir la fiche Steam.");
    }
  };

  const openSteamCheckout = (item: SteamGameItem) => {
    setSteamPayment((prev) => ({
      ...prev,
      email: prev.email || user?.email || "",
      holder: prev.holder || user?.name || "",
    }));
    setSteamCheckout(item);
  };

  const buySteamGame = async (item: SteamGameItem) => {
    const email = steamPayment.email.trim();
    const cardDigits = steamPayment.card.replace(/\D+/g, "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Email requis", "Entre un email valide pour recevoir la confirmation du jeu.");
      return;
    }
    if (!item.is_free && cardDigits.length < 12) {
      Alert.alert("Carte bancaire requise", "Entre un numero de carte valide. Seuls les 4 derniers chiffres seront envoyes.");
      return;
    }
    try {
      setBuyingSteamKey(String(item.appid));
      const res = await api.post("/games/steam/purchase", {
        appid: item.appid,
        wallet_currency: "XOF",
        billing_email: email,
        card_last4: cardDigits.slice(-4),
        card_brand: detectCardBrand(cardDigits),
        card_holder: steamPayment.holder.trim() || user?.name || "Client FX Pro",
      });
      await refresh();
      setSteamCheckout(null);
      Alert.alert(
        "Carte de jeu creditee",
        `${item.title || item.name} - ${res.transaction?.reference || res.purchase?.reference || "STEAM"}. ${res.transaction?.amount ? `Debit solde ${res.transaction.amount} ${res.transaction.currency}.` : "Aucun debit pour ce jeu gratuit."}`,
        [{ text: "Ouvrir Steam", onPress: () => openSteamPage(item) }, { text: "OK" }]
      );
    } catch (e: any) {
      Alert.alert("Achat indisponible", e.message || "Impossible de finaliser cet achat maintenant.");
    } finally {
      setBuyingSteamKey("");
    }
  };

  const visibleGenres = useMemo(() => ["all", ...catalog.genres.slice(0, 12)], [catalog.genres]);
  const visiblePlatforms = useMemo(() => ["all", ...catalog.platforms.slice(0, 6)], [catalog.platforms]);
  const visibleSteamGenres = useMemo(() => ["all", ...steamCatalog.genres.slice(0, 10)], [steamCatalog.genres]);

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
              <Text style={styles.headerText}>Tickets recharges, nouveaux jeux classes par categorie et bouton Jouer sur chaque fiche.</Text>
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
              <Text style={{ color: Colors.textSoft, marginTop: 10 }}>Chargement des jeux bonus...</Text>
            </View>
          ) : (
            <>
              {heroes.length ? <HeroStrip heroes={heroes} /> : null}
              <View style={styles.grid}>
                {games.map((game, index) => (
                  <Animated.View key={game.id} entering={FadeInUp.delay(index * 70)} style={{ width: bonusCardWidth as any, padding: 8 }}>
                    <GameCard game={game} disabled={Boolean(playing) || !status?.tickets} locked={!status?.tickets} loading={playing === game.id} onPlay={() => play(game.id)} />
                  </Animated.View>
                ))}
              </View>
            </>
          )}

          <View style={styles.refreshWrap}>
            <GhostButton testID="games-refresh" title="Actualiser tickets" onPress={() => loadStatus()} icon={<Ionicons name="refresh" size={16} color={Colors.cyan} />} />
          </View>

          <View style={styles.steamHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sectionKicker}>Boutique Steam</Text>
              <Text style={styles.catalogTitle}>Catalogue jeux complet</Text>
              <Text style={styles.catalogSubtitle}>
                {steamCatalog.total_results || 0} jeu(x), affichage 60/page pour charger 300+ titres par pagination, cache API et prix Steam quand disponibles. Solde XOF: {formatMoney(user?.balances?.XOF || 0, "XOF")}.
              </Text>
            </View>
            <View style={styles.steamBadge}>
              <Ionicons name="logo-steam" size={15} color="#000" />
              <Text style={styles.steamBadgeText}>{gameSourceLabel(steamCatalog.source)}</Text>
            </View>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textSoft} />
            <TextInput
              value={steamQuery}
              onChangeText={setSteamQuery}
              placeholder="Forza, God of War, 2026, Call of Duty..."
              placeholderTextColor={Colors.textMuted}
              style={styles.searchInput}
            />
            {steamQuery ? (
              <Pressable onPress={() => setSteamQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={Colors.textSoft} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTrack}>
            {STEAM_QUICK_SEARCHES.map((item) => {
              const active = steamQuery.toLowerCase() === item.toLowerCase();
              return (
                <Pressable key={`steam-search-${item}`} onPress={() => setSteamQuery(active ? "" : item)} style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTrack}>
            {visibleSteamGenres.map((item) => {
              const active = steamGenre === item;
              return (
                <Pressable key={`steam-${item}`} onPress={() => setSteamGenre(item)} style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item === "all" ? "Tous Steam" : item}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {steamLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.cyan} />
              <Text style={{ color: Colors.textSoft, marginTop: 10 }}>Chargement Steam...</Text>
            </View>
          ) : steamCatalog.items.length ? (
            <>
              <View style={styles.catalogGrid}>
                {steamCatalog.items.map((item, index) => (
                  <Animated.View key={item.appid} entering={FadeInUp.delay(Math.min(index, 18) * 28)} style={{ width: steamCardWidth as any, padding: 8 }}>
                    <SteamGameCard
                      item={item}
                      compact={compact}
                      buying={buyingSteamKey === String(item.appid)}
                      onBuy={() => openSteamCheckout(item)}
                      onOpen={() => openSteamPage(item)}
                    />
                  </Animated.View>
                ))}
              </View>
              {steamCatalog.has_more ? (
                <View style={styles.moreWrap}>
                  <GhostButton
                    title={steamLoadingMore ? "Chargement..." : "Voir plus Steam"}
                    onPress={() => {
                      if (!steamLoadingMore) loadSteamCatalog((steamCatalog.page || 1) + 1, true).catch(() => undefined);
                    }}
                    icon={steamLoadingMore ? <ActivityIndicator size="small" color={Colors.cyan} /> : <Ionicons name="chevron-down" size={16} color={Colors.cyan} />}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="logo-steam" size={28} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Steam indisponible</Text>
              <Text style={styles.emptyText}>Le catalogue Steam est cache et retentera automatiquement au prochain chargement. Essaie 2026, Upcoming, RPG ou Racing.</Text>
            </View>
          )}

          <View style={styles.catalogHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sectionKicker}>Catalogue live</Text>
              <Text style={styles.catalogTitle}>Nouveaux jeux par categorie</Text>
              <Text style={styles.catalogSubtitle}>{catalog.total_results || 0} jeu(x) disponible(s) - source {gameSourceLabel(catalog.source)}.</Text>
            </View>
            <View style={styles.catalogBadge}>
              <Ionicons name="rocket" size={15} color="#000" />
              <Text style={styles.catalogBadgeText}>Jouer</Text>
            </View>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Nom, genre, studio ou plateforme"
              placeholderTextColor={Colors.textMuted}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={Colors.textSoft} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTrack}>
            {visibleGenres.map((item) => {
              const active = genre === item;
              return (
                <Pressable key={item} onPress={() => setGenre(item)} style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item === "all" ? "Tous" : item}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platformTrack}>
            {visiblePlatforms.map((item) => {
              const active = platform === item;
              return (
                <Pressable key={item} onPress={() => setPlatform(item)} style={[styles.platformChip, active && styles.platformChipActive]}>
                  <Ionicons name={String(item).toLowerCase().includes("web") ? "globe-outline" : "desktop-outline"} size={14} color={active ? "#000" : Colors.textSoft} />
                  <Text style={[styles.platformChipText, active && styles.platformChipTextActive]}>{item === "all" ? "Toutes" : item}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {catalogLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.cyan} />
              <Text style={{ color: Colors.textSoft, marginTop: 10 }}>Chargement du catalogue jeux...</Text>
            </View>
          ) : catalog.items.length ? (
            <>
              <View style={styles.catalogGrid}>
                {catalog.items.map((item, index) => (
                  <Animated.View key={item.id} entering={FadeInUp.delay(Math.min(index, 18) * 28)} style={{ width: catalogCardWidth as any, padding: 8 }}>
                    <FreeGameCard
                      item={item}
                      compact={compact}
                      openingKey={openingKey}
                      onPlay={() => openFreeGame(item, "play")}
                      onOpenProfile={() => openFreeGame(item, "profile")}
                    />
                  </Animated.View>
                ))}
              </View>
              {catalog.has_more ? (
                <View style={styles.moreWrap}>
                  <GhostButton
                    title={catalogLoadingMore ? "Chargement..." : "Voir plus de jeux"}
                    onPress={() => {
                      if (!catalogLoadingMore) loadCatalog((catalog.page || 1) + 1, true).catch(() => undefined);
                    }}
                    icon={catalogLoadingMore ? <ActivityIndicator size="small" color={Colors.cyan} /> : <Ionicons name="chevron-down" size={16} color={Colors.cyan} />}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="game-controller-outline" size={28} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Aucun jeu pour ce filtre</Text>
              <Text style={styles.emptyText}>Change le genre, la plateforme ou la recherche pour charger une autre selection.</Text>
            </View>
          )}
        </ScrollView>

        <Modal visible={Boolean(steamCheckout)} transparent animationType="slide" onRequestClose={() => setSteamCheckout(null)}>
          <View style={styles.modalBg}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setSteamCheckout(null)} />
            {steamCheckout ? (
              <Animated.View entering={SlideInUp.springify()} style={styles.checkoutCard}>
                <View style={styles.checkoutTop}>
                  <RemoteImage uri={steamCheckout.image || steamCheckout.thumbnail || steamCheckout.capsule_image} style={styles.checkoutImage} fallbackIcon="logo-steam" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.checkoutKicker}>Paiement jeu Steam securise</Text>
                    <Text style={styles.checkoutTitle} numberOfLines={2}>{steamCheckout.title || steamCheckout.name}</Text>
                    <Text style={styles.checkoutPrice}>{steamCheckout.is_free ? "Gratuit" : `${steamCheckout.fx_price_label || steamCheckout.price_label || "Offre FX"}`}</Text>
                    {steamCheckout.fx_discount_percent ? <Text style={styles.checkoutDiscount}>Promo FX Pro -{steamCheckout.fx_discount_percent}%</Text> : null}
                    <Text style={styles.checkoutLegal}>Le solde FX Pro est debite uniquement apres validation. Les infos carte servent a la confirmation, pas a un paiement bancaire reel.</Text>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email de confirmation</Text>
                  <TextInput testID="steam-pay-email" value={steamPayment.email} onChangeText={(email) => setSteamPayment((prev) => ({ ...prev, email }))} autoCapitalize="none" keyboardType="email-address" placeholder="client@email.com" placeholderTextColor={Colors.textMuted} style={styles.checkoutInput} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Carte bancaire</Text>
                  <TextInput testID="steam-pay-card" value={steamPayment.card} onChangeText={(card) => setSteamPayment((prev) => ({ ...prev, card }))} keyboardType="number-pad" placeholder="4242 4242 4242 4242" placeholderTextColor={Colors.textMuted} style={styles.checkoutInput} maxLength={23} />
                  <Text style={styles.secureHint}>Seuls les 4 derniers chiffres sont envoyes. Montant debite du solde: {steamCheckout.is_free ? "0 XOF" : (steamCheckout.fx_price_label || steamCheckout.price_label || "offre FX")}.</Text>
                </View>
                <View style={styles.checkoutRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Expiration</Text>
                    <TextInput testID="steam-pay-expiry" value={steamPayment.expiry} onChangeText={(expiry) => setSteamPayment((prev) => ({ ...prev, expiry }))} placeholder="MM/AA" placeholderTextColor={Colors.textMuted} style={styles.checkoutInput} maxLength={5} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Nom carte</Text>
                    <TextInput testID="steam-pay-holder" value={steamPayment.holder} onChangeText={(holder) => setSteamPayment((prev) => ({ ...prev, holder }))} placeholder="Nom complet" placeholderTextColor={Colors.textMuted} style={styles.checkoutInput} />
                  </View>
                </View>
                <View style={styles.checkoutActions}>
                  <GhostButton title="Annuler" onPress={() => setSteamCheckout(null)} icon={<Ionicons name="close" size={16} color={Colors.cyan} />} style={styles.checkoutAction} />
                  <PrimaryButton
                    title={buyingSteamKey === String(steamCheckout.appid) ? "Paiement..." : "Payer et crediter"}
                    onPress={() => buySteamGame(steamCheckout)}
                    loading={buyingSteamKey === String(steamCheckout.appid)}
                    icon={<Ionicons name="card" size={16} color="#000" />}
                    style={styles.checkoutAction}
                  />
                </View>
              </Animated.View>
            ) : null}
          </View>
        </Modal>

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

function RemoteImage({
  uri,
  style,
  fallbackIcon = "image-outline",
  resizeMode = "cover",
}: {
  uri?: string;
  style: any;
  fallbackIcon?: any;
  resizeMode?: "cover" | "contain";
}) {
  const [failed, setFailed] = useState(false);
  const valid = Boolean(uri && uri.startsWith("http") && !failed);
  if (!valid) {
    return (
      <View style={[style, styles.remoteFallback]}>
        <Ionicons name={fallbackIcon} size={28} color={Colors.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} onError={() => setFailed(true)} />;
}

function SteamGameCard({
  item,
  compact,
  buying,
  onBuy,
  onOpen,
}: {
  item: SteamGameItem;
  compact: boolean;
  buying: boolean;
  onBuy: () => void;
  onOpen: () => void;
}) {
  const price = item.fx_price_label || item.price_label || (item.is_free ? "Gratuit" : "Offre FX");
  const discount = Number(item.fx_discount_percent || item.discount_percent || 0);
  const genreLine = (item.genres || [item.genre || "Steam"]).filter(Boolean).slice(0, 2).join(" / ");
  return (
    <View style={[styles.steamCard, compact && styles.steamCardCompact]}>
      <View style={styles.steamImageWrap}>
        <RemoteImage uri={item.image || item.thumbnail || item.capsule_image} style={styles.steamImage} fallbackIcon="logo-steam" />
        {discount > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discount}%</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.steamBody}>
        <View style={styles.freeGameTopRow}>
          <Text style={styles.freeGameGenre}>{genreLine || "Steam"}</Text>
          <Text style={styles.freeGamePlatform}>PC</Text>
        </View>
        <Text style={styles.freeGameTitle} numberOfLines={2}>{item.title || item.name}</Text>
        <Text style={styles.freeGameDesc} numberOfLines={compact ? 4 : 3}>{item.short_description || "Jeu Steam avec fiche, prix et lien officiel."}</Text>
        <View style={styles.steamPriceRow}>
          {discount > 0 && item.price ? <Text style={styles.oldPrice}>{item.price} {item.price_currency || "EUR"}</Text> : null}
          <Text style={[styles.priceText, item.is_free && { color: Colors.green }]}>{price}</Text>
        </View>
        {discount > 0 ? <Text style={styles.fxDealText}>Promo FX Pro supplementaire -{discount}%</Text> : null}
        <View style={styles.freeMetaLine}>
          <InfoTiny icon="business-outline" text={item.publisher || item.publishers?.[0] || "Steam"} color={Colors.cyan} />
          {item.release_date ? <InfoTiny icon="calendar-outline" text={item.release_date} color={Colors.yellow} /> : null}
        </View>
        <View style={styles.freeActions}>
          <PrimaryButton
            title={buying ? "Achat..." : "Acheter"}
            onPress={onBuy}
            loading={buying}
            icon={<Ionicons name="cart" size={16} color="#000" />}
            style={styles.freePlayBtn}
          />
          <Pressable onPress={onOpen} style={styles.freeProfileBtn}>
            <Ionicons name="open-outline" size={16} color={Colors.cyan} />
            <Text style={styles.freeProfileText}>Steam</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function FreeGameCard({
  item,
  compact,
  openingKey,
  onPlay,
  onOpenProfile,
}: {
  item: FreeGameItem;
  compact: boolean;
  openingKey: string;
  onPlay: () => void;
  onOpenProfile: () => void;
}) {
  const playKey = `play:${item.id}`;
  const profileKey = `profile:${item.id}`;
  return (
    <View style={[styles.freeGameCard, compact && styles.freeGameCardCompact]}>
      <RemoteImage uri={item.thumbnail || ""} style={styles.freeGameImage} fallbackIcon="game-controller-outline" />
      <View style={styles.freeGameBody}>
        <View style={styles.freeGameTopRow}>
          <Text style={styles.freeGameGenre}>{item.genre || "Autre"}</Text>
          <Text style={styles.freeGamePlatform}>{item.platform || "PC"}</Text>
        </View>
        <Text style={styles.freeGameTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.freeGameDesc} numberOfLines={compact ? 4 : 3}>{item.short_description || "Description indisponible."}</Text>
        <View style={styles.freeMetaLine}>
          <InfoTiny icon="business-outline" text={item.publisher || "Studio"} color={Colors.cyan} />
          {item.release_date ? <InfoTiny icon="calendar-outline" text={item.release_date} color={Colors.yellow} /> : null}
        </View>
        <View style={styles.freeActions}>
          <PrimaryButton
            title={openingKey === playKey ? "Ouverture..." : "Jouer"}
            onPress={onPlay}
            loading={openingKey === playKey}
            icon={<Ionicons name="play" size={16} color="#000" />}
            style={styles.freePlayBtn}
          />
          <Pressable onPress={onOpenProfile} style={styles.freeProfileBtn}>
            {openingKey === profileKey ? <ActivityIndicator color={Colors.cyan} /> : <Ionicons name="open-outline" size={16} color={Colors.cyan} />}
            <Text style={styles.freeProfileText}>Profil</Text>
          </Pressable>
        </View>
      </View>
    </View>
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
      <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroTrack}>
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

function InfoTiny({ icon, text, color }: { icon: any; text: string; color: string }) {
  return (
    <View style={styles.infoTiny}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={styles.infoTinyText}>{text}</Text>
    </View>
  );
}

function dedupeFreeGames(items: FreeGameItem[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function dedupeSteamGames(items: SteamGameItem[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    const id = Number(item.appid || item.id || 0);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function filterFreeGames(items: FreeGameItem[], query: string, genre: string, platform: string) {
  const q = query.trim().toLowerCase();
  const g = genre.trim().toLowerCase();
  const p = platform.trim().toLowerCase();
  return items.filter((item) => {
    if (q && !`${item.title} ${item.genre || ""} ${item.platform || ""} ${item.publisher || ""} ${item.developer || ""}`.toLowerCase().includes(q)) return false;
    if (g !== "all" && String(item.genre || "").toLowerCase() !== g) return false;
    if (p !== "all" && !String(item.platform || "").toLowerCase().includes(p)) return false;
    return true;
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

function detectCardBrand(digits: string) {
  if (/^4/.test(digits)) return "Visa";
  if (/^5[1-5]/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "American Express";
  return "Carte bancaire";
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 80 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6 },
  backBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  kicker: { color: Colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: "#fff", fontSize: 30, fontWeight: "900", marginTop: 2 },
  headerText: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 4 },
  ticketBubble: { minWidth: 62, height: 44, paddingHorizontal: 12, borderRadius: 18, backgroundColor: Colors.yellow, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 },
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
  refreshWrap: { paddingHorizontal: 16, marginTop: 6 },
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
  catalogHeader: { marginTop: 18, paddingHorizontal: 18, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  catalogTitle: { color: "#fff", fontSize: 20, fontWeight: "900", marginTop: 3 },
  catalogSubtitle: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 4 },
  catalogBadge: { borderRadius: 999, backgroundColor: Colors.green, minHeight: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  catalogBadgeText: { color: "#000", fontWeight: "900", fontSize: 12 },
  steamHeader: { marginTop: 22, paddingHorizontal: 18, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  steamBadge: { maxWidth: 160, borderRadius: 999, backgroundColor: Colors.cyan, minHeight: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  steamBadgeText: { color: "#000", fontWeight: "900", fontSize: 11 },
  searchBox: { marginHorizontal: 16, marginTop: 10, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14 },
  searchInput: { flex: 1, minWidth: 0, color: "#fff", fontSize: 15, paddingVertical: 12 },
  filterTrack: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 8 },
  horizontalRail: { width: "100%", maxWidth: "100%", flexGrow: 0 },
  filterChip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center" },
  filterChipActive: { backgroundColor: Colors.magenta, borderColor: Colors.magenta },
  filterChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  filterChipTextActive: { color: "#fff" },
  platformTrack: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6, gap: 8 },
  platformChip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.03)", flexDirection: "row", alignItems: "center", gap: 6 },
  platformChipActive: { backgroundColor: Colors.yellow, borderColor: Colors.yellow },
  platformChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  platformChipTextActive: { color: "#000" },
  catalogGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, marginTop: 8 },
  steamCard: { minHeight: 438, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(10,12,22,0.96)" },
  steamCardCompact: { minHeight: 466 },
  steamImageWrap: { width: "100%", height: 172, backgroundColor: "rgba(255,255,255,0.05)" },
  steamImage: { width: "100%", height: "100%", backgroundColor: "rgba(255,255,255,0.05)" },
  discountBadge: { position: "absolute", right: 10, bottom: 10, borderRadius: 999, backgroundColor: Colors.green, paddingHorizontal: 10, paddingVertical: 5 },
  discountText: { color: "#000", fontWeight: "900", fontSize: 12 },
  steamBody: { padding: 13, flex: 1 },
  steamPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, minHeight: 24 },
  oldPrice: { color: Colors.textMuted, fontSize: 11, textDecorationLine: "line-through", fontWeight: "800" },
  priceText: { color: Colors.yellow, fontSize: 16, fontWeight: "900" },
  fxDealText: { color: Colors.green, fontSize: 11, fontWeight: "900", marginTop: 4 },
  freeGameCard: { minHeight: 392, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(12,12,20,0.94)" },
  freeGameCardCompact: { minHeight: 426 },
  freeGameImage: { width: "100%", height: 178, backgroundColor: "rgba(255,255,255,0.05)" },
  freeGameBody: { padding: 13, flex: 1 },
  freeGameTopRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  freeGameGenre: { color: Colors.cyan, fontSize: 11, fontWeight: "900" },
  freeGamePlatform: { color: Colors.textMuted, fontSize: 10, fontWeight: "900" },
  freeGameTitle: { color: "#fff", fontSize: 17, fontWeight: "900", lineHeight: 21, marginTop: 6 },
  freeGameDesc: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 8, minHeight: 54 },
  freeMetaLine: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  freeActions: { marginTop: "auto", paddingTop: 12, gap: 8 },
  freePlayBtn: { minHeight: 44 },
  freeProfileBtn: { minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  freeProfileText: { color: Colors.cyan, fontWeight: "900" },
  remoteFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  infoTiny: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.055)" },
  infoTinyText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  moreWrap: { paddingHorizontal: 16, marginTop: 8 },
  emptyBox: { marginHorizontal: 16, marginTop: 8, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)", alignItems: "center" },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 8 },
  emptyText: { color: Colors.textSoft, textAlign: "center", marginTop: 6, lineHeight: 19 },
  duelBox: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)" },
  duelHero: { flex: 1, minWidth: 0, alignItems: "center" },
  duelImage: { width: 62, height: 62, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  duelName: { color: "#fff", fontWeight: "900", marginTop: 6, fontSize: 12 },
  duelScore: { fontSize: 18, fontWeight: "900", marginTop: 2 },
  vsPill: { width: 58, alignItems: "center" },
  vsText: { color: "#000", backgroundColor: Colors.yellow, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, fontWeight: "900" },
  marginText: { color: Colors.textSoft, fontSize: 11, fontWeight: "900", marginTop: 5 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 18 },
  checkoutCard: { borderRadius: 24, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: "#101018", padding: 16, maxWidth: 620, width: "100%", alignSelf: "center" },
  checkoutTop: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 12 },
  checkoutImage: { width: 112, height: 64, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" },
  checkoutKicker: { color: Colors.cyan, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.4 },
  checkoutTitle: { color: "#fff", fontSize: 20, fontWeight: "900", lineHeight: 24, marginTop: 2 },
  checkoutPrice: { color: Colors.green, fontSize: 18, fontWeight: "900", marginTop: 5 },
  checkoutDiscount: { color: Colors.yellow, fontSize: 11, fontWeight: "900", marginTop: 2 },
  checkoutLegal: { color: Colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 6 },
  inputGroup: { marginTop: 10 },
  inputLabel: { color: Colors.textSoft, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 6 },
  checkoutInput: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.06)", color: "#fff", paddingHorizontal: 12, fontWeight: "800" },
  secureHint: { color: Colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  checkoutRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  checkoutActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  checkoutAction: { flexGrow: 1, minWidth: 170 },
  resultCard: { borderRadius: 24, padding: 20, backgroundColor: "#0b0b14", borderWidth: 2, alignItems: "center" },
  winCard: { borderColor: Colors.green },
  lossCard: { borderColor: Colors.danger },
  resultIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  resultTitle: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center" },
  resultBody: { color: Colors.textSoft, textAlign: "center", marginTop: 8, marginBottom: 14, lineHeight: 20 },
});
