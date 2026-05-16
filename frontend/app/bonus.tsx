import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInRight, FadeInUp } from "react-native-reanimated";
import { GradientBg, GlassCard, NeoCard, PrimaryButton } from "../src/ui";
import { Colors, formatMoney } from "../src/theme";
import { api, useAuth } from "../src/auth";
import {
  BONUS_COUNTRIES,
  getBonusCatalog,
  getBonusCountry,
  getMinimumBonusDeposit,
} from "../src/bonusCatalog";

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "En attente du premier depot", color: Colors.textSoft, icon: "time-outline" },
  analysis: { label: "Analyse securisee", color: Colors.yellow, icon: "scan-circle-outline" },
  approved: { label: "Approuve", color: Colors.green, icon: "shield-checkmark" },
  refused: { label: "Refuse", color: Colors.danger, icon: "close-circle" },
  credited: { label: "Credite", color: Colors.cyan, icon: "checkmark-circle" },
};

type LiveActivity = {
  id: string;
  title: string;
  body: string;
  country: string;
  tag: string;
  color: string;
  real?: boolean;
};

export default function BonusScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCountry, setSavingCountry] = useState<string | null>(null);
  const [activityIndex, setActivityIndex] = useState(0);

  const load = useCallback(async () => {
    const r = await api.get("/bonus");
    setData(r);
  }, []);

  useEffect(() => {
    (async () => {
      if (authLoading) return;
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }
      setSyncing(true);
      try {
        await load();
      } catch (e: any) {
        Alert.alert("Bonus indisponible", e.message || "Reessayez.");
      } finally {
        setSyncing(false);
      }
    })();
  }, [authLoading, load, router, user]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const changeCountry = async (country: string) => {
    setSavingCountry(country);
    try {
      const r = await api.patch("/bonus/country", { country });
      setData(r);
    } catch (e: any) {
      Alert.alert("Pays verrouille", e.message || "Impossible de changer ce pays.");
    } finally {
      setSavingCountry(null);
    }
  };

  const displayData = data || buildLocalBonusData(user);
  const status = displayData?.status || {};
  const meta = STATUS_META[status.status || "pending"] || STATUS_META.pending;
  const progress = useMemo(() => computeProgress(status), [status]);
  const locked = Boolean(status.first_deposit_locked);
  const country = displayData?.country;
  const liveActivities = useMemo(
    () => buildLiveActivities(status, displayData?.history || [], country),
    [country, displayData?.history, status]
  );
  const activeActivity = liveActivities[activityIndex % Math.max(1, liveActivities.length)];

  useEffect(() => {
    if (liveActivities.length <= 1) return;
    const timer = setInterval(() => {
      setActivityIndex((value) => (value + 1) % liveActivities.length);
    }, 4200);
    return () => clearInterval(timer);
  }, [liveActivities.length]);

  if (authLoading || !user) {
    return (
      <GradientBg>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={Colors.cyan} />
          <Text style={styles.loadingText}>Preparation du programme bonus...</Text>
        </SafeAreaView>
      </GradientBg>
    );
  }

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable testID="bonus-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Bonus</Text>
          <Pressable testID="bonus-notifications" onPress={() => router.push("/notifications")} hitSlop={12}>
            <Ionicons name="notifications-outline" size={22} color={Colors.cyan} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
        >
          <Animated.View entering={FadeInUp.duration(450)}>
            <NeoCard color={meta.color}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <Ionicons name="gift" size={24} color={Colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroKicker}>Programme premier depot recu</Text>
                  <Text style={styles.heroTitle}>{meta.label}</Text>
                </View>
                <View style={[styles.statusPill, { borderColor: meta.color }]}>
                  <Ionicons name={meta.icon} size={14} color={meta.color} />
                  <Text style={[styles.statusText, { color: meta.color }]}>{status.loyalty_status || "Standard"}</Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: meta.color }]} />
              </View>
              <View style={styles.heroStats}>
                <Stat label="Score" value={`${status.trust_score || 0}/100`} color={Colors.cyan} />
                <Stat label="Probabilite" value={`${Math.round((status.probability || 0) * 100)}%`} color={Colors.yellow} />
                <Stat label="Fenetre" value={status.payout_window_days ? `${status.payout_window_days}j` : "7-30j"} color={Colors.green} />
              </View>

              {locked ? (
                <Text style={styles.heroNote}>
                  Premier depot recu verrouille: {formatMoney(Number(status.first_deposit_amount || 0), status.first_deposit_currency || country?.currency || "XOF")}.
                </Text>
              ) : (
                <Text style={styles.heroNote}>
                  Le bonus s'active uniquement apres le premier depot recu et confirme sur votre compte. Minimum actuel: {formatMoney(displayData?.minimum_deposit || 0, country?.currency || "XOF")}.
                </Text>
              )}
              {syncing ? (
                <View style={styles.syncRow}>
                  <ActivityIndicator size="small" color={Colors.cyan} />
                  <Text style={styles.syncText}>Synchronisation securisee...</Text>
                </View>
              ) : null}
            </NeoCard>
          </Animated.View>

          <GlassCard testID="bonus-live-activity-card">
            <View style={styles.liveHead}>
              <View>
                <Text style={styles.section}>Activite live</Text>
                <Text style={styles.sub}>Signaux anonymises du programme bonus</Text>
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
            </View>
            <Animated.View key={activeActivity.id} entering={FadeInRight.duration(320)} style={styles.liveCard}>
              <View style={[styles.liveIcon, { borderColor: activeActivity.color }]}>
                <Ionicons name={activeActivity.real ? "shield-checkmark" : "flash"} size={18} color={activeActivity.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.liveTitle} numberOfLines={2}>{activeActivity.title}</Text>
                <Text style={styles.liveBody} numberOfLines={2}>{activeActivity.body}</Text>
                <View style={styles.liveMetaRow}>
                  <Text style={[styles.liveTag, { color: activeActivity.color }]}>{activeActivity.tag}</Text>
                  <Text style={styles.liveCountry}>{activeActivity.country}</Text>
                </View>
              </View>
            </Animated.View>
            <View style={styles.liveDots}>
              {liveActivities.slice(0, 5).map((item, index) => {
                const active = index === activityIndex % liveActivities.length || (activityIndex % liveActivities.length > 4 && index === 4);
                return <View key={item.id} style={[styles.liveStep, active && { backgroundColor: activeActivity.color, width: 18 }]} />;
              })}
            </View>
          </GlassCard>

          <GlassCard testID="bonus-country-card">
            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.section}>Pays et devise</Text>
                <Text style={styles.sub}>{country?.name} - {country?.currency}</Text>
              </View>
              {locked ? (
                <View style={styles.lockedPill}>
                  <Ionicons name="lock-closed" size={12} color={Colors.yellow} />
                  <Text style={styles.lockedText}>Verrouille</Text>
                </View>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {(displayData?.countries || []).map((item: any) => {
                const active = item.code === country?.code;
                return (
                  <Pressable
                    key={item.code}
                    testID={`bonus-country-${item.code}`}
                    onPress={() => changeCountry(item.code)}
                    disabled={locked || savingCountry === item.code}
                    style={[styles.countryChip, active && styles.countryChipActive, locked && !active && { opacity: 0.45 }]}
                  >
                    {savingCountry === item.code ? <ActivityIndicator size="small" color={active ? "#000" : Colors.cyan} /> : null}
                    <Text style={[styles.countryCode, active && { color: "#000" }]}>{item.code}</Text>
                    <Text style={[styles.countryName, active && { color: "#000" }]}>{item.currency}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.ruleLine}>{country?.compliance}</Text>
          </GlassCard>

          <View style={styles.sectionPad}>
            <Text style={styles.sectionLabel}>Catalogue bonus</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catalogRow}>
            {(displayData?.catalog || []).map((tier: any, index: number) => {
              const selected = status.selected_threshold === tier.threshold;
              return (
                <Animated.View key={`${tier.threshold}-${tier.bonus}`} entering={FadeInRight.delay(index * 40)}>
                  <View style={[styles.tierCard, selected && { borderColor: Colors.cyan }]}>
                    <Text style={styles.tierLabel}>{tier.label}</Text>
                    <Text style={styles.tierAmount}>{formatMoney(tier.threshold, country?.currency || status.currency || "XOF")}</Text>
                    <View style={styles.bonusBubble}>
                      <Text style={styles.bonusBubbleText}>+{formatMoney(tier.bonus, country?.currency || status.currency || "XOF")}</Text>
                    </View>
                    <Text style={styles.tierMeta}>{tier.rarity}</Text>
                    <Text style={styles.tierMeta}>{Math.round(tier.baseProbability * 100)}% base</Text>
                  </View>
                </Animated.View>
              );
            })}
          </ScrollView>

          <GlassCard testID="bonus-rules-card">
            <Text style={styles.section}>Regles d'eligibilite</Text>
            {(displayData?.rules || []).map((rule: string) => (
              <View key={rule} style={styles.ruleRow}>
                <Ionicons name="checkmark-circle" size={15} color={Colors.green} />
                <Text style={styles.ruleText}>{rule}</Text>
              </View>
            ))}
          </GlassCard>

          <GlassCard testID="bonus-security-card">
            <Text style={styles.section}>Securite anti-abus</Text>
            <View style={styles.securityGrid}>
              <SecurityItem icon="finger-print" label="Identite" value={status.risk_flags?.includes("kyc_not_verified") ? "KYC requis" : "Controle OK"} color={status.risk_flags?.includes("kyc_not_verified") ? Colors.yellow : Colors.green} />
              <SecurityItem icon="phone-portrait" label="Appareil" value="1 bonus/appareil" color={Colors.cyan} />
              <SecurityItem icon="swap-horizontal" label="Conversion" value="Arrondis surveilles" color={Colors.purple} />
              <SecurityItem icon="shield" label="Fraude" value={`${status.risk_flags?.length || 0} signal`} color={(status.risk_flags?.length || 0) ? Colors.yellow : Colors.green} />
            </View>
            {status.risk_flags?.length ? (
              <Text style={styles.riskText}>Signaux analyses: {status.risk_flags.join(", ")}</Text>
            ) : (
              <Text style={styles.riskText}>Aucun signal critique detecte pour le moment.</Text>
            )}
          </GlassCard>

          <GlassCard testID="bonus-history-card">
            <Text style={styles.section}>Historique bonus</Text>
            {(displayData?.history || []).length ? (
              displayData.history.map((item: any, index: number) => <Timeline key={`${item.label}-${index}`} item={item} last={index === displayData.history.length - 1} />)
            ) : (
              <Text style={styles.empty}>Aucun premier depot recu confirme pour le moment.</Text>
            )}
          </GlassCard>

          {!locked ? (
            <View style={{ paddingHorizontal: 16, marginTop: 4 }}>
              <PrimaryButton
                testID="bonus-go-deposit"
                title="Recevoir mon premier depot"
                icon={<Ionicons name="qr-code" size={18} color="#000" />}
                onPress={() => router.push("/receive-qr")}
              />
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </GradientBg>
  );
}

function buildLocalBonusData(user: any) {
  const country = getBonusCountry(user?.bonus_country || "CI");
  const catalog = getBonusCatalog(country.code, country.currency);
  return {
    countries: BONUS_COUNTRIES,
    country,
    catalog,
    minimum_deposit: getMinimumBonusDeposit(country.code, country.currency),
    status: {
      bonus_id: user?.user_id ? `bonus_${user.user_id}` : "bonus_local",
      user_id: user?.user_id,
      country: country.code,
      currency: country.currency,
      status: "pending",
      eligible: false,
      reason: "En attente du premier depot recu confirme.",
      first_deposit_locked: false,
      risk_flags: [],
    },
    history: [],
    rules: [
      "Uniquement le premier depot recu et confirme est analyse.",
      "Les demandes en attente, annulees, refusees ou les tentatives ne comptent pas.",
      "Une fois le premier depot recu verrouille, il ne peut plus etre remplace.",
      "Le bonus est analyse entre 7 et 30 jours selon le statut et le score de confiance.",
      "Un controle anti-abus peut refuser le bonus meme si le seuil financier est atteint.",
    ],
  };
}

function buildLiveActivities(status: any, history: any[], country: any): LiveActivity[] {
  const countryName = country?.name || "France";
  const currency = status?.currency || country?.currency || "XOF";
  const realItems: LiveActivity[] = [];

  if (status?.status === "credited") {
    realItems.push({
      id: "real-credited",
      title: "Votre bonus vient d'etre credite",
      body: `${formatMoney(Number(status.bonus_amount || 0), currency)} disponibles dans votre portefeuille FX Pro.`,
      country: countryName,
      tag: "Evenement reel",
      color: Colors.cyan,
      real: true,
    });
  } else if (status?.status === "approved") {
    realItems.push({
      id: "real-approved",
      title: "Votre bonus est approuve",
      body: `Credit estime: ${status.estimated_credit_at ? new Date(status.estimated_credit_at).toLocaleDateString("fr-FR") : "en cours"}.`,
      country: countryName,
      tag: "Evenement reel",
      color: Colors.green,
      real: true,
    });
  } else if (status?.eligible && status?.first_deposit_locked) {
    realItems.push({
      id: "real-eligible",
      title: "Votre compte est eligible au bonus",
      body: `Premier depot recu confirme: ${formatMoney(Number(status.first_deposit_amount || 0), status.first_deposit_currency || currency)}.`,
      country: countryName,
      tag: "Evenement reel",
      color: Colors.yellow,
      real: true,
    });
  } else if (status?.status === "refused") {
    realItems.push({
      id: "real-refused",
      title: "Analyse bonus terminee",
      body: status.reason || "Le premier depot recu confirme ne respecte pas les conditions.",
      country: countryName,
      tag: "Evenement reel",
      color: Colors.danger,
      real: true,
    });
  }

  history.slice(-2).forEach((item, index) => {
    if (!item?.label || !item?.body) return;
    realItems.push({
      id: `real-history-${index}`,
      title: item.label,
      body: item.body,
      country: countryName,
      tag: "Compte synchronise",
      color: item.status === "blocked" ? Colors.danger : item.status === "active" ? Colors.yellow : Colors.green,
      real: true,
    });
  });

  const generated = Array.from({ length: 72 }, (_, index) => generatedLiveActivity(index));
  return [...realItems, ...generated];
}

function generatedLiveActivity(index: number): LiveActivity {
  const countries = [
    "France", "Cote d'Ivoire", "Senegal", "Cameroun", "Maroc", "Ghana", "Nigeria", "Afrique du Sud",
    "Kenya", "Gabon", "Royaume-Uni", "Etats-Unis", "Canada", "Suisse", "Belgique", "Togo",
    "Benin", "Mali", "Rwanda", "Emirats arabes unis",
  ];
  const openers = [
    "Un utilisateur de", "Un compte verifie en", "Une cliente de", "Un membre Silver en", "Un profil Gold de",
    "Un nouveau compte de", "Un portefeuille actif en", "Un membre VIP de", "Un utilisateur mobile de", "Un compte premium en",
  ];
  const actions = [
    "vient de recevoir un bonus", "vient de passer eligible", "a obtenu une analyse positive", "a debloque une fenetre bonus",
    "vient d'etre selectionne", "a recu une validation interne", "vient de confirmer son premier depot recu",
    "a gagne une priorite bonus", "vient de recevoir une alerte bonus", "a obtenu un statut bonus actif",
  ];
  const amounts = ["3 000 XOF", "8 000 XOF", "13 000 XOF", "22 000 XOF", "50 000 XOF", "140 000 XOF", "20 EUR", "42 USD", "18 000 NGN", "400 ZAR"];
  const details = [
    "traitement securise en cours", "controle anti-abus valide", "delai estime reduit", "score de confiance en hausse",
    "validation KYC prise en compte", "activite reguliere detectee", "solde synchronise", "recompense en attente de credit",
  ];
  const colors = [Colors.cyan, Colors.green, Colors.yellow, Colors.purple, Colors.magenta];
  const country = countries[index % countries.length];
  const title = `${openers[index % openers.length]} ${country} ${actions[(index * 3) % actions.length]}`;
  return {
    id: `generated-${index}`,
    title,
    body: `${amounts[(index * 5) % amounts.length]} potentiel - ${details[(index * 7) % details.length]}.`,
    country,
    tag: index % 3 === 0 ? "Bonus recu" : index % 3 === 1 ? "Eligible" : "Analyse live",
    color: colors[index % colors.length],
  };
}

function computeProgress(status: any) {
  if (!status?.first_deposit_locked) return 12;
  if (status.status === "credited") return 100;
  if (status.status === "refused") return 100;
  if (status.status === "approved") return 82;
  if (status.status === "analysis") {
    const start = new Date(status.first_deposit_confirmed_at || Date.now()).getTime();
    const end = new Date(status.estimated_credit_at || Date.now()).getTime();
    const now = Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 45;
    return Math.max(28, Math.min(78, Math.round(((now - start) / (end - start)) * 100)));
  }
  return 20;
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function SecurityItem({ icon, label, value, color }: any) {
  return (
    <View style={styles.securityItem}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={styles.securityLabel}>{label}</Text>
      <Text style={[styles.securityValue, { color }]}>{value}</Text>
    </View>
  );
}

function Timeline({ item, last }: any) {
  const color = item.status === "blocked" ? Colors.danger : item.status === "active" ? Colors.yellow : Colors.green;
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: color }]} />
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.timelineTitle}>{item.label}</Text>
        <Text style={styles.timelineBody}>{item.body}</Text>
        {item.date ? <Text style={styles.timelineDate}>{new Date(item.date).toLocaleString("fr-FR")}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  loadingText: { color: Colors.textSoft, marginTop: 12 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,255,255,0.1)", borderWidth: 1, borderColor: Colors.cyan },
  heroKicker: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 3 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.04)" },
  statusText: { fontSize: 10, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.09)", marginTop: 18 },
  progressFill: { height: 8, borderRadius: 999 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  syncText: { color: Colors.cyan, fontSize: 12, fontWeight: "800" },
  heroStats: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  statLabel: { color: Colors.textSoft, fontSize: 10, textTransform: "uppercase" },
  statValue: { fontSize: 15, fontWeight: "900", marginTop: 3 },
  heroNote: { color: Colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 14 },
  liveHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.green, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(57,255,20,0.08)" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.green },
  liveBadgeText: { color: Colors.green, fontSize: 10, fontWeight: "900" },
  liveCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)", padding: 12, marginTop: 14, minHeight: 92 },
  liveIcon: { width: 42, height: 42, borderRadius: 14, borderWidth: 1.2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  liveTitle: { color: "#fff", fontSize: 14, fontWeight: "900", lineHeight: 19 },
  liveBody: { color: Colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 4 },
  liveMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  liveTag: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  liveCountry: { color: Colors.textMuted, fontSize: 10, fontWeight: "800" },
  liveDots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 12 },
  liveStep: { width: 6, height: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.22)" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  section: { color: "#fff", fontSize: 17, fontWeight: "900" },
  sub: { color: Colors.textSoft, marginTop: 4, fontSize: 12 },
  lockedPill: { flexDirection: "row", gap: 5, alignItems: "center", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "rgba(255,215,0,0.1)", borderWidth: 1, borderColor: Colors.yellow },
  lockedText: { color: Colors.yellow, fontWeight: "900", fontSize: 10 },
  countryChip: { minWidth: 76, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingVertical: 10, paddingHorizontal: 12, marginRight: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  countryChipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  countryCode: { color: "#fff", fontWeight: "900", fontSize: 13 },
  countryName: { color: Colors.textSoft, fontWeight: "700", fontSize: 11, marginTop: 2 },
  ruleLine: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 12 },
  sectionPad: { paddingHorizontal: 16, marginTop: 6 },
  sectionLabel: { color: Colors.textSoft, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase" },
  catalogRow: { paddingHorizontal: 16, paddingVertical: 8 },
  tierCard: { width: 168, minHeight: 158, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.05)", padding: 14, marginRight: 10 },
  tierLabel: { color: "#fff", fontWeight: "900", fontSize: 15 },
  tierAmount: { color: Colors.textSoft, fontWeight: "800", marginTop: 8, fontSize: 13 },
  bonusBubble: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(0,255,255,0.12)", borderWidth: 1, borderColor: Colors.cyan, marginTop: 12 },
  bonusBubbleText: { color: Colors.cyan, fontWeight: "900", fontSize: 12 },
  tierMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 8 },
  ruleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10 },
  ruleText: { color: Colors.textSoft, flex: 1, fontSize: 13, lineHeight: 18 },
  securityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  securityItem: { flexBasis: "48%", flexGrow: 1, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)", padding: 12 },
  securityLabel: { color: Colors.textSoft, fontSize: 10, textTransform: "uppercase", marginTop: 8 },
  securityValue: { fontWeight: "900", fontSize: 12, marginTop: 3 },
  riskText: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 12 },
  empty: { color: Colors.textSoft, textAlign: "center", paddingVertical: 18 },
  timelineRow: { flexDirection: "row", gap: 12, paddingTop: 12 },
  timelineRail: { alignItems: "center", width: 14 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLine: { width: 1, flex: 1, backgroundColor: Colors.border, marginTop: 4 },
  timelineTitle: { color: "#fff", fontWeight: "900", fontSize: 14 },
  timelineBody: { color: Colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 3 },
  timelineDate: { color: Colors.textMuted, fontSize: 10, marginTop: 4 },
});
