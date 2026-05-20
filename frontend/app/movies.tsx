import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { GradientBg, GhostButton } from "../src/ui";
import { api } from "../src/auth";
import { Colors } from "../src/theme";

type MovieItem = {
  id: number;
  tmdb_id?: number;
  media_type: "movie" | "tv";
  title: string;
  overview?: string;
  poster_url?: string;
  backdrop_url?: string;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  source?: string;
  favorite?: boolean;
  watchlist?: boolean;
  watched?: boolean;
  genre_ids?: number[];
};

type MovieLibraryRow = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  favorite?: boolean;
  watchlist?: boolean;
  watched?: boolean;
  item?: MovieItem;
};

type CatalogState = {
  items: MovieItem[];
  source?: string;
  attribution?: string;
  page: number;
  page_size: number;
  has_more: boolean;
  total_results: number;
};

const SECTIONS: { id: "all" | "movie" | "tv" | "library"; label: string; icon: any }[] = [
  { id: "all", label: "Tout", icon: "albums-outline" },
  { id: "movie", label: "Films", icon: "film-outline" },
  { id: "tv", label: "Series", icon: "tv-outline" },
  { id: "library", label: "Profil", icon: "person-circle-outline" },
];

const GROUPS = [
  { id: "all", label: "Tout" },
  { id: "action", label: "Action" },
  { id: "adventure", label: "Aventure" },
  { id: "comedy", label: "Comedie" },
  { id: "drama", label: "Drame" },
  { id: "scifi", label: "SF" },
  { id: "animation", label: "Animation" },
  { id: "crime", label: "Crime" },
  { id: "documentary", label: "Docu" },
  { id: "family", label: "Famille" },
  { id: "horror", label: "Horreur" },
];

const GROUP_MAP: Record<string, { movie: number[]; tv: number[] }> = {
  all: { movie: [], tv: [] },
  action: { movie: [28], tv: [10759] },
  adventure: { movie: [12], tv: [10759] },
  comedy: { movie: [35], tv: [35] },
  drama: { movie: [18], tv: [18] },
  scifi: { movie: [878], tv: [10765] },
  animation: { movie: [16], tv: [16] },
  crime: { movie: [80], tv: [80] },
  documentary: { movie: [99], tv: [99] },
  family: { movie: [10751], tv: [10751] },
  horror: { movie: [27], tv: [9648] },
};

const SORTS = [
  { id: "popular", label: "Populaire" },
  { id: "rating", label: "Note" },
  { id: "recent", label: "Recent" },
];

const TMDB_ATTRIBUTION = "This product uses the TMDB API but is not endorsed or certified by TMDB.";

const MOVIE_LOCAL_FALLBACK: MovieItem[] = [
  { id: 550, media_type: "movie", title: "Fight Club", overview: "Un employe insomniaque decouvre un cercle clandestin qui change sa vision du controle et de la consommation.", poster_url: "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", backdrop_url: "https://image.tmdb.org/t/p/w780/hZkgoQYus5vegHoetLkCJzb17zJ.jpg", vote_average: 8.4, release_date: "1999-10-15", genre_ids: [18], source: "fallback" },
  { id: 1399, media_type: "tv", title: "Game of Thrones", overview: "Des familles nobles luttent pour le pouvoir pendant qu'une menace ancienne grandit au-dela du mur.", poster_url: "https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg", backdrop_url: "https://image.tmdb.org/t/p/w780/suopoADq0k8YZr4dQXcU6pToj6s.jpg", vote_average: 8.5, release_date: "2011-04-17", genre_ids: [10759, 18], source: "fallback" },
  { id: 157336, media_type: "movie", title: "Interstellar", overview: "Une equipe traverse l'espace pour chercher un futur possible a l'humanite.", poster_url: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", backdrop_url: "https://image.tmdb.org/t/p/w780/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg", vote_average: 8.5, release_date: "2014-11-05", genre_ids: [12, 18, 878], source: "fallback" },
  { id: 66732, media_type: "tv", title: "Stranger Things", overview: "Des enfants, une disparition et une force etrange bouleversent une petite ville.", poster_url: "https://image.tmdb.org/t/p/w500/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg", backdrop_url: "https://image.tmdb.org/t/p/w780/56v2KjBlU4XaOv9rVYEQypROD7P.jpg", vote_average: 8.6, release_date: "2016-07-15", genre_ids: [18, 9648, 10765], source: "fallback" },
];

export default function MoviesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [section, setSection] = useState<"all" | "movie" | "tv" | "library">("all");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [sort, setSort] = useState("popular");
  const [catalog, setCatalog] = useState<CatalogState>({ items: [], source: "", attribution: TMDB_ATTRIBUTION, page: 1, page_size: 24, has_more: false, total_results: 0 });
  const [library, setLibrary] = useState<MovieLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [watchingKey, setWatchingKey] = useState("");

  const compact = width < 480;
  const columns = width >= 1024 ? 4 : width >= 768 ? 3 : width >= 480 ? 2 : 1;
  const cardWidth = `${100 / columns}%`;

  const libraryMarks = useMemo(() => {
    const map = new Map<string, MovieLibraryRow>();
    library.forEach((row) => map.set(`${row.media_type}:${row.tmdb_id}`, row));
    return map;
  }, [library]);

  const libraryItems = useMemo(() => {
    return library.map((row) => normalizeLibraryRow(row)).filter(Boolean) as MovieItem[];
  }, [library]);

  const filteredItems = useMemo(() => {
    const base = section === "library" ? libraryItems : catalog.items;
    const q = query.trim().toLowerCase();
    return base
      .filter((item) => {
        if (section !== "library" && section !== "all" && item.media_type !== section) return false;
        if (group !== "all" && !matchesGroup(item, group)) return false;
        if (q && !`${item.title} ${item.overview || ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .map((item) => {
        const key = `${item.media_type}:${item.id || item.tmdb_id}`;
        const mark = libraryMarks.get(key);
        return {
          ...item,
          favorite: Boolean(mark?.favorite || item.favorite),
          watchlist: Boolean(mark?.watchlist || item.watchlist),
          watched: Boolean(mark?.watched || item.watched),
        };
      });
  }, [catalog.items, group, libraryItems, libraryMarks, query, section]);

  const load = useCallback(
    async (page = 1, append = false) => {
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        const params = new URLSearchParams();
        params.set("kind", section === "library" ? "all" : section);
        params.set("page", String(page));
        params.set("page_size", compact ? "18" : "24");
        params.set("genre", group);
        params.set("sort", sort);
        if (query.trim()) params.set("q", query.trim());
        const fallbackPage = {
          items: MOVIE_LOCAL_FALLBACK,
          source: "fallback",
          attribution: TMDB_ATTRIBUTION,
          page: 1,
          page_size: MOVIE_LOCAL_FALLBACK.length,
          has_more: false,
          total_results: MOVIE_LOCAL_FALLBACK.length,
        };
        const catalogPayload = await withTimeout(api.get(`/movies/catalog?${params.toString()}`), 6500, fallbackPage);
        const libraryPayload = await Promise.race([
          api.get("/movies/library").catch(() => ({ items: [] })),
          new Promise((resolve) => setTimeout(() => resolve({ items: [] }), 2500)),
        ]) as any;
        const nextItems = Array.isArray(catalogPayload.items) ? catalogPayload.items : [];
        setCatalog((prev) => ({
          items: append ? dedupeMovies([...prev.items, ...nextItems]) : nextItems,
          source: catalogPayload.source,
          attribution: catalogPayload.attribution,
          page: Number(catalogPayload.page || page),
          page_size: Number(catalogPayload.page_size || (compact ? 18 : 24)),
          has_more: Boolean(catalogPayload.has_more),
          total_results: Number(catalogPayload.total_results || nextItems.length),
        }));
        setLibrary(Array.isArray(libraryPayload.items) ? libraryPayload.items : []);
      } catch {
        setCatalog({
          items: MOVIE_LOCAL_FALLBACK,
          source: "fallback",
          attribution: TMDB_ATTRIBUTION,
          page: 1,
          page_size: MOVIE_LOCAL_FALLBACK.length,
          has_more: false,
          total_results: MOVIE_LOCAL_FALLBACK.length,
        });
        setLibrary([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [compact, group, query, section, sort]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      load(1, false).catch(() => undefined);
    }, query.trim() ? 320 : 0);
    return () => clearTimeout(timer);
  }, [load, query, section, group, sort]);

  const toggle = async (item: MovieItem, listType: "favorite" | "watchlist" | "watched") => {
    const tmdbId = item.id || item.tmdb_id;
    if (!tmdbId) return;
    const key = `${listType}:${item.media_type}:${tmdbId}`;
    const active = !item[listType];
    try {
      setSavingKey(key);
      await api.post("/movies/library/toggle", {
        tmdb_id: tmdbId,
        media_type: item.media_type,
        list_type: listType,
        active,
        item: cleanMovieItem(item),
      });
      await load(catalog.page || 1, false);
    } catch (e: any) {
      Alert.alert("Liste non sauvegardee", e.message || "Impossible de mettre a jour cette liste.");
    } finally {
      setSavingKey("");
    }
  };

  const handleWatch = (item: MovieItem) => {
    const tmdbId = item.id || item.tmdb_id;
    if (!tmdbId) return;
    const key = `${item.media_type}:${tmdbId}`;
    setWatchingKey(key);
    router.push({ pathname: "/watch" as any, params: { media_type: item.media_type, tmdb_id: String(tmdbId) } });
    setTimeout(() => {
      setWatchingKey("");
    }, 450);
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeIn.duration(350)} style={styles.header}>
            <Pressable testID="movies-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={Colors.cyan} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kicker}>FX PRO STREAM</Text>
              <Text testID="movies-title" style={styles.title} numberOfLines={1}>Films & series</Text>
              <Text style={styles.subtitle} numberOfLines={2}>Catalogue large, listes perso et page lecteur avec VF, VOSTFR, infos et liens officiels.</Text>
            </View>
            <View style={styles.freeBadge}>
              <Ionicons name="sparkles" size={15} color="#000" />
              <Text style={styles.freeText}>Gratuit</Text>
            </View>
          </Animated.View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={Colors.textSoft} />
            <TextInput
              testID="movies-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un film ou une serie"
              placeholderTextColor={Colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {query ? (
              <Pressable testID="movies-clear" onPress={() => setQuery("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={Colors.textSoft} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTrack}>
            {SECTIONS.map((tab) => {
              const active = section === tab.id;
              return (
                <Pressable key={tab.id} testID={`movies-tab-${tab.id}`} onPress={() => setSection(tab.id)} style={[styles.sectionChip, active && styles.sectionChipActive]}>
                  <Ionicons name={tab.icon} size={16} color={active ? "#000" : Colors.textSoft} />
                  <Text style={[styles.sectionChipText, active && styles.sectionChipTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTrack}>
            {GROUPS.map((tab) => {
              const active = group === tab.id;
              return (
                <Pressable key={tab.id} onPress={() => setGroup(tab.id)} style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortTrack}>
            {SORTS.map((tab) => {
              const active = sort === tab.id;
              return (
                <Pressable key={tab.id} onPress={() => setSort(tab.id)} style={[styles.sortChip, active && styles.sortChipActive]}>
                  <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={13} color={active ? "#000" : Colors.textSoft} />
                  <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.statusBand}>
            <View style={styles.statusTop}>
              <View style={styles.statusLine}>
                <Ionicons name={catalog.source === "tmdb" ? "cloud-done-outline" : "warning-outline"} size={18} color={catalog.source === "tmdb" ? Colors.green : Colors.yellow} />
                <Text style={styles.statusText}>
                  {catalog.source === "tmdb"
                    ? `${catalog.total_results || catalog.items.length} titre(s) synchronises avec pagination et lecture officielle`
                    : "Mode secours actif: les listes restent disponibles meme si TMDB ne repond pas"}
                </Text>
              </View>
              <View style={styles.resultPill}>
                <Text style={styles.resultPillText}>{filteredItems.length} visibles</Text>
              </View>
            </View>
            <Text style={styles.attribution}>{catalog.attribution || TMDB_ATTRIBUTION}</Text>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.cyan} />
              <Text style={styles.loadingText}>Chargement du catalogue...</Text>
            </View>
          ) : filteredItems.length ? (
            <>
              <View style={styles.grid}>
                {filteredItems.map((item, index) => (
                  <Animated.View key={`${item.media_type}-${item.id || item.tmdb_id}`} entering={FadeInUp.delay(Math.min(index, 16) * 30)} style={{ width: cardWidth as any, padding: 8 }}>
                    <MovieCard item={item} savingKey={savingKey} watchingKey={watchingKey} compact={compact} onToggle={toggle} onWatch={handleWatch} />
                  </Animated.View>
                ))}
              </View>
              {section !== "library" && catalog.has_more ? (
                <View style={styles.moreWrap}>
                  <GhostButton
                    title={loadingMore ? "Chargement..." : "Voir plus de titres"}
                    onPress={() => load((catalog.page || 1) + 1, true)}
                    disabled={loadingMore}
                    icon={loadingMore ? <ActivityIndicator size="small" color={Colors.cyan} /> : <Ionicons name="chevron-down" size={16} color={Colors.cyan} />}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="film-outline" size={34} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Aucun resultat</Text>
              <Text style={styles.emptyText}>Votre profil gardera les favoris, la watchlist et les titres vus des que vous en ajoutez.</Text>
              <GhostButton title="Recharger" onPress={() => load(1, false)} icon={<Ionicons name="refresh" size={16} color={Colors.cyan} />} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function MovieCard({
  item,
  savingKey,
  watchingKey,
  compact,
  onToggle,
  onWatch,
}: {
  item: MovieItem;
  savingKey: string;
  watchingKey: string;
  compact: boolean;
  onToggle: (item: MovieItem, listType: "favorite" | "watchlist" | "watched") => void;
  onWatch: (item: MovieItem) => void;
}) {
  const image = item.poster_url || item.backdrop_url || "";
  const year = (item.release_date || "").slice(0, 4);
  const rating = Number(item.vote_average || 0);
  const watchKey = `${item.media_type}:${item.id || item.tmdb_id}`;
  return (
    <View style={[styles.movieCard, compact && styles.movieCardCompact]}>
      <View style={styles.posterBox}>
        {image ? (
          <RemotePoster uri={image} mediaType={item.media_type} />
        ) : (
          <View style={styles.posterFallback}>
            <Ionicons name={item.media_type === "tv" ? "tv-outline" : "film-outline"} size={28} color={Colors.textMuted} />
          </View>
        )}
        <View style={styles.posterTop}>
          <View style={styles.typePill}>
            <Ionicons name={item.media_type === "tv" ? "tv-outline" : "film-outline"} size={12} color="#000" />
            <Text style={styles.typeText}>{item.media_type === "tv" ? "Serie" : "Film"}</Text>
          </View>
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={11} color={Colors.yellow} />
            <Text style={styles.ratingText}>{rating ? rating.toFixed(1) : "-"}</Text>
          </View>
        </View>
      </View>
      <View style={styles.movieBody}>
        <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.movieMeta}>{year || "Date inconnue"} - {item.source === "fallback" ? "Secours" : "TMDB"}</Text>
        <Text style={styles.overview} numberOfLines={compact ? 4 : 3}>{item.overview || "Synopsis indisponible pour le moment."}</Text>

        <Pressable onPress={() => onWatch(item)} disabled={watchingKey === watchKey} style={[styles.watchBtn, watchingKey === watchKey && styles.watchBtnLoading]}>
          {watchingKey === watchKey ? <ActivityIndicator color="#000" /> : <Ionicons name="play-circle" size={18} color="#000" />}
          <Text style={styles.watchBtnText}>{watchingKey === watchKey ? "Ouverture..." : "Regarder"}</Text>
        </Pressable>

        <View style={styles.actions}>
          <ListButton
            icon="heart"
            active={Boolean(item.favorite)}
            color={Colors.magenta}
            loading={savingKey === `favorite:${item.media_type}:${item.id || item.tmdb_id}`}
            onPress={() => onToggle(item, "favorite")}
          />
          <ListButton
            icon="bookmark"
            active={Boolean(item.watchlist)}
            color={Colors.cyan}
            loading={savingKey === `watchlist:${item.media_type}:${item.id || item.tmdb_id}`}
            onPress={() => onToggle(item, "watchlist")}
          />
          <ListButton
            icon="checkmark-done"
            active={Boolean(item.watched)}
            color={Colors.green}
            loading={savingKey === `watched:${item.media_type}:${item.id || item.tmdb_id}`}
            onPress={() => onToggle(item, "watched")}
          />
        </View>
      </View>
    </View>
  );
}

function RemotePoster({ uri, mediaType }: { uri: string; mediaType: "movie" | "tv" }) {
  const [failed, setFailed] = useState(false);
  if (failed || !uri?.startsWith("http")) {
    return (
      <View style={styles.posterFallback}>
        <Ionicons name={mediaType === "tv" ? "tv-outline" : "film-outline"} size={28} color={Colors.textMuted} />
      </View>
    );
  }
  return <Image source={{ uri }} style={styles.poster} resizeMode="cover" onError={() => setFailed(true)} />;
}

function ListButton({ icon, active, color, loading, onPress }: { icon: any; active: boolean; color: string; loading: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={[styles.listBtn, active && { backgroundColor: color, borderColor: color }]}>
      {loading ? <ActivityIndicator size="small" color={active ? "#000" : color} /> : <Ionicons name={active ? icon : (`${icon}-outline` as any)} size={17} color={active ? "#000" : color} />}
    </Pressable>
  );
}

function matchesGroup(item: MovieItem, group: string) {
  if (group === "all") return true;
  const ids = GROUP_MAP[group]?.[item.media_type] || [];
  if (!ids.length) return true;
  const genreIds = item.genre_ids || [];
  return ids.some((value) => genreIds.includes(value));
}

function normalizeLibraryRow(row: MovieLibraryRow): MovieItem | null {
  const item = row.item || ({} as MovieItem);
  const id = Number(item.id || row.tmdb_id);
  if (!id) return null;
  return {
    ...item,
    id,
    media_type: row.media_type,
    favorite: Boolean(row.favorite),
    watchlist: Boolean(row.watchlist),
    watched: Boolean(row.watched),
    genre_ids: Array.isArray(item.genre_ids) ? item.genre_ids : [],
  };
}

function cleanMovieItem(item: MovieItem) {
  return {
    id: item.id || item.tmdb_id,
    media_type: item.media_type,
    title: item.title,
    overview: item.overview || "",
    poster_url: item.poster_url || "",
    backdrop_url: item.backdrop_url || "",
    vote_average: item.vote_average || 0,
    vote_count: item.vote_count || 0,
    release_date: item.release_date || "",
    genre_ids: item.genre_ids || [],
    source: item.source || "tmdb",
  };
}

function dedupeMovies(items: MovieItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.media_type}:${item.id || item.tmdb_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 110 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 8 },
  backBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  kicker: { color: Colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 2 },
  subtitle: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 4 },
  freeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 999, backgroundColor: Colors.green, marginTop: 4 },
  freeText: { color: "#000", fontWeight: "900", fontSize: 12 },
  searchWrap: { marginHorizontal: 16, marginTop: 8, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14 },
  searchInput: { flex: 1, minWidth: 0, color: "#fff", fontSize: 15, paddingVertical: 12 },
  sectionTrack: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 8 },
  sectionChip: { minHeight: 38, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)", flexDirection: "row", alignItems: "center", gap: 6 },
  sectionChipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  sectionChipText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  sectionChipTextActive: { color: "#000" },
  filterTrack: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 2, gap: 8 },
  horizontalRail: { width: "100%", maxWidth: "100%", flexGrow: 0 },
  filterChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center" },
  filterChipActive: { backgroundColor: Colors.magenta, borderColor: Colors.magenta },
  filterChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  filterChipTextActive: { color: "#fff" },
  sortTrack: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8, gap: 8 },
  sortChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.03)", flexDirection: "row", alignItems: "center", gap: 6 },
  sortChipActive: { backgroundColor: Colors.yellow, borderColor: Colors.yellow },
  sortChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  sortChipTextActive: { color: "#000" },
  statusBand: { marginHorizontal: 16, marginTop: 4, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(0,0,0,0.28)" },
  statusTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  statusText: { flex: 1, minWidth: 0, color: "#fff", fontWeight: "800", fontSize: 12 },
  resultPill: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 6 },
  resultPillText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  attribution: { color: Colors.textMuted, fontSize: 10, marginTop: 7, lineHeight: 14 },
  loading: { alignItems: "center", padding: 34 },
  loadingText: { color: Colors.textSoft, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, marginTop: 8 },
  movieCard: { borderRadius: 18, overflow: "hidden", backgroundColor: "rgba(12,12,20,0.94)", borderWidth: 1, borderColor: Colors.border, minHeight: 492 },
  movieCardCompact: { minHeight: 514 },
  posterBox: { height: 232, backgroundColor: "rgba(255,255,255,0.04)" },
  poster: { width: "100%", height: "100%" },
  posterFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  posterTop: { position: "absolute", left: 10, right: 10, top: 10, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  typePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.cyan, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  typeText: { color: "#000", fontSize: 10, fontWeight: "900" },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  ratingText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  movieBody: { padding: 13, flex: 1 },
  movieTitle: { color: "#fff", fontSize: 17, fontWeight: "900", lineHeight: 21 },
  movieMeta: { color: Colors.textMuted, fontSize: 11, fontWeight: "800", marginTop: 4 },
  overview: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 8, minHeight: 54 },
  watchBtn: { minHeight: 44, borderRadius: 14, backgroundColor: Colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  watchBtnLoading: { opacity: 0.82 },
  watchBtnText: { color: "#000", fontWeight: "900" },
  actions: { flexDirection: "row", gap: 8, marginTop: "auto", paddingTop: 12 },
  listBtn: { flex: 1, minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.045)" },
  moreWrap: { paddingHorizontal: 16, marginTop: 8 },
  empty: { margin: 16, padding: 22, alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)" },
  emptyTitle: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 10 },
  emptyText: { color: Colors.textSoft, textAlign: "center", marginTop: 6, lineHeight: 19 },
});
