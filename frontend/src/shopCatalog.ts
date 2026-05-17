export type ShopProduct = {
  id: string;
  title: string;
  brand: string;
  description: string;
  category: string;
  image: string;
  base_currency: "USD";
  base_price: number;
  rating: number;
  stock: number;
  tags: string[];
  source: "apilayer" | "fallback";
};

export type ShopPromotion = {
  product_id: string;
  discount_percent: 50 | 80;
  label: string;
  ends_at: string;
};

export type ShopCatalogPayload = {
  products: (ShopProduct & {
    price: number;
    original_price: number;
    currency: string;
    promotion?: ShopPromotion;
  })[];
  promotions: ShopPromotion[];
  currency: string;
  source: "apilayer" | "fallback" | "mixed";
  updated_at: string;
  agency_message: string;
};

export type ShopCartLine = {
  product_id: string;
  quantity: number;
};

export const SHOP_AGENCY_MESSAGE =
  "FX Pro dispose d'agences et de points partenaires dans plusieurs pays. Apres paiement, le recu de commande sert a recuperer le produit ou a organiser le retrait avec une agence.";

const SUPPORTED = ["EUR", "XOF", "XAF", "USD", "GBP", "NGN", "MAD", "CAD", "CHF", "JPY", "CNY", "AUD", "INR", "BRL", "ZAR", "KES", "GHS", "SEK", "AED"];
const ZERO_DECIMALS = ["XOF", "XAF", "JPY", "NGN", "KES"];

export const FALLBACK_SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: "fxp_earbuds_pro",
    title: "Ecouteurs Bluetooth Pro",
    brand: "FX Select",
    description: "Audio clair, boitier compact, autonomie longue duree et retrait disponible en agence partenaire.",
    category: "Tech",
    image: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 79,
    rating: 4.8,
    stock: 18,
    tags: ["Audio", "Mobile", "Premium"],
    source: "fallback",
  },
  {
    id: "fxp_watch_core",
    title: "Montre connectee Core",
    brand: "FX Select",
    description: "Suivi activite, notifications, autonomie solide et design discret pour usage quotidien.",
    category: "Tech",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 129,
    rating: 4.7,
    stock: 12,
    tags: ["Wearable", "Sport", "Mobile"],
    source: "fallback",
  },
  {
    id: "fxp_power_bank",
    title: "Batterie externe 20 000 mAh",
    brand: "Voltline",
    description: "Charge rapide multi-port, format voyage et securite thermique integree.",
    category: "Accessoires",
    image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 49,
    rating: 4.6,
    stock: 25,
    tags: ["Voyage", "Charge", "Mobile"],
    source: "fallback",
  },
  {
    id: "fxp_travel_bag",
    title: "Sac voyage business",
    brand: "Nomad Pro",
    description: "Compartiments securises, poche laptop et finition sobre pour deplacements rapides.",
    category: "Voyage",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 92,
    rating: 4.8,
    stock: 10,
    tags: ["Business", "Travel", "Secure"],
    source: "fallback",
  },
  {
    id: "fxp_coffee_box",
    title: "Coffret cafe premium",
    brand: "Maison Noir",
    description: "Selection aromatique, grains fraichement torrifies et presentation cadeau.",
    category: "Epicerie",
    image: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 36,
    rating: 4.7,
    stock: 30,
    tags: ["Cafe", "Gourmet", "Cadeau"],
    source: "fallback",
  },
  {
    id: "fxp_green_tea",
    title: "Selection the vert bio",
    brand: "Pure Leaf",
    description: "Infusion douce, notes vegetales et pack ideal pour routines bien-etre.",
    category: "Epicerie",
    image: "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 24,
    rating: 4.5,
    stock: 44,
    tags: ["Bio", "Bien-etre", "The"],
    source: "fallback",
  },
  {
    id: "fxp_gift_card",
    title: "Carte cadeau digitale",
    brand: "FX Pro",
    description: "Bon d'achat interne utilisable sur selection agence, avec recu numerique instantane.",
    category: "Digital",
    image: "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 55,
    rating: 4.9,
    stock: 99,
    tags: ["Digital", "Cadeau", "Instantane"],
    source: "fallback",
  },
  {
    id: "fxp_office_pack",
    title: "Pack bureau mobile",
    brand: "Workline",
    description: "Support telephone, cable renforce, carnet premium et rangement compact.",
    category: "Accessoires",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 64,
    rating: 4.6,
    stock: 16,
    tags: ["Bureau", "Mobile", "Organisation"],
    source: "fallback",
  },
  {
    id: "fxp_chocolate_box",
    title: "Coffret chocolat artisan",
    brand: "Cocoa House",
    description: "Assortiment premium, emballage soigne et retrait rapide dans les agences participantes.",
    category: "Epicerie",
    image: "https://images.unsplash.com/photo-1548907040-4baa42d10919?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 42,
    rating: 4.8,
    stock: 22,
    tags: ["Gourmet", "Cadeau", "Premium"],
    source: "fallback",
  },
  {
    id: "fxp_smart_tracker",
    title: "Tracker intelligent",
    brand: "Locate+",
    description: "Localisation d'objets, alerte sonore et format discret pour sac, cle ou bagage.",
    category: "Tech",
    image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 39,
    rating: 4.4,
    stock: 28,
    tags: ["Securite", "Voyage", "Mobile"],
    source: "fallback",
  },
  {
    id: "fxp_skin_care",
    title: "Routine soin essentielle",
    brand: "Luma",
    description: "Kit compact, texture legere et format adapte aux deplacements.",
    category: "Bien-etre",
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 58,
    rating: 4.5,
    stock: 20,
    tags: ["Soin", "Voyage", "Premium"],
    source: "fallback",
  },
  {
    id: "fxp_home_speaker",
    title: "Mini enceinte maison",
    brand: "SoundNest",
    description: "Son ample, Bluetooth stable et finition textile moderne.",
    category: "Tech",
    image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=900&q=80",
    base_currency: "USD",
    base_price: 88,
    rating: 4.7,
    stock: 14,
    tags: ["Audio", "Maison", "Bluetooth"],
    source: "fallback",
  },
];

export function normalizeShopCurrency(currency?: string) {
  const code = String(currency || "XOF").toUpperCase();
  return SUPPORTED.includes(code) ? code : "XOF";
}

export function roundShopMoney(value: number, currency: string) {
  const digits = ZERO_DECIMALS.includes(currency) ? 0 : 2;
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function convertShopMoney(amount: number, from: string, to: string, rates: Record<string, number>) {
  const source = normalizeShopCurrency(from);
  const target = normalizeShopCurrency(to);
  if (source === target) return roundShopMoney(amount, target);
  const sourceRate = rates[source] || (source === "EUR" ? 1 : 0);
  const targetRate = rates[target] || (target === "EUR" ? 1 : 0);
  if (!sourceRate || !targetRate) return roundShopMoney(amount, target);
  const amountEur = Number(amount) / sourceRate;
  return roundShopMoney(amountEur * targetRate, target);
}

export function shopTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function stableNumber(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function stripHtml(value?: string) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function derivedPriceUsd(id: string, title: string, index: number) {
  const n = stableNumber(`${id}:${title}:${index}`);
  return roundShopMoney(18 + n * 132, "USD");
}

function productImageFromRaw(raw: any) {
  const image = String(raw?.image || raw?.imageUrl || raw?.image_url || "");
  if (image.startsWith("http")) return image;
  const id = raw?.id || raw?.productId;
  const imageType = raw?.imageType || "jpg";
  if (id) return `https://img.spoonacular.com/products/${id}-312x231.${imageType}`;
  return FALLBACK_SHOP_PRODUCTS[0].image;
}

export function normalizeRemoteProducts(rawProducts: any[] = []): ShopProduct[] {
  return rawProducts
    .map((raw, index) => {
      const id = String(raw?.id || raw?.productId || raw?.upc || `remote_${index}`);
      const title = String(raw?.title || raw?.name || raw?.productName || "Produit catalogue").trim();
      if (!title || title === "Produit catalogue") return null;
      const brand = String(raw?.brand || raw?.brandName || raw?.manufacturer || "Catalogue APILayer").trim();
      const description =
        stripHtml(raw?.description || raw?.generatedText || raw?.breadcrumbs?.join?.(" / ")) ||
        "Produit catalogue avec retrait possible via le reseau d'agences FX Pro.";
      const category = String(raw?.aisle || raw?.category || raw?.breadcrumbs?.[0] || "Catalogue").trim();
      const basePrice = Number(raw?.price || raw?.estimatedCost?.value || 0) || derivedPriceUsd(id, title, index);
      return {
        id: `api_${id}`,
        title,
        brand,
        description,
        category,
        image: productImageFromRaw(raw),
        base_currency: "USD" as const,
        base_price: roundShopMoney(basePrice > 600 ? basePrice / 100 : basePrice, "USD"),
        rating: roundShopMoney(4.25 + stableNumber(id) * 0.7, "USD"),
        stock: 8 + Math.floor(stableNumber(`${id}:stock`) * 34),
        tags: [category, brand].filter(Boolean).slice(0, 3),
        source: "apilayer" as const,
      };
    })
    .filter(Boolean)
    .slice(0, 18) as ShopProduct[];
}

export async function fetchApilayerShopProducts(apiKey?: string, query = "premium snack") {
  const key = String(apiKey || "").trim();
  if (!key) return [];
  const encoded = encodeURIComponent(query || "premium snack");
  const attempts: { url: string; headers: Record<string, string> }[] = [
    {
      url: `https://api.apilayer.com/spoonacular/food/products/search?query=${encoded}&number=18`,
      headers: { apikey: key },
    },
    {
      url: `https://api.spoonacular.com/food/products/search?query=${encoded}&number=18&apiKey=${encodeURIComponent(key)}`,
      headers: {},
    },
  ];

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(attempt.url, { headers: attempt.headers, signal: controller.signal });
      if (!res.ok) continue;
      const body = await res.json();
      const products = Array.isArray(body?.products) ? body.products : Array.isArray(body?.results) ? body.results : [];
      const normalized = normalizeRemoteProducts(products);
      if (normalized.length) return normalized;
    } catch {
      // Keep the shop usable if the test key has no subscription, quota, or browser CORS blocks it.
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

export function buildShopPromotions(products: ShopProduct[], todayKey = shopTodayKey()): ShopPromotion[] {
  const pool = [...products].sort((a, b) => stableNumber(`${todayKey}:${a.id}`) - stableNumber(`${todayKey}:${b.id}`));
  const end = new Date(`${todayKey}T23:59:59.000Z`).toISOString();
  return pool.slice(0, 2).map((product, index) => ({
    product_id: product.id,
    discount_percent: index === 0 ? 80 : 50,
    label: index === 0 ? "Flash -80%" : "Selection -50%",
    ends_at: end,
  }));
}

export function buildShopCatalogPayload({
  remoteProducts = [],
  currency = "XOF",
  rates = {},
}: {
  remoteProducts?: ShopProduct[];
  currency?: string;
  rates?: Record<string, number>;
}): ShopCatalogPayload {
  const code = normalizeShopCurrency(currency);
  const merged = [...remoteProducts, ...FALLBACK_SHOP_PRODUCTS].filter((product, index, all) => {
    return all.findIndex((other) => other.id === product.id) === index;
  });
  const products = merged.length ? merged : FALLBACK_SHOP_PRODUCTS;
  const promotions = buildShopPromotions(products);
  const promoMap = new Map(promotions.map((promo) => [promo.product_id, promo]));
  const priced = products.map((product) => {
    const original = convertShopMoney(product.base_price, product.base_currency, code, rates);
    const promotion = promoMap.get(product.id);
    const price = promotion ? roundShopMoney(original * (1 - promotion.discount_percent / 100), code) : original;
    return { ...product, original_price: original, price, currency: code, promotion };
  });
  const source = remoteProducts.length && remoteProducts.length >= products.length ? "apilayer" : remoteProducts.length ? "mixed" : "fallback";
  return {
    products: priced,
    promotions,
    currency: code,
    source,
    updated_at: new Date().toISOString(),
    agency_message: SHOP_AGENCY_MESSAGE,
  };
}

export function calculateShopCart({
  products,
  lines,
  orderCurrency,
  walletCurrency,
  rates,
}: {
  products: ShopCatalogPayload["products"];
  lines: ShopCartLine[];
  orderCurrency: string;
  walletCurrency: string;
  rates: Record<string, number>;
}) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const cleanLines = lines
    .map((line) => ({
      product_id: String(line.product_id || ""),
      quantity: Math.max(1, Math.min(8, Math.floor(Number(line.quantity || 1)))),
    }))
    .filter((line) => productMap.has(line.product_id));

  if (!cleanLines.length) throw new Error("Panier vide ou produits indisponibles.");
  if (cleanLines.length > 20) throw new Error("Panier trop volumineux. Validez plusieurs commandes.");

  const items = cleanLines.map((line) => {
    const product = productMap.get(line.product_id)!;
    if (line.quantity > product.stock) throw new Error(`${product.title}: stock insuffisant.`);
    const lineTotal = roundShopMoney(product.price * line.quantity, orderCurrency);
    return {
      product_id: product.id,
      title: product.title,
      brand: product.brand,
      image: product.image,
      category: product.category,
      quantity: line.quantity,
      unit_price: product.price,
      original_unit_price: product.original_price,
      discount_percent: product.promotion?.discount_percent || 0,
      line_total: lineTotal,
    };
  });

  const total = roundShopMoney(items.reduce((sum, item) => sum + item.line_total, 0), orderCurrency);
  const debitAmount = convertShopMoney(total, orderCurrency, walletCurrency, rates);
  return {
    items,
    total,
    currency: normalizeShopCurrency(orderCurrency),
    wallet_currency: normalizeShopCurrency(walletCurrency),
    debit_amount: debitAmount,
  };
}
