import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeInUp, SlideInRight } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, useAuth } from "../src/auth";
import { Colors } from "../src/theme";
import { GradientBg, GhostButton, PrimaryButton } from "../src/ui";

type PlayerId = "videojs" | "plyr" | "dash" | "native" | "iframe";

type StreamSource = {
  quality: string;
  label: string;
  url: string;
  mime?: string;
  size_label?: string;
  audio_id?: string;
};

type WatchSeason = {
  season_number: number;
  name: string;
  episode_count?: number;
  poster_url?: string;
  overview?: string;
};

type WatchEpisode = {
  season_number: number;
  episode_number: number;
  title: string;
  overview?: string;
  runtime?: number;
  still_url?: string;
  air_date?: string;
};

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
  players?: { id: PlayerId; name: string; description?: string }[];
  seasons?: WatchSeason[];
  episodes?: WatchEpisode[];
  streams?: {
    primary_url?: string;
    hls_url?: string;
    dash_url?: string;
    iframe_url?: string;
    poster?: string;
    ad_free?: boolean;
    licensed?: boolean;
    download_available?: boolean;
    source_note?: string;
    mp4_sources?: StreamSource[];
    download_sources?: StreamSource[];
  };
  audio_tracks?: { id: string; label: string; language: string; default?: boolean }[];
  subtitle_tracks?: { id: string; label: string; language: string; url: string; default?: boolean }[];
  player?: {
    embed_url?: string;
    video_key?: string;
    supports_vf?: boolean;
    supports_vostfr?: boolean;
  };
};

type WatchProfile = {
  id: string;
  name: string;
  color: string;
  maturity: string;
};

const DEFAULT_PLAYERS: { id: PlayerId; name: string; description: string }[] = [
  { id: "videojs", name: "Video.js HLS", description: "Lecteur Video.js avec HLS." },
  { id: "plyr", name: "Plyr HLS", description: "Lecteur Plyr + hls.js." },
  { id: "dash", name: "DASH.js", description: "Lecteur MPEG-DASH." },
  { id: "native", name: "HTML5 natif", description: "Fallback direct sans pub." },
  { id: "iframe", name: "Iframe securise", description: "Lecteur isole sans pub." },
];

const PROFILE_COLORS = [Colors.cyan, Colors.magenta, Colors.green, Colors.yellow, "#FF6B6B"];

export default function WatchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ media_type?: string; tmdb_id?: string; id?: string }>();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const mediaType = params.media_type === "tv" ? "tv" : "movie";
  const tmdbId = Number(params.tmdb_id || params.id || 0);
  const [payload, setPayload] = useState<WatchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playerId, setPlayerId] = useState<PlayerId>("videojs");
  const [quality, setQuality] = useState("720p");
  const [audioMode, setAudioMode] = useState("vf");
  const [subtitleMode, setSubtitleMode] = useState("fr");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [profiles, setProfiles] = useState<WatchProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [profileSwitchKey, setProfileSwitchKey] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const compact = width < 480;

  const details = payload?.details;
  const streams = payload?.streams || {};
  const players = payload?.players?.length ? payload.players : DEFAULT_PLAYERS;
  const mp4Sources = streams.mp4_sources?.length ? streams.mp4_sources : [];
  const downloadSources = streams.download_sources?.length ? streams.download_sources : mp4Sources;
  const selectedSource =
    mp4Sources.find((source) => source.quality === quality && (!source.audio_id || source.audio_id === audioMode)) ||
    mp4Sources.find((source) => source.quality === quality) ||
    mp4Sources.find((source) => !source.audio_id || source.audio_id === audioMode) ||
    mp4Sources[1] ||
    mp4Sources[0];
  const qualitySources = mp4Sources
    .filter((source) => !source.audio_id || source.audio_id === audioMode)
    .filter((source, index, list) => list.findIndex((item) => item.quality === source.quality) === index);
  const seasonList = payload?.seasons || [];
  const episodeList = (payload?.episodes || []).filter((episode) => !selectedSeason || episode.season_number === selectedSeason);
  const activeEpisode = episodeList.find((episode) => episode.episode_number === selectedEpisode) || episodeList[0];
  const playerPoster = streams.poster || details?.backdrop_url || details?.poster_url || "";
  const backdrop = details?.backdrop_url || details?.poster_url || "";
  const providerNames = payload?.provider_names || [];
  const hasPlayableSource = Boolean(streams.licensed && (selectedSource?.url || streams.primary_url || streams.hls_url || streams.dash_url));
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];

  const profileKey = useMemo(() => `fxpro_watch_profiles_${user?.user_id || "guest"}`, [user?.user_id]);

  const loadProfiles = useCallback(async () => {
    const defaults: WatchProfile[] = [
      { id: "main", name: user?.name?.split(" ")?.[0] || "Moi", color: Colors.cyan, maturity: "Standard" },
      { id: "family", name: "Famille", color: Colors.magenta, maturity: "Tout public" },
      { id: "guest", name: "Invite", color: Colors.green, maturity: "Invite" },
    ];
    try {
      const raw = await AsyncStorage.getItem(profileKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const next = Array.isArray(parsed) && parsed.length ? parsed : defaults;
      setProfiles(next);
      setActiveProfileId(next[0]?.id || "main");
      if (!raw) await AsyncStorage.setItem(profileKey, JSON.stringify(next));
    } catch {
      setProfiles(defaults);
      setActiveProfileId(defaults[0].id);
    }
  }, [profileKey, user?.name]);

  const load = useCallback(async () => {
    if (!tmdbId) {
      setError("Titre introuvable.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      setPlayerError("");
      const res = await api.get(`/movies/watch?media_type=${encodeURIComponent(mediaType)}&tmdb_id=${encodeURIComponent(String(tmdbId))}`);
      setPayload(res);
      const firstAudio = (res?.audio_tracks || []).find((track: any) => track.default)?.id || (res?.has_vf ? "vf" : "vo");
      const firstSubtitle = (res?.subtitle_tracks || []).find((track: any) => track.default)?.id || "fr";
      const firstQuality = (res?.streams?.mp4_sources || []).find((source: any) => source.quality === "720p")?.quality || res?.streams?.mp4_sources?.[0]?.quality || "720p";
      const firstSeason = Number(res?.seasons?.[0]?.season_number || 1);
      const firstEpisode = Number(res?.episodes?.[0]?.episode_number || 1);
      setAudioMode(firstAudio);
      setSubtitleMode(firstSubtitle);
      setQuality(firstQuality);
      setSelectedSeason(firstSeason);
      setSelectedEpisode(firstEpisode);
    } catch (e: any) {
      setError(e.message || "Lecture indisponible pour le moment.");
    } finally {
      setLoading(false);
    }
  }, [mediaType, tmdbId]);

  useEffect(() => {
    loadProfiles().catch(() => undefined);
  }, [loadProfiles]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const meta = useMemo(() => {
    const year = (details?.release_date || "").slice(0, 4);
    const parts = [mediaType === "tv" ? "Serie" : "Film", year, details?.duration_label].filter(Boolean);
    if (mediaType === "tv" && details?.number_of_seasons) parts.push(`${details.number_of_seasons} saison(s)`);
    return parts.join(" - ");
  }, [details, mediaType]);

  const switchProfile = async (profile: WatchProfile) => {
    setActiveProfileId(profile.id);
    setProfileSwitchKey((value) => value + 1);
    await AsyncStorage.setItem(`${profileKey}_active`, profile.id).catch(() => undefined);
  };

  const addProfile = async () => {
    if (profiles.length >= 5) return;
    const next: WatchProfile = {
      id: `profile_${Date.now()}`,
      name: `Profil ${profiles.length + 1}`,
      color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length],
      maturity: "Personnalise",
    };
    const nextProfiles = [...profiles, next];
    setProfiles(nextProfiles);
    setActiveProfileId(next.id);
    setProfileSwitchKey((value) => value + 1);
    await AsyncStorage.setItem(profileKey, JSON.stringify(nextProfiles)).catch(() => undefined);
  };

  const cyclePlayer = () => {
    const ids = players.map((player) => player.id);
    const current = Math.max(0, ids.indexOf(playerId));
    setPlayerError("");
    setPlayerId(ids[(current + 1) % ids.length] || "videojs");
  };

  const openExternal = async (target?: string) => {
    if (!target) return;
    await Linking.openURL(target).catch(() => undefined);
  };

  const downloadSource = async (source: StreamSource) => {
    setDownloadOpen(false);
    await openExternal(source.url);
  };

  const renderWebVideo = () => {
    if (!hasPlayableSource) return null;
    return React.createElement("iframe" as any, {
      key: `${playerId}-${quality}-${audioMode}-${subtitleMode}-${selectedSeason}-${selectedEpisode}`,
      title: `${details?.title || "Lecteur FX Pro"} - ${playerId}`,
      srcDoc: buildPlayerDoc({
        playerId,
        title: `${details?.title || "FX Pro Stream"}${activeEpisode ? ` - S${activeEpisode.season_number}E${activeEpisode.episode_number}` : ""}`,
        videoUrl: selectedSource?.url || streams.primary_url || "",
        hlsUrl: streams.hls_url || "",
        dashUrl: streams.dash_url || "",
        poster: playerPoster,
        subtitles: payload?.subtitle_tracks || [],
        subtitleMode,
      }),
      allow: "autoplay; fullscreen; picture-in-picture",
      allowFullScreen: true,
      style: { border: 0, width: "100%", height: "100%", display: "block", backgroundColor: "#000" },
    });
  };

  const renderIframe = () => {
    if (Platform.OS !== "web") return null;
    if (!hasPlayableSource) return null;
    const videoUrl = selectedSource?.url || streams.primary_url || "";
    const srcDoc = buildPlayerDoc({
      playerId: "iframe",
      title: details?.title || "FX Pro Stream",
      videoUrl,
      hlsUrl: streams.hls_url || "",
      dashUrl: streams.dash_url || "",
      poster: playerPoster,
      subtitles: payload?.subtitle_tracks || [],
      subtitleMode,
    });
    return React.createElement("iframe" as any, {
      title: details?.title || "Lecteur iframe FX Pro",
      srcDoc,
      allow: "autoplay; fullscreen; picture-in-picture",
      allowFullScreen: true,
      style: { border: 0, width: "100%", height: "100%", display: "block", backgroundColor: "#000" },
    });
  };

  const renderPlayer = () => {
    if (loading) {
      return (
        <View style={styles.centerFill}>
          <ActivityIndicator color={Colors.cyan} />
          <Text style={styles.softText}>Chargement du lecteur...</Text>
        </View>
      );
    }
    if (!hasPlayableSource) {
      const lockedPoster = backdrop || playerPoster;
      return (
        <View style={styles.centerFill}>
          {lockedPoster ? <Image source={{ uri: lockedPoster }} style={styles.posterPlayerImage} resizeMode="cover" /> : null}
          <View style={styles.posterShade} />
          <Ionicons name="lock-closed-outline" size={38} color={Colors.yellow} />
          <Text style={styles.softText}>Source complete a configurer</Text>
          <Text style={styles.licenseText}>Aucune fausse video n'est lancee pour ce titre.</Text>
        </View>
      );
    }
    if (Platform.OS === "web" && playerId === "iframe") return renderIframe();
    if (Platform.OS === "web") return renderWebVideo();
    if (backdrop) {
      return (
        <Pressable style={styles.posterPlayer} onPress={() => openExternal(selectedSource?.url || streams.primary_url || payload?.watch_url || payload?.trailer_url)}>
          <Image source={{ uri: backdrop }} style={styles.posterPlayerImage} resizeMode="cover" />
          <View style={styles.posterShade} />
          <View style={styles.playCircle}>
            <Ionicons name="play" size={28} color="#000" />
          </View>
        </Pressable>
      );
    }
    return (
      <View style={styles.centerFill}>
        <Ionicons name="film-outline" size={38} color={Colors.textMuted} />
        <Text style={styles.softText}>Aucun lecteur disponible</Text>
      </View>
    );
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
              <Text style={styles.kicker}>FX PRO STREAM SANS PUB</Text>
              <Text testID="watch-title" style={styles.title} numberOfLines={2}>{details?.title || "Lecture"}</Text>
              <Text style={styles.subtitle} numberOfLines={2}>{meta || "VF / VO / VOSTFR - lecteurs multiples"}</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(40)} style={styles.profilePanel}>
            <View style={styles.profileHeader}>
              <Text style={styles.profileTitle}>Profils</Text>
              <Pressable onPress={addProfile} style={styles.profileAdd}>
                <Ionicons name="add" size={16} color="#000" />
              </Pressable>
            </View>
            <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileTrack}>
              {profiles.map((profile) => {
                const active = profile.id === activeProfileId;
                return (
                  <Pressable key={profile.id} onPress={() => switchProfile(profile)} style={[styles.profileChip, active && styles.profileChipActive]}>
                    <View style={[styles.profileAvatar, { backgroundColor: profile.color }]}>
                      <Text style={styles.profileAvatarText}>{profile.name.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View>
                      <Text style={[styles.profileName, active && styles.profileNameActive]}>{profile.name}</Text>
                      <Text style={[styles.profileMeta, active && styles.profileNameActive]}>{profile.maturity}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>

          <Animated.View key={profileSwitchKey} entering={SlideInRight.duration(260)} style={styles.profileSwitchNotice}>
            <Ionicons name="sparkles" size={16} color={Colors.cyan} />
            <Text style={styles.profileSwitchText}>Lecture personnalisee pour {activeProfile?.name || "profil"}.</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(80)} style={styles.playerPanel}>
            <View style={styles.playerTopBar}>
              <View>
                <Text style={styles.playerLabel}>Lecteur actif</Text>
                <Text style={styles.playerName}>{players.find((player) => player.id === playerId)?.name || "Video.js"}</Text>
              </View>
              <View style={styles.noAdPill}>
                <Ionicons name="shield-checkmark" size={14} color="#000" />
                <Text style={styles.noAdText}>Sans pub</Text>
              </View>
            </View>
            <View style={styles.playerSurface}>{renderPlayer()}</View>
            {playerError ? (
              <View style={styles.playerWarning}>
                <Ionicons name="warning-outline" size={16} color={Colors.yellow} />
                <Text style={styles.playerWarningText}>{playerError}</Text>
              </View>
            ) : null}

            <View style={styles.controlPanel}>
              <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipTrack}>
                {players.map((player) => {
                  const active = player.id === playerId;
                  return (
                    <Pressable key={player.id} onPress={() => { setPlayerId(player.id); setPlayerError(""); }} style={[styles.modeChip, active && styles.modeChipActive]}>
                      <Text style={[styles.modeText, active && styles.modeTextActive]}>{player.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipTrack}>
                {(payload?.audio_tracks || []).map((track) => {
                  const active = audioMode === track.id;
                  return (
                    <Pressable key={track.id} onPress={() => setAudioMode(track.id)} style={[styles.modeChip, active && styles.modeChipActive]}>
                      <Ionicons name="volume-high" size={14} color={active ? "#000" : Colors.textSoft} />
                      <Text style={[styles.modeText, active && styles.modeTextActive]}>{track.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipTrack}>
                {(payload?.subtitle_tracks || []).map((track) => {
                  const active = subtitleMode === track.id;
                  return (
                    <Pressable key={track.id} onPress={() => setSubtitleMode(track.id)} style={[styles.modeChip, active && styles.modeChipActive]}>
                      <Ionicons name="text-outline" size={14} color={active ? "#000" : Colors.textSoft} />
                      <Text style={[styles.modeText, active && styles.modeTextActive]}>{track.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipTrack}>
                {qualitySources.map((source) => {
                  const active = quality === source.quality;
                  return (
                    <Pressable key={source.quality} onPress={() => { setQuality(source.quality); setPlayerError(""); }} style={[styles.qualityChip, active && styles.qualityChipActive]}>
                      <Text style={[styles.qualityText, active && styles.qualityTextActive]}>{source.label || source.quality}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
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
            <Animated.View entering={FadeInUp.delay(140)} style={styles.infoPanel}>
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
              {mediaType === "tv" && seasonList.length ? (
                <View style={styles.episodePanel}>
                  <Text style={styles.episodeTitle}>Saisons et episodes</Text>
                  <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipTrack}>
                    {seasonList.map((season) => {
                      const active = selectedSeason === season.season_number;
                      return (
                        <Pressable
                          key={season.season_number}
                          onPress={() => {
                            setSelectedSeason(season.season_number);
                            setSelectedEpisode(1);
                          }}
                          style={[styles.modeChip, active && styles.modeChipActive]}
                        >
                          <Text style={[styles.modeText, active && styles.modeTextActive]}>{season.name || `Saison ${season.season_number}`}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <ScrollView horizontal style={styles.horizontalRail} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.episodeTrack}>
                    {episodeList.map((episode) => {
                      const active = selectedEpisode === episode.episode_number;
                      return (
                        <Pressable key={`${episode.season_number}-${episode.episode_number}`} onPress={() => setSelectedEpisode(episode.episode_number)} style={[styles.episodeCard, active && styles.episodeCardActive]}>
                          {episode.still_url ? <Image source={{ uri: episode.still_url }} style={styles.episodeImage} resizeMode="cover" /> : <View style={styles.episodeImageFallback}><Ionicons name="tv-outline" size={18} color={Colors.textMuted} /></View>}
                          <Text style={[styles.episodeName, active && styles.episodeNameActive]} numberOfLines={2}>E{episode.episode_number}. {episode.title}</Text>
                          <Text style={styles.episodeMeta}>{episode.runtime ? `${episode.runtime} min` : "VF/VO"} - sans pub</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {activeEpisode ? <Text style={styles.episodeSynopsis} numberOfLines={3}>{activeEpisode.overview || "Episode selectionne pret pour lecture avec les lecteurs actifs."}</Text> : null}
                </View>
              ) : null}
              {providerNames.length ? (
                <Text style={styles.providers}>Sources officielles detectees: {providerNames.join(", ")}</Text>
              ) : (
                <Text style={styles.providers}>Aucun fournisseur officiel detecte dans ta region pour ce titre.</Text>
              )}
              <View style={styles.actionRow}>
                <PrimaryButton title="Regarder" disabled={!hasPlayableSource} onPress={() => setPlayerError("")} icon={<Ionicons name="play" size={16} color="#000" />} style={styles.actionBtn} />
                <GhostButton title="Telecharger" onPress={() => (downloadSources.length ? setDownloadOpen(true) : setPlayerError("Telechargement indisponible: aucune source licenciee configuree pour ce titre."))} icon={<Ionicons name="download-outline" size={16} color={Colors.cyan} />} style={styles.actionBtn} />
                <GhostButton title="Changer de lecteur" onPress={cyclePlayer} icon={<Ionicons name="repeat-outline" size={16} color={Colors.cyan} />} style={styles.actionBtn} />
                {payload?.trailer_url ? (
                  <GhostButton title="Bande-annonce" onPress={() => openExternal(payload.trailer_url)} icon={<Ionicons name="open-outline" size={16} color={Colors.cyan} />} style={styles.actionBtn} />
                ) : null}
              </View>
              <Text style={styles.sourceNote}>{streams.source_note || "Lecture optimisee avec fallback automatique si une source echoue."}</Text>
            </Animated.View>
          ) : null}
        </ScrollView>

        <Modal visible={downloadOpen} transparent animationType="fade" onRequestClose={() => setDownloadOpen(false)}>
          <View style={styles.modalBg}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDownloadOpen(false)} />
            <Animated.View entering={FadeInUp.duration(220)} style={styles.downloadModal}>
              <Text style={styles.downloadTitle}>Choisir la qualite</Text>
              <Text style={styles.downloadText}>Telechargement disponible uniquement pour les fichiers autorises et sans publicite.</Text>
              {downloadSources.map((source) => (
                <Pressable key={source.quality} onPress={() => downloadSource(source)} style={styles.downloadRow}>
                  <View>
                    <Text style={styles.downloadQuality}>{source.label || source.quality}</Text>
                    <Text style={styles.downloadSize}>{source.size_label || "Fichier video"}</Text>
                  </View>
                  <Ionicons name="download-outline" size={20} color={Colors.cyan} />
                </Pressable>
              ))}
            </Animated.View>
          </View>
        </Modal>
      </SafeAreaView>
    </GradientBg>
  );
}

function buildPlayerDoc({
  playerId,
  title,
  videoUrl,
  hlsUrl,
  dashUrl,
  poster,
  subtitles,
  subtitleMode,
}: {
  playerId: PlayerId;
  title: string;
  videoUrl: string;
  hlsUrl: string;
  dashUrl: string;
  poster: string;
  subtitles: NonNullable<WatchPayload["subtitle_tracks"]>;
  subtitleMode: string;
}) {
  const safeVideo = escapeHtml(videoUrl);
  const safeHls = escapeHtml(hlsUrl);
  const safeDash = escapeHtml(dashUrl);
  const safePoster = escapeHtml(poster);
  const safeTitle = escapeHtml(title);
  const trackTags = subtitles
    .map((track) => `<track kind="subtitles" src="${escapeHtml(track.url)}" srclang="${escapeHtml(track.language)}" label="${escapeHtml(track.label)}" ${track.id === subtitleMode ? "default" : ""}>`)
    .join("");
  const baseCss = `html,body{margin:0;width:100%;height:100%;background:#000;font-family:Inter,Arial,sans-serif;color:#fff;overflow:hidden}video{width:100%;height:100%;object-fit:contain;background:#000}.label{position:absolute;left:14px;top:12px;z-index:5;background:rgba(0,0,0,.68);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:8px 12px;font-weight:900;font-size:12px}.state{position:absolute;right:14px;top:12px;z-index:5;background:#00ff9d;color:#00100b;border-radius:999px;padding:8px 12px;font-weight:900;font-size:12px}.err{position:absolute;left:14px;right:14px;bottom:12px;z-index:5;background:rgba(255,214,10,.12);border:1px solid rgba(255,214,10,.45);border-radius:14px;padding:10px 12px;color:#ffd60a;font-weight:800;display:none}`;
  if (playerId === "videojs") {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://vjs.zencdn.net/8.16.1/video-js.css" rel="stylesheet"><style>${baseCss}.video-js{width:100%;height:100%}</style></head><body><div class="label">${safeTitle} - Video.js HLS</div><div class="state">Sans pub</div><video id="player" class="video-js vjs-big-play-centered" controls playsinline preload="metadata" poster="${safePoster}">${trackTags}</video><div id="err" class="err">Source indisponible, change de lecteur.</div><script src="https://vjs.zencdn.net/8.16.1/video.min.js"></script><script>const p=videojs('player',{controls:true,fluid:false,responsive:true,html5:{vhs:{overrideNative:true}}});p.src({src:'${safeHls || safeVideo}',type:'${safeHls ? "application/x-mpegURL" : "video/mp4"}'});p.on('error',()=>{document.getElementById('err').style.display='block';p.src({src:'${safeVideo}',type:'video/mp4'});});</script></body></html>`;
  }
  if (playerId === "plyr") {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css"><style>${baseCss}.plyr,.plyr__video-wrapper{height:100%;background:#000}</style></head><body><div class="label">${safeTitle} - Plyr HLS</div><div class="state">Sans pub</div><video id="player" controls playsinline preload="metadata" poster="${safePoster}">${trackTags}</video><div id="err" class="err">Source indisponible, fallback MP4 actif.</div><script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js"></script><script src="https://cdn.plyr.io/3.7.8/plyr.polyfilled.js"></script><script>const v=document.getElementById('player');const fallback='${safeVideo}';if('${safeHls}'&&window.Hls&&Hls.isSupported()){const hls=new Hls();hls.loadSource('${safeHls}');hls.attachMedia(v);hls.on(Hls.Events.ERROR,()=>{document.getElementById('err').style.display='block';v.src=fallback;});}else{v.src=fallback;}new Plyr(v,{ratio:'16:9'});</script></body></html>`;
  }
  if (playerId === "dash") {
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseCss}</style></head><body><div class="label">${safeTitle} - DASH.js</div><div class="state">Sans pub</div><video id="player" controls playsinline preload="metadata" poster="${safePoster}">${trackTags}</video><div id="err" class="err">DASH indisponible, fallback MP4 actif.</div><script src="https://cdn.dashjs.org/latest/dash.all.min.js"></script><script>const v=document.getElementById('player');try{if('${safeDash}'&&window.dashjs){dashjs.MediaPlayer().create().initialize(v,'${safeDash}',false);}else{v.src='${safeVideo}';}}catch(e){document.getElementById('err').style.display='block';v.src='${safeVideo}';}</script></body></html>`;
  }
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseCss}</style></head><body><div class="label">${safeTitle} - ${playerId === "iframe" ? "iframe securise" : "HTML5 natif"}</div><div class="state">Sans pub</div><video controls playsinline preload="metadata" poster="${safePoster}" src="${safeVideo}">${trackTags}</video></body></html>`;
}

function escapeHtml(value: string) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, paddingBottom: 78, maxWidth: 1180, alignSelf: "center" },
  scrollCompact: { paddingHorizontal: 12 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingTop: 10, paddingBottom: 14 },
  backBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  kicker: { color: Colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 2, lineHeight: 32 },
  subtitle: { color: Colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 4 },
  horizontalRail: { width: "100%", maxWidth: "100%", flexGrow: 0 },
  profilePanel: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)", padding: 12, marginBottom: 10 },
  profileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  profileTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  profileAdd: { width: 32, height: 32, borderRadius: 12, backgroundColor: Colors.cyan, alignItems: "center", justifyContent: "center" },
  profileTrack: { gap: 8, paddingRight: 6 },
  profileChip: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "rgba(255,255,255,0.04)" },
  profileChipActive: { borderColor: Colors.cyan, backgroundColor: "rgba(0,255,255,0.12)" },
  profileAvatar: { width: 36, height: 36, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#000", fontWeight: "900" },
  profileName: { color: "#fff", fontWeight: "900", fontSize: 12 },
  profileMeta: { color: Colors.textMuted, fontWeight: "800", fontSize: 10, marginTop: 2 },
  profileNameActive: { color: "#fff" },
  profileSwitchNotice: { minHeight: 40, borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,255,255,0.28)", backgroundColor: "rgba(0,255,255,0.08)", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  profileSwitchText: { color: Colors.textSoft, fontWeight: "800", flex: 1 },
  playerPanel: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", backgroundColor: "rgba(10,10,18,0.94)" },
  playerTopBar: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  playerLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.4 },
  playerName: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 2 },
  noAdPill: { borderRadius: 999, backgroundColor: Colors.green, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 5 },
  noAdText: { color: "#000", fontSize: 11, fontWeight: "900" },
  playerSurface: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  softText: { color: Colors.textSoft, fontWeight: "700" },
  posterPlayer: { flex: 1, alignItems: "center", justifyContent: "center" },
  posterPlayerImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  posterShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)" },
  playCircle: { width: 70, height: 70, borderRadius: 24, backgroundColor: Colors.cyan, alignItems: "center", justifyContent: "center" },
  licenseText: { color: Colors.yellow, marginTop: 6, fontSize: 12, fontWeight: "800", textAlign: "center", paddingHorizontal: 18 },
  playerWarning: { borderTopWidth: 1, borderTopColor: "rgba(255,214,10,0.28)", backgroundColor: "rgba(255,214,10,0.08)", padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  playerWarningText: { color: Colors.yellow, flex: 1, fontSize: 12, fontWeight: "800" },
  controlPanel: { paddingVertical: 10, gap: 8 },
  chipTrack: { paddingHorizontal: 12, gap: 8 },
  modeChip: { minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.04)" },
  modeChipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  modeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  modeTextActive: { color: "#000" },
  qualityChip: { minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 11, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  qualityChipActive: { backgroundColor: Colors.magenta, borderColor: Colors.magenta },
  qualityText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  qualityTextActive: { color: "#fff" },
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
  episodePanel: { marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(0,0,0,0.22)", paddingVertical: 12, gap: 10 },
  episodeTitle: { color: "#fff", fontWeight: "900", paddingHorizontal: 12 },
  episodeTrack: { paddingHorizontal: 12, gap: 10 },
  episodeCard: { width: 168, minHeight: 150, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.045)" },
  episodeCardActive: { borderColor: Colors.cyan, backgroundColor: "rgba(0,255,255,0.1)" },
  episodeImage: { width: "100%", height: 82, backgroundColor: "rgba(255,255,255,0.06)" },
  episodeImageFallback: { height: 82, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  episodeName: { color: "#fff", fontWeight: "900", fontSize: 12, lineHeight: 16, paddingHorizontal: 9, paddingTop: 8 },
  episodeNameActive: { color: Colors.cyan },
  episodeMeta: { color: Colors.textMuted, fontSize: 10, fontWeight: "800", paddingHorizontal: 9, paddingTop: 4 },
  episodeSynopsis: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, paddingHorizontal: 12 },
  providers: { color: "#fff", fontWeight: "800", marginTop: 12, lineHeight: 19 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  actionBtn: { flexGrow: 1, minWidth: 160 },
  sourceNote: { color: Colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 10 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.74)", justifyContent: "flex-end", padding: 16 },
  downloadModal: { borderRadius: 24, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: "#101018", padding: 16, gap: 10 },
  downloadTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  downloadText: { color: Colors.textSoft, lineHeight: 19 },
  downloadRow: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)", padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  downloadQuality: { color: "#fff", fontWeight: "900" },
  downloadSize: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
});
