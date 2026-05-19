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
  fetchDummyJsonShopProducts,
  fetchEscuelajsShopProducts,
  fetchFakeStoreShopProducts,
  fetchFreeEcommerceShopProducts,
  type ShopCatalogPayload,
} from "../src/shopCatalog";

type CartState = Record<string, number>;
type ShopSection = "buy" | "orders" | "promos" | "seller" | "help";

const EMPTY_SELLER_FORM = {
  title: "",
  description: "",
  category: "Vendeurs certifies",
  image: "",
  price: "",
  stock: "1",
  tags: "",
};

export default function Shop() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, refresh } = useAuth();
  const [currency, setCurrency] = useState(user?.bonus_country === "FR" ? "EUR" : "XOF");
  const [walletCurrency, setWalletCurrency] = useState(currency);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tout");
  const [activeSection, setActiveSection] = useState<ShopSection>("buy");
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [catalog, setCatalog] = useState<ShopCatalogPayload | null>(null);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<any[]>([]);
  const [seller, setSeller] = useState<any>(null);
  const [sellerArticles, setSellerArticles] = useState<any[]>([]);
  const [sellerOrders, setSellerOrders] = useState<any[]>([]);
  const [sellerSaving, setSellerSaving] = useState(false);
  const [sellerForm, setSellerForm] = useState(EMPTY_SELLER_FORM);
  const [sellerProfileForm, setSellerProfileForm] = useState({ store_name: "", bio: "", city: "", support_phone: "", pickup_zone: "" });
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [cart, setCart] = useState<CartState>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState<ShopCatalogPayload["products"][number] | null>(null);

  const compact = width < 760;
  const columns = width >= 1280 ? 4 : width >= 980 ? 3 : width >= 680 ? 2 : 1;
  const cardWidth = columns === 1 ? "100%" : `${100 / columns - 1.4}%`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogResponse, ratesResponse, orderResponse, sellerResponse] = await Promise.all([
        api.get(`/shop/catalog?currency=${encodeURIComponent(currency)}&q=market`),
        api.get("/rates").catch(() => ({ rates: {} })),
        api.get("/shop/orders").catch(() => ({ items: [] })),
        api.get("/shop/seller/profile").catch(() => null),
      ]);
      setCatalog(catalogResponse);
      setRates(ratesResponse.rates || {});
      setOrders(Array.isArray(orderResponse.items) ? orderResponse.items : []);
      if (sellerResponse) syncSellerState(sellerResponse);
    } catch {
      const [fallbackRates, dummyProducts, freeProducts, fakeStoreProducts, escuelajsProducts] = await Promise.all([
        api.get("/rates").catch(() => ({ rates: {} })),
        fetchDummyJsonShopProducts(150),
        fetchFreeEcommerceShopProducts(),
        fetchFakeStoreShopProducts(),
        fetchEscuelajsShopProducts(),
      ]);
      setRates(fallbackRates.rates || {});
      setCatalog(buildShopCatalogPayload({ dummyProducts, freeProducts, fakeStoreProducts, escuelajsProducts, currency, rates: fallbackRates.rates || {} }));
    } finally {
      setLoading(false);
    }
  }, [currency]);

  const syncSellerState = (payload: any) => {
    setSeller(payload?.profile || null);
    setSellerArticles(Array.isArray(payload?.articles) ? payload.articles : []);
    setSellerOrders(Array.isArray(payload?.orders) ? payload.orders : []);
    const profile = payload?.profile || {};
    setSellerProfileForm({
      store_name: profile.store_name || "",
      bio: profile.bio || "",
      city: profile.city || "",
      support_phone: profile.support_phone || "",
      pickup_zone: profile.pickup_zone || "",
    });
  };

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setWalletCurrency(currency);
  }, [currency]);

  useEffect(() => {
    setVisibleLimit(24);
  }, [category, query]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  const products = useMemo(() => catalog?.products || [], [catalog]);
  const categories = useMemo(() => ["Tout", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))], [products]);
  const quickSearches = useMemo(() => {
    const tags = products.flatMap((product) => product.tags || []).filter(Boolean);
    return Array.from(new Set(tags)).slice(0, 10);
  }, [products]);
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const inCategory = category === "Tout" || product.category === category;
      if (!inCategory) return false;
      if (!q) return true;
      const haystack = [product.title, product.brand, product.category, product.description, product.sku, product.ref, ...(product.tags || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [category, products, query]);
  const visibleProducts = useMemo(() => filteredProducts.slice(0, visibleLimit), [filteredProducts, visibleLimit]);
  const promoProducts = useMemo(() => products.filter((product) => product.promotion), [products]);
  const adProducts = useMemo(() => {
    const promoted = promoProducts.length ? promoProducts : products;
    return [...promoted]
      .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 8);
  }, [products, promoProducts]);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickSearches.slice(0, 6).map((label) => ({ type: "tag", label, sub: undefined as string | undefined }));
    const seen = new Set<string>();
    const productHits = products
      .filter((product) => [product.title, product.brand, product.category, ...(product.tags || [])].join(" ").toLowerCase().includes(q))
      .map((product) => ({ type: "product", label: product.title, sub: product.brand || product.category }))
      .filter((item) => {
        const key = item.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
    const tagHits = quickSearches
      .filter((tag) => tag.toLowerCase().includes(q) && !seen.has(tag.toLowerCase()))
      .slice(0, 3)
      .map((label) => ({ type: "tag", label, sub: undefined as string | undefined }));
    return [...productHits, ...tagHits].slice(0, 8);
  }, [products, query, quickSearches]);
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
  const bestWallet = useMemo(() => {
    if (!cartTotals) return walletCurrency;
    const balances = user?.balances || {};
    return (
      CURRENCIES.map((item) => {
        const debit = convertShopMoney(cartTotals.total, currency, item.code, rates);
        const balance = Number((balances as any)[item.code] || 0);
        return { code: item.code, debit, balance, ok: balance >= debit };
      })
        .sort((a, b) => Number(b.ok) - Number(a.ok) || b.balance - a.balance)[0]?.code || walletCurrency
    );
  }, [cartTotals, currency, rates, user?.balances, walletCurrency]);

  useEffect(() => {
    if (cartCount > 0 && bestWallet !== walletCurrency && walletBalance < debitAmount) setWalletCurrency(bestWallet);
  }, [bestWallet, cartCount, debitAmount, walletBalance, walletCurrency]);

  const addToCart = (productId: string, quantity = 1) => {
    const product = products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) {
      Alert.alert("Produit indisponible", "Cet article n'est pas disponible pour le moment.");
      return;
    }
    setCart((current) => {
      const nextQty = Math.min(product?.stock || 8, Math.max(1, (current[productId] || 0) + quantity));
      return { ...current, [productId]: nextQty };
    });
    Haptics.selectionAsync().catch(() => undefined);
  };

  const setLineQty = (productId: string, quantity: number) => {
    setCart((current) => {
      const copy = { ...current };
      const product = products.find((item) => item.id === productId);
      const max = Math.max(1, Math.min(8, Number(product?.stock || 1)));
      if (quantity <= 0) delete copy[productId];
      else copy[productId] = Math.min(max, Math.floor(quantity));
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
        query: query || "market",
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

  const reloadSeller = async () => {
    const payload = await api.get("/shop/seller/profile");
    syncSellerState(payload);
  };

  const saveSellerProfile = async () => {
    setSellerSaving(true);
    try {
      const payload = await api.patch("/shop/seller/profile", sellerProfileForm);
      setSeller(payload.profile);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (e: any) {
      Alert.alert("Profil vendeur", e.message || "Mise a jour impossible.");
    } finally {
      setSellerSaving(false);
    }
  };

  const submitSellerArticle = async () => {
    const payload = {
      title: sellerForm.title,
      description: sellerForm.description,
      category: sellerForm.category,
      image: sellerForm.image,
      price: Number(String(sellerForm.price).replace(",", ".")),
      stock: Number(sellerForm.stock),
      tags: sellerForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    setSellerSaving(true);
    try {
      if (editingArticle?.article_id) await api.patch(`/shop/seller/articles/${encodeURIComponent(editingArticle.article_id)}`, payload);
      else await api.post("/shop/seller/articles", payload);
      setSellerForm(EMPTY_SELLER_FORM);
      setEditingArticle(null);
      await Promise.all([reloadSeller(), load()]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (e: any) {
      Alert.alert("Article vendeur", e.message || "Publication impossible.");
    } finally {
      setSellerSaving(false);
    }
  };

  const editSellerArticle = (article: any) => {
    setEditingArticle(article);
    setSellerForm({
      title: article.title || "",
      description: article.description || "",
      category: article.category || "Vendeurs certifies",
      image: article.image || "",
      price: String(article.base_price || article.price || ""),
      stock: String(article.stock ?? 1),
      tags: Array.isArray(article.tags) ? article.tags.join(", ") : "",
    });
    setActiveSection("seller");
  };

  const deleteSellerArticle = (article: any) => {
    Alert.alert("Supprimer l'article", "Cette annonce sera retiree du catalogue vendeur.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          setSellerSaving(true);
          try {
            await api.del(`/shop/seller/articles/${encodeURIComponent(article.article_id)}`);
            await Promise.all([reloadSeller(), load()]);
          } catch (e: any) {
            Alert.alert("Suppression impossible", e.message || "Reessaie dans un instant.");
          } finally {
            setSellerSaving(false);
          }
        },
      },
    ]);
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
          <Animated.View entering={FadeInUp.duration(420)} style={[styles.hero, compact && styles.heroCompact]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroKicker}>Services boutique disponibles</Text>
              <Text style={styles.heroTitle}>Achats et vendeurs en ligne actifs</Text>
              <Text style={styles.heroText}>
                Choisis la devise d affichage, paie avec un portefeuille disponible, suis la commande et laisse les vendeurs KYC recevoir leurs notifications en direct.
              </Text>
            </View>
            <View style={styles.heroIcon}>
              <Ionicons name="shield-checkmark" size={30} color="#000" />
            </View>
          </Animated.View>

          <View style={styles.statGrid}>
            <ShopStat icon="storefront" label="Catalogue" value={`${products.length || "..."} articles`} />
            <ShopStat icon="pricetags" label="Promos" value={`${promoProducts.length || 0} actives`} />
            <ShopStat icon="receipt" label="Commandes" value={`${orders.length} recu(s)`} />
          </View>
          <InfoBanner
            icon="megaphone-outline"
            title="Vente en ligne disponible"
            text="Boutique en ligne, profils vendeurs certifies KYC, commandes suivies et notifications vendeur sont actives."
          />

          <View style={[styles.sectionTabs, compact && styles.sectionTabsWrap]}>
            {[
              ["buy", "Acheter", "storefront-outline"],
              ["orders", "Commandes", "receipt-outline"],
              ["promos", "Promos", "pricetags-outline"],
              ["seller", "Vendeur", "shield-checkmark-outline"],
              ["help", "Aide", "shield-checkmark-outline"],
            ].map(([key, label, icon]) => {
              const active = activeSection === key;
              return (
                <Pressable key={key} onPress={() => setActiveSection(key as ShopSection)} style={[styles.sectionTab, compact && styles.sectionTabCompact, active && styles.sectionTabActive]}>
                  <Ionicons name={icon as any} size={15} color={active ? "#000" : Colors.textSoft} />
                  <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

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
              placeholder="Tape une lettre: produit, marque, categorie, mot-cle"
              placeholderTextColor={Colors.textMuted}
              style={styles.searchInput}
            />
            <Pressable onPress={() => setQuery("")} style={styles.searchButton}>
              <Ionicons name={query ? "close" : "sparkles"} size={16} color="#000" />
            </Pressable>
          </View>
          {suggestions.length ? (
            <View style={styles.suggestionsBox}>
              {suggestions.map((item) => (
                <Pressable key={`${item.type}-${item.label}`} onPress={() => setQuery(item.label)} style={styles.suggestionItem}>
                  <Ionicons name={item.type === "product" ? "cube-outline" : "pricetag-outline"} size={15} color={Colors.cyan} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>{item.label}</Text>
                    {item.sub ? <Text style={styles.suggestionSub} numberOfLines={1}>{item.sub}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {quickSearches.map((item) => (
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
              {activeSection === "buy" ? (
                <>
                  <SectionTitle title="Top promos" subtitle="Deux articles du jour profitent de -80% et -50%." />
                  <View style={styles.promoGrid}>
                    {promoProducts.slice(0, 2).map((product, index) => (
                      <PromoCard key={product.id} product={product} index={index} onOpen={() => setSelected(product)} onAdd={() => addToCart(product.id)} />
                    ))}
                  </View>
                  <SectionTitle title="Mini pubs" subtitle="Selections courtes pour motiver l'achat sans alourdir la page." />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adRow}>
                    {adProducts.map((product) => (
                      <MiniAdCard key={`ad-${product.id}`} product={product} onOpen={() => setSelected(product)} onAdd={() => addToCart(product.id)} />
                    ))}
                  </ScrollView>
                  <SectionTitle title="Rayons" subtitle="La recherche reste locale: une lettre suffit pour filtrer sans ralentir le catalogue." />
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

                  <SectionTitle title="Catalogue" subtitle={`${filteredProducts.length} resultat(s), ${products.length} article(s) charges - source ${catalog?.source || "fallback"}.`} />
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
                  {visibleProducts.length < filteredProducts.length ? (
                    <Pressable onPress={() => setVisibleLimit((value) => value + 24)} style={styles.moreButton}>
                      <Ionicons name="chevron-down" size={17} color="#000" />
                      <Text style={styles.moreButtonText}>Voir plus</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}

              {activeSection === "orders" ? (
                <>
                  <SectionTitle title="Commandes" subtitle="Suivi, recu, reference et statut logistique restent au meme endroit." />
                  <InfoBanner
                    icon="alert-circle"
                    title="Retrait en pause"
                    text={catalog?.pickup_message || "Le retrait agence est momentanement indisponible; FX Pro gardera chaque commande suivie et confirmee."}
                    compact
                  />
                  {orders.length ? (
                    orders.map((order) => (
                      <Pressable key={order.order_id} onPress={() => order.transaction?.txn_id && router.push({ pathname: "/receipt/[id]", params: { id: order.transaction.txn_id } })} style={styles.orderCard}>
                        <View style={styles.orderIcon}>
                          <Ionicons name="receipt-outline" size={20} color={Colors.cyan} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.orderTitle} numberOfLines={1}>{order.reference || order.order_id}</Text>
                          <Text style={styles.orderText} numberOfLines={2}>{order.items?.length || 0} article(s) - {pickupLabel(order.pickup_status)}</Text>
                          <Text style={styles.orderHash} numberOfLines={1}>{order.price_snapshot_hash || order.transaction?.price_snapshot_hash || "signature prix active"}</Text>
                          <View style={styles.orderSteps}>
                            <OrderStep active label="Payee" />
                            <OrderStep active={order.pickup_status !== "cancelled"} label="Preparee" />
                            <OrderStep active={order.pickup_status === "ready" || order.pickup_status === "picked_up"} label="Disponible" />
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.orderAmount}>{formatMoney(Number(order.total || 0), order.currency || currency)}</Text>
                          <Text style={styles.orderStatus}>{order.payment_status === "paid" ? "Payee" : "En attente"}</Text>
                          <Ionicons name="chevron-forward" size={17} color={Colors.textMuted} />
                        </View>
                      </Pressable>
                    ))
                  ) : (
                    <View style={styles.emptyOrders}>
                      <Ionicons name="bag-outline" size={24} color={Colors.textMuted} />
                      <Text style={styles.emptyOrdersText}>Aucune commande pour le moment.</Text>
                    </View>
                  )}
                </>
              ) : null}

              {activeSection === "promos" ? (
                <>
                  <SectionTitle title="Promotions" subtitle="Les deux premieres offres sont les gros coups du jour, les autres servent de bonus boutique." />
                  <View style={styles.promoGrid}>
                    {promoProducts.map((product, index) => (
                      <PromoCard key={product.id} product={product} index={index} onOpen={() => setSelected(product)} onAdd={() => addToCart(product.id)} />
                    ))}
                  </View>
                </>
              ) : null}

              {activeSection === "seller" ? (
                <>
                  <SectionTitle title="Espace vendeur" subtitle="Vendre demande un profil KYC certifie. Les articles publies restent modifiables et supprimables par leur vendeur." />
                  <InfoBanner
                    icon={user?.kyc_status === "verified" ? "shield-checkmark" : "lock-closed"}
                    title={user?.kyc_status === "verified" ? "Vendeur certifie actif" : "KYC obligatoire"}
                    text={
                      user?.kyc_status === "verified"
                        ? "Votre profil peut publier, modifier et supprimer ses propres articles."
                        : "Activez le KYC renforce avant de publier: les boutons vendeur restent verrouilles tant que le profil n'est pas certifie."
                    }
                    compact
                  />

                  <View style={styles.sellerPanel}>
                    <Text style={styles.sellerPanelTitle}>Profil boutique</Text>
                    <SellerInput label="Nom boutique" value={sellerProfileForm.store_name} onChangeText={(store_name: string) => setSellerProfileForm((v) => ({ ...v, store_name }))} />
                    <SellerInput label="Bio vendeur" value={sellerProfileForm.bio} onChangeText={(bio: string) => setSellerProfileForm((v) => ({ ...v, bio }))} multiline />
                    <View style={compact ? styles.sellerStack : styles.sellerInline}>
                      <SellerInput label="Ville" value={sellerProfileForm.city} onChangeText={(city: string) => setSellerProfileForm((v) => ({ ...v, city }))} style={{ flex: 1 }} />
                      <SellerInput label="Telephone" value={sellerProfileForm.support_phone} onChangeText={(support_phone: string) => setSellerProfileForm((v) => ({ ...v, support_phone }))} style={{ flex: 1 }} />
                    </View>
                    <SellerInput label="Zone livraison/retrait" value={sellerProfileForm.pickup_zone} onChangeText={(pickup_zone: string) => setSellerProfileForm((v) => ({ ...v, pickup_zone }))} />
                    <PrimaryButton title="Enregistrer profil vendeur" loading={sellerSaving} icon={<Ionicons name="save-outline" size={16} color="#000" />} onPress={saveSellerProfile} />
                    <View style={styles.sellerBenefits}>
                      {(seller?.benefits || ["Badge KYC", "Gestion articles", "Suivi commandes"]).map((benefit: string) => (
                        <InfoTiny key={benefit} icon="checkmark-circle" text={benefit} color={Colors.green} />
                      ))}
                    </View>
                  </View>

                  <View style={[styles.sellerPanel, user?.kyc_status !== "verified" && styles.sellerLockedPanel]}>
                    <View style={styles.sellerPanelHeader}>
                      <Text style={styles.sellerPanelTitle}>{editingArticle ? "Modifier l'article" : "Nouvel article"}</Text>
                      {editingArticle ? (
                        <Pressable onPress={() => { setEditingArticle(null); setSellerForm(EMPTY_SELLER_FORM); }} style={styles.cancelEdit}>
                          <Ionicons name="close" size={14} color={Colors.cyan} />
                          <Text style={styles.cancelEditText}>Annuler</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    {user?.kyc_status !== "verified" ? (
                      <PrimaryButton title="Activer le KYC pour vendre" icon={<Ionicons name="shield-checkmark" size={16} color="#000" />} onPress={() => router.push("/kyc")} />
                    ) : (
                      <>
                        <SellerInput label="Nom article" value={sellerForm.title} onChangeText={(title: string) => setSellerForm((v) => ({ ...v, title }))} />
                        <SellerInput label="Description" value={sellerForm.description} onChangeText={(description: string) => setSellerForm((v) => ({ ...v, description }))} multiline />
                        <SellerInput label="URL image produit" value={sellerForm.image} onChangeText={(image: string) => setSellerForm((v) => ({ ...v, image }))} />
                        <View style={compact ? styles.sellerStack : styles.sellerInline}>
                          <SellerInput label="Categorie" value={sellerForm.category} onChangeText={(category: string) => setSellerForm((v) => ({ ...v, category }))} style={{ flex: 1 }} />
                          <SellerInput label="Prix USD" value={sellerForm.price} onChangeText={(price: string) => setSellerForm((v) => ({ ...v, price }))} keyboardType="decimal-pad" style={{ flex: 1 }} />
                          <SellerInput label="Stock" value={sellerForm.stock} onChangeText={(stock: string) => setSellerForm((v) => ({ ...v, stock }))} keyboardType="number-pad" style={{ flex: 0.75 }} />
                        </View>
                        <SellerInput label="Tags separes par virgules" value={sellerForm.tags} onChangeText={(tags: string) => setSellerForm((v) => ({ ...v, tags }))} />
                        <PrimaryButton
                          title={editingArticle ? "Modifier l'article" : "Publier l'article"}
                          loading={sellerSaving}
                          icon={<Ionicons name={editingArticle ? "create-outline" : "cloud-upload-outline"} size={16} color="#000" />}
                          onPress={submitSellerArticle}
                        />
                      </>
                    )}
                  </View>

                  <SectionTitle title="Mes articles" subtitle={`${sellerArticles.length} annonce(s) vendeur sur ce profil.`} />
                  {sellerArticles.length ? (
                    <View style={styles.sellerList}>
                      {sellerArticles.map((article) => (
                        <View key={article.article_id} style={styles.sellerArticleCard}>
                          <Image source={{ uri: article.image }} style={styles.sellerArticleImage} resizeMode="cover" />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.sellerArticleTitle} numberOfLines={1}>{article.title}</Text>
                            <Text style={styles.sellerArticleDesc} numberOfLines={2}>{article.description}</Text>
                            <View style={styles.metaLine}>
                              <InfoTiny icon="shield-checkmark" text="KYC" color={Colors.green} />
                              <InfoTiny icon="cube-outline" text={`${article.stock || 0} stock`} color={Colors.cyan} />
                              <InfoTiny icon="cash-outline" text={`USD ${article.base_price || article.price || 0}`} color={Colors.yellow} />
                            </View>
                          </View>
                          <View style={styles.sellerActions}>
                            <Pressable onPress={() => editSellerArticle(article)} style={styles.sellerActionBtn}>
                              <Ionicons name="create-outline" size={17} color="#000" />
                            </Pressable>
                            <Pressable onPress={() => deleteSellerArticle(article)} style={[styles.sellerActionBtn, { backgroundColor: Colors.danger }]}>
                              <Ionicons name="trash-outline" size={17} color="#000" />
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyOrders}>
                      <Ionicons name="storefront-outline" size={24} color={Colors.textMuted} />
                      <Text style={styles.emptyOrdersText}>Aucun article vendeur pour le moment.</Text>
                    </View>
                  )}

                  <SectionTitle title="Commandes vendeur" subtitle={`${sellerOrders.length} commande(s) recues via vos articles.`} />
                  {sellerOrders.length ? (
                    <View style={styles.sellerList}>
                      {sellerOrders.map((order) => (
                        <View key={order.seller_order_id || order.order_id} style={styles.orderCard}>
                          <View style={styles.orderIcon}>
                            <Ionicons name="notifications-outline" size={20} color={Colors.cyan} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.orderTitle} numberOfLines={1}>{order.reference || order.order_id}</Text>
                            <Text style={styles.orderText} numberOfLines={2}>{order.item_count || order.items?.length || 0} article(s) - acheteur {order.buyer_name || order.buyer_email || "FX Pro"}</Text>
                            <View style={styles.orderSteps}>
                              <OrderStep active label="Notif envoyee" />
                              <OrderStep active label="A preparer" />
                            </View>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={styles.orderAmount}>{formatMoney(Number(order.items?.reduce((sum: number, item: any) => sum + Number(item.line_total || 0), 0) || 0), order.currency || currency)}</Text>
                            <Text style={styles.orderStatus}>Nouveau</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyOrders}>
                      <Ionicons name="mail-open-outline" size={24} color={Colors.textMuted} />
                      <Text style={styles.emptyOrdersText}>Les nouvelles commandes vendeur apparaitront ici avec notification.</Text>
                    </View>
                  )}
                </>
              ) : null}

              {activeSection === "help" ? (
                <View style={styles.helpBox}>
                  <InfoTiny icon="shield-checkmark" text="Prix recalcules cote serveur avant paiement" color={Colors.green} />
                  <InfoTiny icon="wallet" text="Solde verifie avant debit" color={Colors.cyan} />
                  <InfoTiny icon="receipt" text="Recu anime genere apres achat" color={Colors.yellow} />
                  <Text style={styles.helpText}>
                    Si le solde ne couvre pas l achat, la commande est bloquee et l utilisateur est invite a recharger par Depot argent. Le retrait en agence est momentanement indisponible; les commandes payees restent suivies, avec recu complet, reference et confirmation FX Pro.
                  </Text>
                </View>
              ) : null}
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
          setLineQty={setLineQty}
          currency={currency}
          walletCurrency={walletCurrency}
          setWalletCurrency={setWalletCurrency}
          walletBalance={walletBalance}
          debitAmount={debitAmount}
          balances={user?.balances || {}}
          rates={rates}
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

function pickupLabel(status?: string) {
  return (
    {
      agency_pending: "retrait agence en preparation",
      pickup_paused: "retrait momentanement indisponible",
      ready: "pret en agence",
      picked_up: "recupere",
      cancelled: "annule",
    } as Record<string, string>
  )[status || ""] || "suivi agence";
}

function InfoBanner({ icon, title, text, compact }: { icon: any; title: string; text: string; compact?: boolean }) {
  return (
    <View style={[styles.infoBanner, compact && styles.infoBannerCompact]}>
      <View style={styles.infoBannerIcon}>
        <Ionicons name={icon} size={18} color="#000" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.infoBannerTitle}>{title}</Text>
        <Text style={styles.infoBannerText}>{text}</Text>
      </View>
    </View>
  );
}

function OrderStep({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={[styles.orderStep, active && styles.orderStepActive]}>
      <Text style={[styles.orderStepText, active && styles.orderStepTextActive]}>{label}</Text>
    </View>
  );
}

function ShopStat({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={16} color={Colors.cyan} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function PromoCard({ product, index, onOpen, onAdd }: any) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80)} style={styles.promoCard}>
      <Pressable onPress={onOpen}>
        <Image source={{ uri: product.image }} style={styles.promoImage} resizeMode="contain" />
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

function MiniAdCard({ product, onOpen, onAdd }: any) {
  return (
    <Pressable onPress={onOpen} style={styles.adCard}>
      <Image source={{ uri: product.image }} style={styles.adImage} resizeMode="contain" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.adBadge}>{product.promotion?.label || "Bon plan"}</Text>
        <Text style={styles.adTitle} numberOfLines={2}>{product.title}</Text>
        <Text style={styles.adPrice}>{formatMoney(product.price, product.currency)}</Text>
      </View>
      <Pressable onPress={onAdd} style={styles.adAdd}>
        <Ionicons name="add" size={16} color="#000" />
      </Pressable>
    </Pressable>
  );
}

function ProductCard({ product, index, width, onOpen, onAdd }: any) {
  const out = product.stock <= 0 || product.availability === "Out of Stock";
  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 12) * 35)} style={[styles.productCard, { width }]}>
      <Pressable onPress={onOpen}>
        <Image source={{ uri: product.image }} style={styles.productImage} resizeMode="contain" />
        {product.promotion ? <Text style={styles.discountFlag}>-{product.promotion.discount_percent}%</Text> : null}
        <View style={styles.productBody}>
          <Text style={styles.productBrand}>{product.brand}</Text>
          <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
          <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text>
          <View style={styles.metaLine}>
            <InfoTiny icon="star" text={String(product.rating)} color={Colors.yellow} />
            <InfoTiny icon="cube" text={out ? "rupture" : `${product.stock} dispo`} color={out ? Colors.textMuted : Colors.green} />
            {product.source === "seller" ? <InfoTiny icon="shield-checkmark" text="Vendeur KYC" color={Colors.green} /> : null}
            {product.sku ? <InfoTiny icon="barcode-outline" text={product.sku} color={Colors.cyan} /> : null}
          </View>
          <View style={styles.cardFooter}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {product.promotion ? <Text style={styles.cardOldPrice}>{formatMoney(product.original_price, product.currency)}</Text> : null}
              <Text style={styles.cardPrice}>{formatMoney(product.price, product.currency)}</Text>
            </View>
            <Pressable testID={`shop-add-${product.id}`} disabled={out} onPress={onAdd} style={[styles.addButton, out && styles.addButtonDisabled]}>
              <Ionicons name={out ? "ban" : "add"} size={18} color="#000" />
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

function SellerInput({ label, value, onChangeText, multiline, keyboardType, style }: any) {
  return (
    <View style={[styles.sellerInputWrap, style]}>
      <Text style={styles.sellerInputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        placeholderTextColor={Colors.textMuted}
        style={[styles.sellerInput, multiline && styles.sellerInputMulti]}
      />
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
          <Image source={{ uri: product.image }} style={styles.modalImage} resizeMode="contain" />
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
            {product.source === "seller" ? (
              <View style={styles.metaLine}>
                <InfoTiny icon="shield-checkmark" text="Vendeur certifie KYC" color={Colors.green} />
                <InfoTiny icon="storefront-outline" text={product.seller_store_name || product.brand} color={Colors.cyan} />
              </View>
            ) : null}
            <View style={styles.productSpecs}>
              {product.sku ? <SpecLine label="Ref" value={product.sku} /> : null}
              {product.shipping ? <SpecLine label="Livraison" value={product.shipping} /> : null}
              {product.warranty ? <SpecLine label="Garantie" value={product.warranty} /> : null}
              {product.return_policy ? <SpecLine label="Retour" value={product.return_policy} /> : null}
              <SpecLine label="Stock" value={`${product.stock} disponible(s)`} />
            </View>
            <View style={styles.modalPriceBlock}>
              {product.promotion ? <Text style={styles.cardOldPrice}>{formatMoney(product.original_price, product.currency)}</Text> : null}
              <Text style={styles.modalPrice}>{formatMoney(product.price, product.currency)}</Text>
            </View>
            <Text style={styles.agencyText}>
              Retrait agence momentanement indisponible. La commande reste suivie et le recu servira a la livraison ou a la reprise du retrait.
            </Text>
            <PrimaryButton title="Ajouter au panier" icon={<Ionicons name="bag-add" size={16} color="#000" />} onPress={() => { onAdd(product.id); onClose(); }} />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

function SpecLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specLine}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function CartModal({
  visible,
  onClose,
  setLineQty,
  currency,
  walletCurrency,
  setWalletCurrency,
  walletBalance,
  debitAmount,
  balances,
  rates,
  totals,
  checkingOut,
  canPay,
  onCheckout,
}: any) {
  const items = totals?.items || [];
  const activeWallets = CURRENCIES.map((item) => {
    const debit = totals ? convertShopMoney(totals.total, currency, item.code, rates || {}) : 0;
    const balance = Number((balances || {})[item.code] || 0);
    return { ...item, debit, balance, ok: totals ? balance >= debit : false };
  }).sort((a, b) => Number(b.code === walletCurrency) - Number(a.code === walletCurrency) || Number(b.ok) - Number(a.ok) || b.balance - a.balance);
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
                  <Image source={{ uri: item.image }} style={styles.cartImage} resizeMode="contain" />
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
                <Pressable key={item.code} onPress={() => setWalletCurrency(item.code)} style={[styles.walletChip, active && styles.walletChipActive, item.ok && styles.walletChipReady]}>
                  <Text style={[styles.walletChipText, active && styles.walletChipTextActive]}>{item.code}</Text>
                  <Text style={[styles.walletChipSub, active && styles.walletChipTextActive]}>{formatMoney(item.balance, item.code)}</Text>
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
              Paiement atomique: prix recalcules cote API, solde verifie, recu genere immediatement. Retrait agence en pause, suivi FX Pro active.
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
  topTitle: { color: "#fff", fontSize: 18, fontWeight: "900", flex: 1, textAlign: "center", paddingHorizontal: 12 },
  cartButton: { width: 42, height: 42, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.06)" },
  cartBadge: { position: "absolute", top: -6, right: -5, minWidth: 20, height: 20, borderRadius: 10, textAlign: "center", overflow: "hidden", backgroundColor: Colors.magenta, color: "#fff", fontSize: 11, fontWeight: "900", lineHeight: 20 },
  content: { paddingBottom: 150 },
  hero: { marginHorizontal: 16, marginTop: 8, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: "rgba(255,255,255,0.075)", flexDirection: "row", alignItems: "center", gap: 14 },
  heroCompact: { flexDirection: "column", alignItems: "flex-start" },
  heroKicker: { color: Colors.cyan, fontSize: 11, fontWeight: "900", letterSpacing: 1.6, textTransform: "uppercase" },
  heroTitle: { color: "#fff", fontSize: 27, fontWeight: "900", marginTop: 4, lineHeight: 31 },
  heroText: { color: Colors.textSoft, fontSize: 13, lineHeight: 19, marginTop: 8 },
  heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cyan },
  statGrid: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  statCard: { flex: 1, minHeight: 72, borderRadius: 18, padding: 11, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.052)" },
  statLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", marginTop: 6 },
  statValue: { color: "#fff", fontSize: 13, fontWeight: "900", marginTop: 3 },
  infoBanner: { marginHorizontal: 16, marginTop: 10, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,215,0,0.45)", backgroundColor: "rgba(255,215,0,0.09)", padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  infoBannerCompact: { marginTop: 2, marginBottom: 8 },
  infoBannerIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.yellow },
  infoBannerTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  infoBannerText: { color: Colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 3 },
  sectionTabs: { marginHorizontal: 16, marginTop: 12, flexDirection: "row", gap: 7, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 5, backgroundColor: "rgba(255,255,255,0.055)" },
  sectionTabsWrap: { flexWrap: "wrap" },
  sectionTab: { flex: 1, minHeight: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  sectionTabCompact: { minWidth: "31%" },
  sectionTabActive: { backgroundColor: Colors.cyan },
  sectionTabText: { color: Colors.textSoft, fontSize: 11, fontWeight: "900" },
  sectionTabTextActive: { color: "#000" },
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
  suggestionsBox: { marginHorizontal: 16, marginTop: 8, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(5,5,10,0.88)", overflow: "hidden" },
  suggestionItem: { minHeight: 46, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  suggestionTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  suggestionSub: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  quickChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)" },
  quickChipActive: { backgroundColor: Colors.yellow, borderColor: Colors.yellow },
  quickChipText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  loadingBox: { margin: 16, padding: 26, alignItems: "center", borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)" },
  loadingText: { color: Colors.textSoft, marginTop: 10, fontWeight: "700" },
  promoGrid: { paddingHorizontal: 16, gap: 12 },
  promoCard: { borderRadius: 24, overflow: "hidden", minHeight: 210, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: Colors.bgCard },
  promoImage: { width: "100%", height: 210, backgroundColor: "#fff" },
  promoOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", padding: 16, backgroundColor: "rgba(0,0,0,0.28)" },
  promoBadge: { alignSelf: "flex-start", color: "#000", backgroundColor: Colors.yellow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: "900", overflow: "hidden" },
  promoTitle: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 10, textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 10 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 8, flexWrap: "wrap" },
  oldPrice: { color: Colors.textSoft, textDecorationLine: "line-through", fontWeight: "800" },
  newPrice: { color: Colors.cyan, fontSize: 20, fontWeight: "900" },
  promoAdd: { position: "absolute", right: 12, top: 12, borderRadius: 999, backgroundColor: Colors.cyan, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  promoAddText: { color: "#000", fontWeight: "900", fontSize: 12 },
  adRow: { paddingHorizontal: 16, paddingVertical: 4, gap: 10 },
  adCard: { width: 270, minHeight: 112, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.058)", padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  adImage: { width: 76, height: 76, borderRadius: 14, backgroundColor: "#fff" },
  adBadge: { alignSelf: "flex-start", color: "#000", backgroundColor: Colors.yellow, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 9, fontWeight: "900", overflow: "hidden" },
  adTitle: { color: "#fff", fontSize: 12, fontWeight: "900", lineHeight: 16, marginTop: 5 },
  adPrice: { color: Colors.cyan, fontSize: 13, fontWeight: "900", marginTop: 4 },
  adAdd: { width: 34, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cyan },
  categoryChip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.04)" },
  categoryChipActive: { backgroundColor: Colors.magenta, borderColor: Colors.magenta },
  categoryChipText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  categoryChipTextActive: { color: "#fff", fontWeight: "900" },
  productGrid: { paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "stretch" },
  productCard: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.06)" },
  productImage: { width: "100%", height: 168, backgroundColor: "#fff" },
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
  addButtonDisabled: { opacity: 0.45, backgroundColor: Colors.textMuted },
  moreButton: { alignSelf: "center", marginTop: 14, borderRadius: 999, minHeight: 44, paddingHorizontal: 17, backgroundColor: Colors.cyan, flexDirection: "row", alignItems: "center", gap: 6 },
  moreButtonText: { color: "#000", fontSize: 13, fontWeight: "900" },
  orderCard: { marginHorizontal: 16, marginVertical: 5, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", flexDirection: "row", alignItems: "center", gap: 11 },
  orderIcon: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.cyan, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,255,255,0.08)" },
  orderTitle: { color: "#fff", fontWeight: "900", fontSize: 13 },
  orderText: { color: Colors.textSoft, fontSize: 11, marginTop: 3 },
  orderHash: { color: Colors.textMuted, fontSize: 9, marginTop: 3, fontWeight: "800" },
  orderSteps: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 8 },
  orderStep: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(255,255,255,0.04)" },
  orderStepActive: { borderColor: Colors.green, backgroundColor: "rgba(57,255,20,0.10)" },
  orderStepText: { color: Colors.textMuted, fontSize: 9, fontWeight: "900" },
  orderStepTextActive: { color: Colors.green },
  orderAmount: { color: Colors.cyan, fontWeight: "900", fontSize: 12, maxWidth: 120 },
  orderStatus: { color: Colors.green, fontSize: 10, fontWeight: "900", marginTop: 3 },
  emptyOrders: { marginHorizontal: 16, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center" },
  emptyOrdersText: { color: Colors.textSoft, textAlign: "center", fontSize: 12, marginTop: 8 },
  floatingCart: { position: "absolute", left: 16, right: 16, bottom: 22, minHeight: 54, borderRadius: 999, backgroundColor: Colors.cyan, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, shadowColor: Colors.cyan, shadowOpacity: 0.45, shadowRadius: 14 },
  floatingCartText: { color: "#000", fontWeight: "900" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.74)", justifyContent: "flex-end" },
  productModal: { margin: 16, maxHeight: "88%", borderRadius: 26, overflow: "hidden", backgroundColor: "#101018", borderWidth: 1, borderColor: Colors.borderStrong },
  modalImage: { width: "100%", height: 260, backgroundColor: "#fff" },
  modalClose: { position: "absolute", top: 12, right: 12, width: 38, height: 38, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  modalTitle: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 6, lineHeight: 29 },
  modalDesc: { color: Colors.textSoft, fontSize: 14, lineHeight: 20, marginTop: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  tag: { color: "#fff", fontSize: 11, fontWeight: "800", borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.045)" },
  productSpecs: { marginTop: 13, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  specLine: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingHorizontal: 11, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  specLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", width: 78 },
  specValue: { color: "#fff", flex: 1, minWidth: 0, textAlign: "right", fontSize: 11, fontWeight: "800" },
  modalPriceBlock: { marginTop: 14 },
  modalPrice: { color: Colors.cyan, fontSize: 28, fontWeight: "900" },
  agencyText: { color: Colors.textSoft, fontSize: 12, lineHeight: 18, marginTop: 10 },
  cartSheet: { backgroundColor: "#0a0a14", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 24, borderWidth: 1, borderColor: Colors.borderStrong, maxHeight: "90%" },
  handle: { alignSelf: "center", width: 42, height: 4, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.28)", marginBottom: 12 },
  cartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cartTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  cartLine: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  cartImage: { width: 58, height: 58, borderRadius: 16, backgroundColor: "#fff" },
  cartItemTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  cartItemPrice: { color: Colors.textSoft, fontSize: 11, marginTop: 4 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, padding: 4 },
  qtyBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  qtyText: { color: "#fff", fontWeight: "900", minWidth: 18, textAlign: "center" },
  walletLabel: { color: Colors.textSoft, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.4, marginTop: 14 },
  walletRow: { gap: 8, paddingVertical: 9 },
  walletChip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 12, paddingVertical: 8 },
  walletChipActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  walletChipReady: { borderColor: Colors.green },
  walletChipText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  walletChipSub: { color: Colors.textMuted, fontWeight: "800", fontSize: 9, marginTop: 2 },
  walletChipTextActive: { color: "#000" },
  totalBox: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", padding: 13, flexDirection: "row", justifyContent: "space-between", gap: 14 },
  totalLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  totalValue: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 4 },
  balanceHint: { color: Colors.textSoft, fontSize: 11, marginTop: 4 },
  payWarning: { color: Colors.yellow, fontSize: 12, lineHeight: 18, marginTop: 10, fontWeight: "800" },
  sellerPanel: { marginHorizontal: 16, marginTop: 10, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", padding: 14 },
  sellerLockedPanel: { borderColor: "rgba(255,215,0,0.32)", backgroundColor: "rgba(255,215,0,0.055)" },
  sellerPanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sellerPanelTitle: { color: "#fff", fontSize: 16, fontWeight: "900", marginBottom: 10 },
  sellerInline: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-start" },
  sellerStack: { gap: 8 },
  sellerInputWrap: { marginBottom: 10, minWidth: 0 },
  sellerInputLabel: { color: Colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 5 },
  sellerInput: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(0,0,0,0.22)", color: "#fff", paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 11 : 8, fontSize: 13, fontWeight: "700" },
  sellerInputMulti: { minHeight: 82, textAlignVertical: "top" },
  sellerBenefits: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 },
  cancelEdit: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.cyan },
  cancelEditText: { color: Colors.cyan, fontWeight: "900", fontSize: 11 },
  sellerList: { paddingHorizontal: 16, gap: 10 },
  sellerArticleCard: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: "rgba(255,255,255,0.055)", padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  sellerArticleImage: { width: 74, height: 74, borderRadius: 14, backgroundColor: "#fff" },
  sellerArticleTitle: { color: "#fff", fontWeight: "900", fontSize: 13 },
  sellerArticleDesc: { color: Colors.textSoft, fontSize: 11, lineHeight: 16, marginTop: 3 },
  sellerActions: { gap: 8 },
  sellerActionBtn: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cyan },
  helpBox: { marginHorizontal: 16, marginTop: 12, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 14, backgroundColor: "rgba(255,255,255,0.055)", gap: 9 },
  helpText: { color: Colors.textSoft, fontSize: 12, lineHeight: 19, marginTop: 4 },
});
