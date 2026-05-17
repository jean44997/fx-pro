import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
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
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { GradientBg, GhostButton, PrimaryButton } from "../src/ui";
import { Colors, CURRENCIES, formatMoney } from "../src/theme";
import { api, useAuth } from "../src/auth";
import {
  buildShopCatalogPayload,
  calculateShopCart,
  convertShopMoney,
  type ShopCatalogPayload,
} from "../src/shopCatalog";

type CartState = Record<string, number>;

const QUICK_SEARCHES = ["premium snack", "coffee", "energy", "chocolate", "tea", "protein"];

export default function Shop() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, refresh } = useAuth();
  const [currency, setCurrency] = useState(user?.bonus_country === "FR" ? "EUR" : "XOF");
  const [walletCurrency, setWalletCurrency] = useState(currency);
  const [query, setQuery] = useState("premium snack");
  const [category, setCategory] = useState("Tout");
  const [catalog, setCatalog] = useState<ShopCatalogPayload | null>(null);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<any[]>([]);
  const [cart, setCart] = useState<CartState>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState<ShopCatalogPayload["products"][number] | null>(null);

  const columns = width >= 1080 ? 3 : width >= 720 ? 2 : 1;
  const cardWidth = columns === 1 ? "100%" : `${100 / columns - 1.4}%`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogResponse, ratesResponse, orderResponse] = await Promise.all([
        api.get(`/shop/catalog?currency=${encodeURIComponent(currency)}&q=${encodeURIComponent(query)}`),
        api.get("/rates").catch(() => ({ rates: {} })),
        api.get("/shop/orders").catch(() => ({ items: [] })),
      ]);
      setCatalog(catalogResponse);
      setRates(ratesResponse.rates || {});
      setOrders(Array.isArray(orderResponse.items) ? orderResponse.items : []);
    } catch {
      const fallbackRates = await api.get("/rates").catch(() => ({ rates: {} }));
      setRates(fallbackRates.rates || {});
      setCatalog(buildShopCatalogPayload({ currency, rates: fallbackRates.rates || {} }));
    } finally {
      setLoading(false);
    }
  }, [currency, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setWalletCurrency(currency);
  }, [currency]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  const products = useMemo(() => catalog?.products || [], [catalog]);
  const categories = useMemo(() => ["Tout", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))], [products]);
  const visibleProducts = useMemo(() => {
    return products.filter((product) => category === "Tout" || product.category === category);
  }, [category, products]);
  const promoProducts = useMemo(() => products.filter((product) => product.promotion).slice(0, 2), [products]);
  const cartLines = useMemo(() => Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity })), [cart]);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotals = useMemo(() => {
    if (!catalog || !cartLines.length) return null;
    try {
      return calculateShopCart({
        products: catalog.products,
        lines: cartLines,
        orderCurrency: currency,
        walletCurrency,
        rates,
      });
    } catch {
      return null;
    }
  }, [cartLines, catalog, currency, rates, walletCurrency]);
  const walletBalance = Number((user?.balances || {})[walletCurrency] || 0);
  const debitAmount = cartTotals?.debit_amount || 0;
  const canPay = cartCount > 0 && walletBalance >= debitAmount && !checkingOut;

  const addToCart = (productId: string, quantity = 1) => {
    setCart((current) => {
      const product = products.find((item) => item.id === productId);
      const nextQty = Math.min(product?.stock || 8, Math.max(1, (current[productId] || 0) + quantity));
      return { ...current, [productId]: nextQty };
    });
    Haptics.selectionAsync().catch(() => undefined);
  };

  const setLineQty = (productId: string, quantity: number) => {
    setCart((current) => {
      const copy = { ...current };
      if (quantity <= 0) delete copy[productId];
      else copy[productId] = Math.min(8, Math.floor(quantity));
      return copy;
    });
  };

  const checkout = async () => {
    if (!cartTotals || !catalog) return;
    if (walletBalance < debitAmount) {
      Alert.alert(
        "Solde insuffisant",
        `Disponible: ${formatMoney(walletBalance, walletCurrency)}. Commande: ${formatMoney(debitAmount, walletCurrency)}. Recharge ton portefeuille via depot ou agence FX Pro.`
      );
      return;
    }
    setCheckingOut(true);
    try {
      const r = await api.post("/shop/checkout", {
        items: cartLines,
        currency,
        wallet_currency: walletCurrency,
        query,
        client_order_id: makeClientOrderId(),
      });
      setCart({});
      setCartOpen(false);
      await Promise.all([refresh(), load()]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (r.transaction?.txn_id) router.push({ pathname: "/receipt/[id]", params: { id: r.transaction.txn_id } });
    } catch (e: any) {
      Alert.alert("Commande impossible", e.message || "Verification paiement echouee.");
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <GradientBg>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <Pressable testID="shop-back" onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={25} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>Boutique FX Pro</Text>
          <Pressable testID="shop-cart" onPress={() => setCartOpen(true)} style={styles.cartButton}>
            <Ionicons name="bag-handle" size={20} color={Colors.cyan} />
            {cartCount > 0 ? <Text style={styles.cartBadge}>{cartCount}</Text> : null}
          </Pressable>
        </View>

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
          contentContainerStyle={styles.content}
        >
          <Animated.View entering={FadeInUp.duration(420)} style={styles.hero}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroKicker}>Marketplace securisee</Text>
              <Text style={styles.heroTitle}>Achats avec ton solde FX Pro</Text>
              <Text style={styles.heroText}>
                Choisis la devise d affichage, paie avec un portefeuille disponible, puis recupere le produit via une agence partenaire.
              </Text>
            </View>
            <View style={styles.heroIcon}>
              <Ionicons name="shield-checkmark" size={30} color="#000" />
            </View>
          </Animated.View>

          <SectionTitle title="Devise boutique" subtitle="Les prix se recalculent automatiquement avec les taux live disponibles." />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CURRENCIES.map((item) => {
              const active = currency === item.code;
              return (
                <Pressable key={item.code} testID={`shop-currency-${item.code}`} onPress={() => setCurrency(item.code)} style={[styles.currencyChip, active && styles.currencyChipActive]}>
                  <Text style={[styles.currencyChipText, active && styles.currencyChipTextActive]}>{item.code}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textSoft} />
            <TextInput
              testID="shop-search"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={load}
              placeholder="Rechercher un catalogue"
              placeholderTextColor={Colors.textMuted}
              style={styles.searchInput}
            />
            <Pressable onPress={load} style={styles.searchButton}>
              <Ionicons name="refresh" size={16} color="#000" />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {QUICK_SEARCHES.map((item) => (
              <Pressable key={item} onPress={() => setQuery(item)} style={[styles.quickChip, query === item && styles.quickChipActive]}>
                <Text style={[styles.quickChipText, query === item && { color: "#000" }]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading && !catalog ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.cyan} />
              <Text style={styles.loadingText}>Preparation du catalogue...</Text>
            </View>
          ) : (
            <>
              <SectionTitle title="Promotions du jour" subtitle="Deux offres limitees sont choisies automatiquement chaque jour." />
              <View style={styles.promoGrid}>
                {promoProducts.map((product, index) => (
                  <PromoCard key={product.id} product={product} index={index} onOpen={() => setSelected(product)} onAdd={() => addToCart(product.id)} />
                ))}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {categories.map((item) => {
                  const active = category === item;
                  return (
                    <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, active && styles.categoryChipActive]}>
                      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <SectionTitle title="Catalogue" subtitle={`${visibleProducts.length} produit(s) disponibles - source ${catalog?.source || "fallback"}.`} />
              <View style={styles.productGrid}>
                {visibleProducts.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={index}
                    width={cardWidth}
                    onOpen={() => setSelected(product)}
                    onAdd={() => addToCart(product.id)}
                  />
                ))}
              </View>

              <SectionTitle title="Commandes recentes" subtitle="Recu securise disponible apres paiement." />
              {orders.length ? (
                orders.slice(0, 4).map((order) => (
                  <Pressable key={order.order_id} onPress={() => order.transaction?.txn_id && router.push({ pathname: "/receipt/[id]", params: { id: order.transaction.txn_id } })} style={styles.orderCard}>
                    <View style={styles.orderIcon}>
                      <Ionicons name="receipt-outline" size={20} color={Colors.cyan} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.orderTitle} numberOfLines={1}>{order.reference || order.order_id}</Text>
                      <Text style={styles.orderText} numberOfLines={2}>{order.items?.length || 0} article(s) - retrait agence en preparation</Text>
                    </View>
                    <Text style={styles.orderAmount}>{formatMoney(Number(order.total || 0), order.currency || currency)}</Text>
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyOrders}>
                  <Ionicons name="bag-outline" size={24} color={Colors.textMuted} />
                  <Text style={styles.emptyOrdersText}>Aucune commande pour le moment.</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {cartCount > 0 ? (
          <Pressable testID="shop-floating-cart" onPress={() => setCartOpen(true)} style={styles.floatingCart}>
            <Ionicons name="bag-check" size={18} color="#000" />
            <Text style={styles.floatingCartText}>{cartCount} article(s) - {cartTotals ? formatMoney(cartTotals.total, currency) : "Panier"}</Text>
          </Pressable>
        ) : null}

        <ProductModal product={selected} onClose={() => setSelected(null)} onAdd={(id: string) => addToCart(id)} />
        <CartModal
          visible={cartOpen}
          onClose={() => setCartOpen(false)}
          catalog={catalog}
          cart={cart}
          setLineQty={setLineQty}
          currency={currency}
          walletCurrency={walletCurrency}
          setWalletCurrency={setWalletCurrency}
          walletBalance={walletBalance}
          debitAmount={debitAmount}
          totals={cartTotals}
          checkingOut={checkingOut}
          canPay={canPay}
          onCheckout={checkout}
        />
      </SafeAreaView>
    </GradientBg>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

function PromoCard({ product, index, onOpen, onAdd }: any) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80)} style={styles.promoCard}>
      <Pressable onPress={onOpen}>
        <Image source={{ uri: product.image }} style={styles.promoImage} />
        <View style={styles.promoOverlay}>
          <Text style={styles.promoBadge}>{product.promotion?.label}</Text>
          <Text style={styles.promoTitle} numberOfLines={2}>{product.title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.oldPrice}>{formatMoney(product.original_price, product.currency)}</Text>
            <Text style={styles.newPrice}>{formatMoney(product.price, product.currency)}</Text>
          </View>
        </View>
      </Pressable>
      <Pressable testID={`promo-add-${product.id}`} onPress={onAdd} style={styles.promoAdd}>
        <Ionicons name="add" size={16} color="#000" />
        <Text style={styles.promoAddText}>Ajouter</Text>
      </Pressable>
    </Animated.View>
  );
}

function ProductCard({ product, index, width, onOpen, onAdd }: any) {
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 12) * 35)} style={[styles.productCard, { width }]}>
      <Pressable onPress={onOpen}>
        <Image source={{ uri: product.image }} style={styles.productImage} />
        {product.promotion ? <Text style={styles.discountFlag}>-{product.promotion.discount_percent}%</Text> : null}
        <View style={styles.productBody}>
          <Text style={styles.productBrand}>{product.brand}</Text>
          <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
          <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text>
          <View style={styles.metaLine}>
            <InfoTiny icon="star" text={String(product.rating)} color={Colors.yellow} />
            <InfoTiny icon="cube" text={`${product.stock} dispo`} color={Colors.green} />
          </View>
          <View style={styles.cardFooter}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {product.promotion ? <Text style={styles.cardOldPrice}>{formatMoney(product.original_price, product.currency)}</Text> : null}
              <Text style={styles.cardPrice}>{formatMoney(product.price, product.currency)}</Text>
            </View>
            <Pressable testID={`shop-add-${product.id}`} onPress={onAdd} style={styles.addButton}>
              <Ionicons name="add" size={18} color="#000" />
            </Pressable>
          </View>
        </View>
      </Pressable>
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

function ProductModal({ product, onClose, onAdd }: any) {
  if (!product) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(220)} style={styles.modalBg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.productModal}>
          <Image source={{ uri: product.image }} style={styles.modalImage} />
          <Pressable onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <View style={styles.productBody}>
            <Text style={styles.productBrand}>{product.brand}</Text>
            <Text style={styles.modalTitle}>{product.title}</Text>
            <Text style={styles.modalDesc}>{product.description}</Text>
            <View style={styles.tagRow}>
              {product.tags?.slice(0, 4).map((tag: string) => <Text key={tag} style={styles.tag}>{tag}</Text>)}
            </View>
            <View style={styles.modalPriceBlock}>
              {product.promotion ? <Text style={styles.cardOldPrice}>{formatMoney(product.original_price, product.currency)}</Text> : null}
              <Text style={styles.modalPrice}>{formatMoney(product.price, product.currency)}</Text>
            </View>
            <Text style={styles.agencyText}>
              Retrait securise en agence partenaire apres validation du recu de commande.
            </Text>
            <PrimaryButton title="Ajouter au panier" icon={<Ionicons name="bag-add" size={16} color="#000" />} onPress={() => { onAdd(product.id); onClose(); }} />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

function CartModal({
  visible,
  onClose,
  catalog,
  cart,
  setLineQty,
  currency,
  walletCurrency,
  setWalletCurrency,
  walletBalance,
  debitAmount,
  totals,
  checkingOut,
  canPay,
  onCheckout,
}: any) {
  const items = totals?.items || [];
  const activeWallets = CURRENCIES.filter((item) => Number((catalog ? 1 : 0)) || item.code).sort((a, b) => (a.code === walletCurrency ? -1 : b.code === walletCurrency ? 1 : 0));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.cartSheet}>
          <View style={styles.handle} />
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>Panier securise</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 390 }} showsVerticalScrollIndicator={false}>
            {items.length ? (
              items.map((item: any) => (
                <View key={item.product_id} style={styles.cartLine}>
                  <Image source={{ uri: item.image }} style={styles.cartImage} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cartItemTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.cartItemPrice}>{formatMoney(item.unit_price, currency)} x {item.quantity}</Text>
                  </View>
                  <View style={styles.qtyBox}>
                    <Pressable onPress={() => setLineQty(item.product_id, item.quantity - 1)} style={styles.qtyBtn}>
                      <Ionicons name="remove" size={14} color="#fff" />
                    </Pressable>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
                    <Pressable onPress={() => setLineQty(item.product_id, item.quantity + 1)} style={styles.qtyBtn}>
                      <Ionicons name="add" size={14} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyOrdersText}>Panier vide.</Text>
            )}
          </ScrollView>

          <Text style={styles.walletLabel}>Portefeuille a debiter</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.walletRow}>
            {activeWallets.map((item) => {
              const active = walletCurrency === item.code;
              return (
                <Pressable key={item.code} onPress={() => setWalletCurrency(item.code)} style={[styles.walletChip, active && styles.walletChipActive]}>
                  <Text style={[styles.walletChipText, active && styles.walletChipTextActive]}>{item.code}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.totalBox}>
            <View>
              <Text style={styles.totalLabel}>Total commande</Text>
              <Text style={styles.totalValue}>{totals ? formatMoney(totals.total, currency) : formatMoney(0, currency)}</Text>
            </View>
            <View style={{ alignItems: "flex-end", flex: 1 }}>
              <Text style={styles.totalLabel}>Debit portefeuille</Text>
              <Text style={styles.totalValue}>{formatMoney(debitAmount || convertShopMoney(0, currency, walletCurrency, {}), walletCurrency)}</Text>
              <Text style={styles.balanceHint}>Solde: {formatMoney(walletBalance, walletCurrency)}</Text>
            </View>
          </View>
          {!canPay && items.length ? (
            <Text style={styles.payWarning}>
              Solde insuffisant. Recharge ton compte depuis Depot argent ou dans une agence FX Pro avant de valider.
            </Text>
          ) : (
            <Text style={styles.agencyText}>
              Paiement atomique: prix recalcules cote API, solde verifie, recu genere immediatement.
            </Text>
          )}
          <PrimaryButton title="Payer avec mon solde" loading={checkingOut} disabled={!canPay} icon={<Ionicons name="shield-checkmark" size={16} color="#000" />} onPress={onCheckout} />
          <GhostButton title="Continuer mes achats" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function makeClientOrderId() {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `shop_${raw.replace(/-/g, "").slice(0, 18)}`;
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  topTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  cartButton: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.06)" },
  cartBadge: { position: "absolute", top: -6, right: -5, minWidth: 20, height: 20, borderRadius: 10, textAlign: "center", overflow: "hidden", backgroundColor: Colors.magenta, color: "#fff", fontSize: 11, fontWeight: "900", lineHeight: 20 },
  content: { paddingBottom: 150 },
  hero: { marginHorizontal: 16, marginTop: 8, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: "rgba(255,255,255,0.075)", flexDirection: "row", alignItems: "center", gap: 14 },
  heroKicker: { color: Colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1.6, textTransform: "uppercase" },
  heroTitle: { color: "#fff", fontSize: 27, fontWeight: "900", marginTop: 4, lineHeight: 31 },
  heroText: { color: Colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 8 },
  heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cyan },
  sectionTitle: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
  sectionText: { color: "#fff", fontSize: 19, fontWeight: "900" },
  sectionSub: { color: Colors.textSoft, fontSize: 12, marginTop: 3, lineHeight: 17 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 4, gap: 8 },
  currencyChip: { minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.045)", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  currencyChipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  currencyChipText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  currencyChipTextActive: { color: "#000" },
  searchBox: { marginHorizontal: 16, marginTop: 10, minHeight: 48, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.06)", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 },
  searchInput: { color: "#fff", flex: 1, minWidth: 0, fontSize: 14, paddingVertical: Platform.OS === "web" ? 12 : 8 },
  searchButton: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cyan },
  quickChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)" },
  quickChipActive: { backgroundColor: Colors.yellow, borderColor: Colors.yellow },
  quickChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  loadingBox: { margin: 16, padding: 26, alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)" },
  loadingText: { color: Colors.textSoft, marginTop: 10, fontWeight: "700" },
  promoGrid: { paddingHorizontal: 16, gap: 12 },
  promoCard: { borderRadius: 24, overflow: "hidden", minHeight: 210, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: Colors.bgCard },
  promoImage: { width: "100%", height: 210, backgroundColor: Colors.bgSoft },
  promoOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", padding: 16, backgroundColor: "rgba(0,0,0,0.28)" },
  promoBadge: { alignSelf: "flex-start", color: "#000", backgroundColor: Colors.yellow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: "900", overflow: "hidden" },
  promoTitle: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 10, textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 10 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8, flexWrap: "wrap" },
  oldPrice: { color: Colors.textSoft, textDecorationLine: "line-through", fontWeight: "800" },
  newPrice: { color: Colors.cyan, fontSize: 20, fontWeight: "900" },
  promoAdd: { position: "absolute", right: 12, top: 12, borderRadius: 999, backgroundColor: Colors.cyan, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  promoAddText: { color: "#000", fontWeight: "900", fontSize: 12 },
  categoryChip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  categoryChipActive: { backgroundColor: Colors.magenta, borderColor: Colors.magenta },
  categoryChipText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  categoryChipTextActive: { color: "#fff", fontWeight: "900" },
  productGrid: { paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "stretch" },
  productCard: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.06)" },
  productImage: { width: "100%", height: 168, backgroundColor: Colors.bgSoft },
  discountFlag: { position: "absolute", top: 10, left: 10, color: "#000", backgroundColor: Colors.yellow, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, overflow: "hidden", fontWeight: "900", fontSize: 11 },
  productBody: { padding: 14 },
  productBrand: { color: Colors.cyan, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2 },
  productTitle: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 5, lineHeight: 21 },
  productDesc: { color: Colors.textSoft, fontSize: 12, lineHeight: 17, marginTop: 7 },
  metaLine: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  infoTiny: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.055)" },
  infoTinyText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 13, gap: 8 },
  cardOldPrice: { color: Colors.textMuted, fontSize: 11, textDecorationLine: "line-through", fontWeight: "800" },
  cardPrice: { color: "#fff", fontSize: 18, fontWeight: "900" },
  addButton: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cyan },
  orderCard: { marginHorizontal: 16, marginVertical: 5, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", flexDirection: "row", alignItems: "center", gap: 11 },
  orderIcon: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.cyan, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,255,255,0.08)" },
  orderTitle: { color: "#fff", fontWeight: "900", fontSize: 13 },
  orderText: { color: Colors.textSoft, fontSize: 11, marginTop: 3 },
  orderAmount: { color: Colors.cyan, fontWeight: "900", fontSize: 12, maxWidth: 120 },
  emptyOrders: { marginHorizontal: 16, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center" },
  emptyOrdersText: { color: Colors.textSoft, textAlign: "center", fontSize: 12, marginTop: 8 },
  floatingCart: { position: "absolute", left: 16, right: 16, bottom: 22, minHeight: 54, borderRadius: 999, backgroundColor: Colors.cyan, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, shadowColor: Colors.cyan, shadowOpacity: 0.45, shadowRadius: 14 },
  floatingCartText: { color: "#000", fontWeight: "900" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.74)", justifyContent: "flex-end" },
  productModal: { margin: 16, maxHeight: "88%", borderRadius: 26, overflow: "hidden", backgroundColor: "#101018", borderWidth: 1, borderColor: Colors.borderStrong },
  modalImage: { width: "100%", height: 260, backgroundColor: Colors.bgSoft },
  modalClose: { position: "absolute", top: 12, right: 12, width: 38, height: 38, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  modalTitle: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 6, lineHeight: 29 },
  modalDesc: { color: Colors.textSoft, fontSize: 14, lineHeight: 20, marginTop: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  tag: { color: "#fff", fontSize: 11, fontWeight: "800", borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.045)" },
  modalPriceBlock: { marginTop: 14 },
  modalPrice: { color: Colors.cyan, fontSize: 28, fontWeight: "900" },
  agencyText: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 10 },
  cartSheet: { backgroundColor: "#0a0a14", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 24, borderWidth: 1, borderColor: Colors.borderStrong, maxHeight: "90%" },
  handle: { alignSelf: "center", width: 42, height: 4, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.28)", marginBottom: 12 },
  cartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cartTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  cartLine: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  cartImage: { width: 58, height: 58, borderRadius: 16, backgroundColor: Colors.bgSoft },
  cartItemTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  cartItemPrice: { color: Colors.textSoft, fontSize: 11, marginTop: 4 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, padding: 4 },
  qtyBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  qtyText: { color: "#fff", fontWeight: "900", minWidth: 18, textAlign: "center" },
  walletLabel: { color: Colors.textSoft, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.4, marginTop: 14 },
  walletRow: { gap: 8, paddingVertical: 9 },
  walletChip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 12, paddingVertical: 8 },
  walletChipActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  walletChipText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  walletChipTextActive: { color: "#000" },
  totalBox: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", padding: 13, flexDirection: "row", justifyContent: "space-between", gap: 14 },
  totalLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  totalValue: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 4 },
  balanceHint: { color: Colors.textSoft, fontSize: 11, marginTop: 4 },
  payWarning: { color: Colors.yellow, fontSize: 12, lineHeight: 18, marginTop: 10, fontWeight: "800" },
});
