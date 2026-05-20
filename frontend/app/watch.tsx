import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { GradientBg, GhostButton, PrimaryButton } from "../src/ui";
import { api } from "../src/auth";
import { Colors } from "../src/theme";

type WatchDetails = {
  id: number;
  media_type: "movie" | "tv";
  title: string;
  overview?: string;
  poster_url?: string;
  backdrop_url?: string;
  vote_average?: number;
  release_date?: string;
  runtime?: number | null;
  duration_label?: string;
  genres?: string[];
  tagline?: string;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
};

type WatchPayload = {
  tmdb_id: number;
  media_type: "movie" | "tv";
  details?: WatchDetails;
  watch_url?: string;
  trailer_url?: string;
  provider_region?: string;
  provider_names?: string[];
  has_vf?: boolean;
  player?: {
    embed_url?: string;
    video_key?: string;
    supports_vf?: boolean;
    supports_vostfr?: boolean;
  };
};

export default function WatchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ media_type?: string; tmdb_id?: string }>();
  const { width } = useWindowDimensions();
  const mediaType = params.media_type === "tv" ? "tv" : "movie";
  const tmdbId = Number(params.tmdb_id || 0);
  const [payload, setPayload] = useState<WatchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [audioMode, setAudioMode] = useState<"vf" | "vostfr">("vf");
  const compact = width < 480;
  const details = payload?.details;
  const embedUrl = payload?.player?.embed_url || youtubeEmbedFromUrl(payload?.trailer_url || "");
  const backdrop = details?.backdrop_url || details?.poster_url || "";
  const providerNames = payload?.provider_names || [];

  const load = useCallback(async () => {
    if (!tmdbId) {
      setError("Titre introuvable.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await api.get(`/movies/watch?media_type=${encodeURIComponent(mediaType)}&tmdb_id=${encodeURIComponent(String(tmdbId))}`);
      setPayload(res);
      setAudioMode(res?.has_vf ? "vf" : "vostfr");
    } catch (e: any) {
      setError(e.message || "Lecture indisponible pour le moment.");
    } finally {
      setLoading(false);
    }
  }, [mediaType, tmdbId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const meta = useMemo(() => {
    const year = (details?.release_date || "").slice(0, 4);
    const parts = [mediaType === "tv" ? "Serie" : "Film", year, details?.duration_label].filter(Boolean);
    if (mediaType === "tv" && details?.number_of_seasons) parts.push(`${details.number_of_seasons} saison(s)`);
    return parts.join(" - ");
  }, [details, mediaType]);

  const openExternal = async (target?: string) => {
    if (!target) return;
    await Linking.openURL(target).catch(() => undefined);
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]}>
          <Animated.View entering={FadeIn.duration(280)} style={styles.header}>
            <Pressable testID="watch-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={Colors.cyan} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kicker}>FX PRO STREAM</Text>
              <Text testID="watch-title" style={styles.title} numberOfLines={2}>{details?.title || "Lecture"}</Text>
              <Text style={styles.subtitle} numberOfLines={2}>{meta || "VF / VOSTFR selon disponibilite officielle"}</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(60)} style={styles.playerPanel}>
            <View style={styles.playerSurface}>
              {loading ? (
                <View style={styles.centerFill}>
                  <ActivityIndicator color={Colors.cyan} />
                  <Text style={styles.softText}>Chargement du lecteur...</Text>
                </View>
              ) : embedUrl && Platform.OS === "web" ? (
                React.createElement("iframe" as any, {
                  src: embedUrl,
                  title: details?.title || "Lecteur video",
                  allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
                  allowFullScreen: true,
                  style: { border: 0, width: "100%", height: "100%", display: "block" },
                })
              ) : backdrop ? (
                <Pressable style={styles.posterPlayer} onPress={() => openExternal(payload?.watch_url || payload?.trailer_url)}>
                  <Image source={{ uri: backdrop }} style={styles.posterPlayerImage} resizeMode="cover" />
                  <View style={styles.posterShade} />
                  <View style={styles.playCircle}>
                    <Ionicons name="play" size={28} color="#000" />
                  </View>
                </Pressable>
              ) : (
                <View style={styles.centerFill}>
                  <Ionicons name="film-outline" size={38} color={Colors.textMuted} />
                  <Text style={styles.softText}>Aucun lecteur disponible</Text>
                </View>
              )}
            </View>

            <View style={styles.modeRow}>
              <Pressable onPress={() => setAudioMode("vf")} style={[styles.modeChip, audioMode === "vf" && styles.modeChipActive, !payload?.has_vf && styles.modeChipMuted]}>
                <Ionicons name={payload?.has_vf ? "volume-high" : "alert-circle-outline"} size={14} color={audioMode === "vf" ? "#000" : Colors.textSoft} />
                <Text style={[styles.modeText, audioMode === "vf" && styles.modeTextActive]}>VF</Text>
              </Pressable>
              <Pressable onPress={() => setAudioMode("vostfr")} style={[styles.modeChip, audioMode === "vostfr" && styles.modeChipActive]}>
                <Ionicons name="text-outline" size={14} color={audioMode === "vostfr" ? "#000" : Colors.textSoft} />
                <Text style={[styles.modeText, audioMode === "vostfr" && styles.modeTextActive]}>VOSTFR</Text>
              </Pressable>
              <View style={styles.regionPill}>
                <Text style={styles.regionText}>{payload?.provider_region || "WEB"}</Text>
              </View>
            </View>
          </Animated.View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={24} color={Colors.yellow} />
              <Text style={styles.errorTitle}>Lecture indisponible</Text>
              <Text style={styles.errorText}>{error}</Text>
              <GhostButton title="Recharger" onPress={load} icon={<Ionicons name="refresh" size={16} color={Colors.cyan} />} />
            </View>
          ) : null}

          {details ? (
            <Animated.View entering={FadeInUp.delay(120)} style={styles.infoPanel}>
              <View style={styles.infoTop}>
                {details.poster_url ? <Image source={{ uri: details.poster_url }} style={styles.poster} resizeMode="cover" /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.infoTitle}>{details.title}</Text>
                  <Text style={styles.infoMeta}>{meta || "Informations TMDB"}</Text>
                  <View style={styles.badgeRow}>
                    {(details.genres || []).slice(0, 4).map((genre) => (
                      <View key={genre} style={styles.genreBadge}>
                        <Text style={styles.genreText}>{genre}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
              <Text style={styles.overview}>{details.overview || "Synopsis indisponible pour le moment."}</Text>
              {providerNames.length ? (
                <Text style={styles.providers}>Disponible via: {providerNames.join(", ")}</Text>
              ) : (
                <Text style={styles.providers}>Lien officiel ou bande-annonce disponible selon le fournisseur.</Text>
              )}
              <View style={styles.actionRow}>
                <PrimaryButton title="Regarder" onPress={() => openExternal(payload?.watch_url || payload?.trailer_url)} icon={<Ionicons name="play" size={16} color="#000" />} style={styles.actionBtn} />
                <GhostButton title="Bande-annonce" onPress={() => openExternal(payload?.trailer_url || payload?.watch_url)} icon={<Ionicons name="open-outline" size={16} color={Colors.cyan} />} style={styles.actionBtn} />
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function youtubeEmbedFromUrl(url: string) {
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
  return match?.[1] ? `https://www.youtube.com/embed/${match[1]}` : "";
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, paddingBottom: 70, maxWidth: 1180, alignSelf: "center" },
  scrollCompact: { paddingHorizontal: 12 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingTop: 10, paddingBottom: 14 },
  backBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  kicker: { color: Colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 2, lineHeight: 32 },
  subtitle: { color: Colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 4 },
  playerPanel: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", backgroundColor: "rgba(10,10,18,0.94)" },
  playerSurface: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#050508" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  softText: { color: Colors.textSoft, fontWeight: "700" },
  posterPlayer: { flex: 1, alignItems: "center", justifyContent: "center" },
  posterPlayerImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  posterShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  playCircle: { width: 70, height: 70, borderRadius: 24, backgroundColor: Colors.cyan, alignItems: "center", justifyContent: "center" },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12, alignItems: "center" },
  modeChip: { minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.04)" },
  modeChipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  modeChipMuted: { opacity: 0.65 },
  modeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  modeTextActive: { color: "#000" },
  regionPill: { marginLeft: "auto", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.08)" },
  regionText: { color: Colors.textSoft, fontSize: 11, fontWeight: "900" },
  errorBox: { marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: Colors.yellow, backgroundColor: "rgba(255,214,10,0.08)", padding: 16, alignItems: "center", gap: 8 },
  errorTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  errorText: { color: Colors.textSoft, textAlign: "center", lineHeight: 19 },
  infoPanel: { marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)", padding: 14 },
  infoTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  poster: { width: 92, height: 138, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  infoTitle: { color: "#fff", fontSize: 22, fontWeight: "900", lineHeight: 27 },
  infoMeta: { color: Colors.textSoft, marginTop: 4, fontSize: 12, fontWeight: "700" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  genreBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(0,255,255,0.12)", borderWidth: 1, borderColor: "rgba(0,255,255,0.25)" },
  genreText: { color: Colors.cyan, fontSize: 10, fontWeight: "900" },
  overview: { color: Colors.textSoft, lineHeight: 21, marginTop: 14 },
  providers: { color: "#fff", fontWeight: "800", marginTop: 12, lineHeight: 19 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  actionBtn: { flexGrow: 1, minWidth: 160 },
});
