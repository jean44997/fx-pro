import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
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
import * as Haptics from "expo-haptics";
import { GradientBg, GlassCard, GhostButton, PrimaryButton } from "../src/ui";
import { api, useAuth } from "../src/auth";
import { Colors, formatMoney } from "../src/theme";

type GiftPackage = {
  package_id: string;
  value: number;
  label: string;
};

type GiftCardProduct = {
  id: string;
  name: string;
  brand?: string;
  category: string;
  category_label?: string;
  country: string;
  currency: string;
  image: string;
  image_hd?: string;
  description: string;
  packages?: GiftPackage[];
  range?: { min: number; max: number; step: number };
  face_value: number;
  fx_price: number;
  fx_discount_percent: number;
  in_stock: boolean;
  source?: string;
};

const DEFAULT_COUNTRIES = ["FR", "XI", "US", "GB", "CA"];
const QUICK_SEARCHES = ["Amazon", "Steam", "PlayStation", "Netflix", "Spotify", "Uber", "Google"];

export default function GiftCardsScreen() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<GiftCardProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const [countries, setCountries] = useState<string[]>(DEFAULT_COUNTRIES);
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [country, setCountry] = useState(user?.bonus_country === "FR" ? "FR" : "");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [checkout, setCheckout] = useState<GiftCardProduct | null>(null);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [payment, setPayment] = useState({ email: user?.email || "", card: "", expiry: "", holder: user?.name || "" });
  const [buying, setBuying] = useState(false);

  const compact = width < 480;
  const columns = width >= 1024 ? 4 : width >= 768 ? 3 : width >= 480 ? 2 : 1;
  const cardWidth = columns === 1 ? "100%" : `${100 / columns - 1.3}%`;

  useEffect(() => {
    setPayment((prev) => ({
      ...prev,
      email: prev.email || user?.email || "",
      holder: prev.holder || user?.name || "",
    }));
  }, [user?.email, user?.name]);

  const load = useCallback(
    async (nextPage = 1, append = false) => {
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(nextPage));
        params.set("limit", compact ? "20" : "40");
        params.set("category", category);
        if (country) params.set("country", country);
        if (query.trim()) params.set("q", query.trim());
        const payload = await api.get(`/gift-cards/catalog?${params.toString()}`);
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setItems((prev) => (append ? dedupeGiftCards([...prev, ...nextItems]) : nextItems));
        setCategories(Array.isArray(payload.categories) ? payload.categories : []);
        setCategoryLabels(payload.category_labels || {});
        setCountries(Array.isArray(payload.countries) && payload.countries.length ? payload.countries : DEFAULT_COUNTRIES);
        setSource(payload.source || "");
        setPage(Number(payload.page || nextPage));
        setHasMore(Boolean(payload.has_more));
      } catch (e: any) {
        Alert.alert("Catalogue indisponible", e.message || "Impossible de charger les cartes cadeaux.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, compact, country, query]
  );

  const loadOrders = useCallback(async () => {
    try {
      const payload = await api.get("/gift-cards/orders");
      setOrders(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      load(1, false).catch(() => undefined);
    }, query.trim() ? 260 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    loadOrders().catch(() => undefined);
  }, [loadOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(1, false), loadOrders(), refresh()]);
    setRefreshing(false);
  };

  const openCheckout = (item: GiftCardProduct) => {
    setSelectedPackage(item.packages?.[0]?.package_id || "");
    setCustomValue(item.packages?.length ? "" : String(item.range?.min || item.face_value || 10));
    setPayment((prev) => ({ ...prev, email: prev.email || user?.email || "", holder: prev.holder || user?.name || "" }));
    setCheckout(item);
  };

  const selectedPackageObj = useMemo(() => {
    if (!checkout) return null;
    return checkout.packages?.find((pkg) => pkg.package_id === selectedPackage) || checkout.packages?.[0] || null;
  }, [checkout, selectedPackage]);

  const selectedValue = Number(selectedPackageObj?.value || customValue || checkout?.range?.min || checkout?.face_value || 0);
  const selectedFaceLabel = checkout ? `${selectedValue || 0} ${checkout.currency}` : "";
  const selectedFxPrice = checkout ? Math.max(0, selectedValue * (1 - Number(checkout.fx_discount_percent || 0) / 100)) : 0;

  const buyGiftCard = async () => {
    if (!checkout) return;
    const email = payment.email.trim();
    const cardDigits = payment.card.replace(/\D+/g, "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Email requis", "Entre un email valide pour recevoir la confirmation.");
      return;
    }
    if (cardDigits.length < 12) {
      Alert.alert("Carte bancaire requise", "Entre un numero valide. Seuls les 4 derniers chiffres sont conserves.");
      return;
    }
    try {
      setBuying(true);
      const payload = await api.post("/gift-cards/purchase", {
        product_id: checkout.id,
        package_id: selectedPackageObj?.package_id || undefined,
        value: selectedPackageObj ? undefined : selectedValue,
        quantity: 1,
        wallet_currency: "XOF",
        billing_email: email,
        recipient_email: email,
        card_last4: cardDigits.slice(-4),
        card_brand: detectCardBrand(cardDigits),
        card_holder: payment.holder.trim() || user?.name || "Client FX Pro",
      });
      await Promise.all([refresh(), loadOrders()]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setCheckout(null);
      Alert.alert(
        "Carte cadeau creditee",
        `${checkout.name} - ${payload.transaction?.reference || payload.purchase?.reference || "GIFT"}. Debit solde ${payload.transaction?.amount || 0} ${payload.transaction?.currency || "XOF"}.`
      );
    } catch (e: any) {
      Alert.alert("Achat indisponible", e.message || "Impossible de finaliser cette carte cadeau.");
    } finally {
      setBuying(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
        >
          <View style={styles.header}>
            <Pressable testID="gift-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={Colors.cyan} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kicker}>BITREFILL + FX PRO</Text>
              <Text testID="gift-title" style={styles.title}>Cartes cadeaux</Text>
              <Text style={styles.headerText}>
                Catalogue gift cards, gaming, streaming, voyage et mobile avec paiement par solde FX Pro.
              </Text>
            </View>
            <View style={styles.walletPill}>
              <Text style={styles.walletLabel}>Solde XOF</Text>
              <Text style={styles.walletValue} numberOfLines={1}>{formatMoney(user?.balances?.XOF || 0, "XOF")}</Text>
            </View>
          </View>

          <GlassCard style={styles.notice}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>Achat securise</Text>
              <Text style={styles.noticeText}>
                Les prix FX Pro appliquent des reductions internes. Les achats reels Bitrefill passent par le backend avec une cle serveur, jamais dans le front.
              </Text>
            </View>
          </GlassCard>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={Colors.textSoft} />
            <TextInput
              testID="gift-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher Amazon, Steam, Netflix..."
              placeholderTextColor={Colors.textMuted}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={18} color={Colors.textSoft} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
            {QUICK_SEARCHES.map((label) => (
              <Pressable key={label} onPress={() => setQuery(label)} style={styles.quickChip}>
                <Text style={styles.quickChipText}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
            {["all", ...categories.slice(0, 18)].map((cat) => {
              const active = category === cat;
              return (
                <Pressable key={cat} testID={`gift-category-${cat}`} onPress={() => setCategory(cat)} style={[styles.filterChip, active && styles.filterChipActive]}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{cat === "all" ? "Tout" : categoryLabels[cat] || cat}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
            {["", ...countries.slice(0, 16)].map((cc) => {
              const active = country === cc;
              return (
                <Pressable key={cc || "all"} testID={`gift-country-${cc || "all"}`} onPress={() => setCountry(cc)} style={[styles.countryChip, active && styles.countryChipActive]}>
                  <Text style={[styles.countryText, active && styles.countryTextActive]}>{cc || "Tous pays"}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.metaRow}>
            <Text style={styles.sourceText}>{items.length} carte(s) affichee(s) - source {source || "live"}</Text>
            <Pressable onPress={() => load(1, false)} style={styles.refreshMini}>
              <Ionicons name="refresh" size={14} color={Colors.cyan} />
              <Text style={styles.refreshText}>Actualiser</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.cyan} />
              <Text style={styles.loadingText}>Chargement du catalogue...</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {items.map((item, index) => (
                <Animated.View key={item.id} entering={FadeInUp.delay(index * 25)} style={{ width: cardWidth as any }}>
                  <GiftCard item={item} onBuy={() => openCheckout(item)} />
                </Animated.View>
              ))}
            </View>
          )}

          {hasMore ? (
            <PrimaryButton
              testID="gift-load-more"
              title={loadingMore ? "Chargement..." : "Charger plus de cartes"}
              loading={loadingMore}
              onPress={() => load(page + 1, true)}
            />
          ) : null}

          {orders.length ? (
            <GlassCard style={styles.ordersCard}>
              <Text style={styles.sectionTitle}>Derniers achats</Text>
              {orders.slice(0, 5).map((order) => (
                <View key={order.purchase_id || order.reference} style={styles.orderRow}>
                  <Image source={{ uri: order.product?.image || order.product?.image_hd }} resizeMode="contain" style={styles.orderImg} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.orderTitle} numberOfLines={1}>{order.product?.name || "Carte cadeau"}</Text>
                    <Text style={styles.orderSub}>{order.reference} - {order.status}</Text>
                  </View>
                  <Text style={styles.orderAmount}>{formatMoney(Number(order.debit_amount || 0), order.wallet_currency || "XOF")}</Text>
                </View>
              ))}
            </GlassCard>
          ) : null}
        </ScrollView>

        <Modal visible={Boolean(checkout)} transparent animationType="slide" onRequestClose={() => setCheckout(null)}>
          <Animated.View entering={FadeIn} style={styles.modalBg}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setCheckout(null)} />
            <View style={styles.modalCard}>
              <View style={styles.handle} />
              {checkout ? (
                <>
                  <View style={styles.modalProduct}>
                    <Image source={{ uri: checkout.image_hd || checkout.image }} resizeMode="contain" style={styles.modalImg} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.modalTitle}>{checkout.name}</Text>
                      <Text style={styles.modalSub}>{checkout.category_label || checkout.category} - {checkout.country}</Text>
                      <Text style={styles.discountLine}>-{checkout.fx_discount_percent}% FX Pro</Text>
                    </View>
                  </View>

                  {checkout.packages?.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packageRail}>
                      {checkout.packages.map((pkg) => {
                        const active = selectedPackage === pkg.package_id;
                        return (
                          <Pressable key={pkg.package_id} onPress={() => setSelectedPackage(pkg.package_id)} style={[styles.packageChip, active && styles.packageChipActive]}>
                            <Text style={[styles.packageText, active && styles.packageTextActive]}>{pkg.label || `${pkg.value} ${checkout.currency}`}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <>
                      <Text style={styles.lbl}>Montant ({checkout.range?.min} - {checkout.range?.max} {checkout.currency})</Text>
                      <TextInput value={customValue} onChangeText={setCustomValue} keyboardType="numeric" style={styles.input} placeholderTextColor={Colors.textMuted} />
                    </>
                  )}

                  <View style={styles.priceBox}>
                    <Text style={styles.priceLabel}>Valeur carte</Text>
                    <Text style={styles.priceValue}>{selectedFaceLabel}</Text>
                    <Text style={styles.priceLabel}>Prix FX Pro</Text>
                    <Text style={styles.fxValue}>{formatMoney(selectedFxPrice, checkout.currency)}</Text>
                  </View>

                  <Text style={styles.lbl}>Email reception</Text>
                  <TextInput testID="gift-pay-email" value={payment.email} onChangeText={(email) => setPayment((p) => ({ ...p, email }))} autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholderTextColor={Colors.textMuted} />
                  <Text style={styles.lbl}>Carte bancaire</Text>
                  <TextInput testID="gift-pay-card" value={payment.card} onChangeText={(card) => setPayment((p) => ({ ...p, card }))} keyboardType="number-pad" style={styles.input} placeholder="4242 4242 4242 4242" placeholderTextColor={Colors.textMuted} />
                  <View style={styles.splitRow}>
                    <TextInput testID="gift-pay-expiry" value={payment.expiry} onChangeText={(expiry) => setPayment((p) => ({ ...p, expiry }))} style={[styles.input, { flex: 1 }]} placeholder="MM/AA" placeholderTextColor={Colors.textMuted} />
                    <TextInput testID="gift-pay-holder" value={payment.holder} onChangeText={(holder) => setPayment((p) => ({ ...p, holder }))} style={[styles.input, { flex: 1 }]} placeholder="Nom carte" placeholderTextColor={Colors.textMuted} />
                  </View>
                  <Text style={styles.secureText}>Confirmation de paiement interne: seul ton solde FX Pro est debite. Les donnees carte ne sont pas stockees hors 4 derniers chiffres.</Text>
                  <PrimaryButton testID="gift-pay-submit" title="Payer avec mon solde" loading={buying} onPress={buyGiftCard} />
                  <GhostButton title="Annuler" onPress={() => setCheckout(null)} />
                </>
              ) : null}
            </View>
          </Animated.View>
        </Modal>
      </SafeAreaView>
    </GradientBg>
  );
}

function GiftCard({ item, onBuy }: { item: GiftCardProduct; onBuy: () => void }) {
  const [failed, setFailed] = useState(false);
  const image = failed ? `https://dummyimage.com/600x360/111827/00ffff&text=${encodeURIComponent(item.name.slice(0, 18))}` : item.image_hd || item.image;
  return (
    <GlassCard style={styles.card}>
      <View style={styles.imageWrap}>
        <Image testID={`gift-image-${item.id}`} source={{ uri: image }} resizeMode="contain" onError={() => setFailed(true)} style={styles.cardImg} />
      </View>
      <View style={styles.cardTop}>
        <Text style={styles.brand} numberOfLines={1}>{item.brand || "Bitrefill"}</Text>
        <View style={styles.discountBadge}>
          <Text style={styles.discountText}>-{item.fx_discount_percent}%</Text>
        </View>
      </View>
      <Text testID={`gift-name-${item.id}`} style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.cardDesc} numberOfLines={3}>{item.description}</Text>
      <View style={styles.cardMeta}>
        <Text style={styles.metaPill}>{item.category_label || item.category}</Text>
        <Text style={styles.metaPill}>{item.country}</Text>
      </View>
      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.faceText}>Des {formatMoney(item.fx_price || item.face_value, item.currency)}</Text>
          <Text style={styles.oldText}>Valeur {formatMoney(item.face_value || item.fx_price, item.currency)}</Text>
        </View>
        <Pressable testID={`gift-buy-${item.id}`} onPress={onBuy} disabled={!item.in_stock} style={[styles.buyBtn, !item.in_stock && { opacity: 0.5 }]}>
          <Ionicons name="card" size={15} color="#000" />
          <Text style={styles.buyText}>{item.in_stock ? "Acheter" : "Stock"}</Text>
        </Pressable>
      </View>
    </GlassCard>
  );
}

function dedupeGiftCards(list: GiftCardProduct[]) {
  const seen = new Set<string>();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function detectCardBrand(digits: string) {
  if (/^4/.test(digits)) return "Visa";
  if (/^5[1-5]/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  return "Carte bancaire";
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 140 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  backBtn: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.05)" },
  kicker: { color: Colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900" },
  headerText: { color: Colors.textSoft, marginTop: 4, lineHeight: 19 },
  walletPill: { maxWidth: 132, borderRadius: 16, borderWidth: 1, borderColor: Colors.cyan, backgroundColor: "rgba(0,255,255,0.08)", padding: 10 },
  walletLabel: { color: Colors.textSoft, fontSize: 10, fontWeight: "800" },
  walletValue: { color: "#fff", fontWeight: "900", marginTop: 2, fontSize: 12 },
  notice: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  noticeTitle: { color: "#fff", fontWeight: "900" },
  noticeText: { color: Colors.textSoft, marginTop: 3, lineHeight: 18 },
  searchRow: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, marginTop: 12 },
  searchInput: { color: "#fff", flex: 1, fontSize: 15, paddingVertical: 10 },
  chipRail: { gap: 8, paddingVertical: 10 },
  quickChip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)", paddingHorizontal: 12, paddingVertical: 8 },
  quickChipText: { color: Colors.textSoft, fontWeight: "800", fontSize: 12 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.045)" },
  filterChipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  filterText: { color: Colors.textSoft, fontWeight: "800", fontSize: 12, textTransform: "capitalize" },
  filterTextActive: { color: "#000" },
  countryChip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.04)" },
  countryChipActive: { backgroundColor: Colors.magenta, borderColor: Colors.magenta },
  countryText: { color: Colors.textSoft, fontWeight: "900", fontSize: 12 },
  countryTextActive: { color: "#fff" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginVertical: 8 },
  sourceText: { color: Colors.textMuted, fontSize: 12, flex: 1 },
  refreshMini: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: Colors.cyan, backgroundColor: "rgba(0,255,255,0.08)" },
  refreshText: { color: Colors.cyan, fontSize: 12, fontWeight: "800" },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  loadingText: { color: Colors.textSoft, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "stretch" },
  card: { marginBottom: 4, minHeight: 390, padding: 12 },
  imageWrap: { height: 132, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 12 },
  cardImg: { width: "92%", height: "86%" },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  brand: { color: Colors.cyan, fontWeight: "900", fontSize: 12, flex: 1 },
  discountBadge: { borderRadius: 999, backgroundColor: Colors.green, paddingHorizontal: 9, paddingVertical: 4 },
  discountText: { color: "#000", fontWeight: "900", fontSize: 11 },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 17, marginTop: 8, minHeight: 44 },
  cardDesc: { color: Colors.textSoft, lineHeight: 18, marginTop: 6, minHeight: 54 },
  cardMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  metaPill: { color: Colors.textSoft, fontSize: 11, fontWeight: "800", borderRadius: 999, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.08)" },
  cardFooter: { marginTop: "auto", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 12 },
  faceText: { color: "#fff", fontWeight: "900" },
  oldText: { color: Colors.textMuted, fontSize: 11, marginTop: 2, textDecorationLine: "line-through" },
  buyBtn: { minHeight: 38, borderRadius: 13, backgroundColor: Colors.cyan, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  buyText: { color: "#000", fontWeight: "900", fontSize: 12 },
  ordersCard: { marginTop: 14 },
  sectionTitle: { color: "#fff", fontWeight: "900", fontSize: 18, marginBottom: 8 },
  orderRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  orderImg: { width: 48, height: 34, borderRadius: 8, backgroundColor: "#fff" },
  orderTitle: { color: "#fff", fontWeight: "900" },
  orderSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  orderAmount: { color: Colors.green, fontWeight: "900", fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.76)", justifyContent: "flex-end" },
  modalCard: { maxHeight: "92%", borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#101018", borderWidth: 1, borderColor: Colors.borderStrong, padding: 16, gap: 10 },
  handle: { alignSelf: "center", width: 42, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.32)", marginBottom: 4 },
  modalProduct: { flexDirection: "row", gap: 12, alignItems: "center" },
  modalImg: { width: 98, height: 66, borderRadius: 14, backgroundColor: "#fff" },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  modalSub: { color: Colors.textSoft, marginTop: 3, fontSize: 12 },
  discountLine: { color: Colors.green, fontWeight: "900", marginTop: 5, fontSize: 12 },
  packageRail: { gap: 8, paddingVertical: 6 },
  packageChip: { borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.045)" },
  packageChipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  packageText: { color: Colors.textSoft, fontWeight: "900" },
  packageTextActive: { color: "#000" },
  priceBox: { borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", padding: 12, gap: 2 },
  priceLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "800" },
  priceValue: { color: "#fff", fontWeight: "900", fontSize: 16 },
  fxValue: { color: Colors.green, fontWeight: "900", fontSize: 18 },
  lbl: { color: Colors.textSoft, fontSize: 11, fontWeight: "900", textTransform: "uppercase", marginTop: 4 },
  input: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, color: "#fff", backgroundColor: "rgba(255,255,255,0.055)", paddingHorizontal: 12 },
  splitRow: { flexDirection: "row", gap: 10 },
  secureText: { color: Colors.textMuted, fontSize: 11, lineHeight: 16 },
});
