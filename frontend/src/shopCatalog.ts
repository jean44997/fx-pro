import { FREE_ECOMMERCE_SEED_PRODUCTS } from "./shopSeedProducts";

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
  source: "apilayer" | "dummyjson" | "freeapi" | "fakestore" | "escuelajs" | "generated" | "fallback" | "firebase" | "seller";
  sku?: string;
  ref?: string;
  barcode?: string;
  qr_code?: string;
  warranty?: string;
  shipping?: string;
  availability?: string;
  return_policy?: string;
  minimum_order_quantity?: number;
  images?: string[];
  review_count?: number;
  admin_managed?: boolean;
  hidden?: boolean;
  seller_id?: string;
  seller_verified?: boolean;
  seller_store_name?: string;
};

export type ShopPromotion = {
  product_id: string;
  discount_percent: number;
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
  pickup_available: boolean;
  pickup_message: string;
};

export type ShopProductOverride = {
  product_id?: string;
  id?: string;
  sku?: string;
  title?: string;
  brand?: string;
  description?: string;
  category?: string;
  image?: string;
  base_price?: number;
  price_override_usd?: number;
  discount_override?: number;
  promo_active?: boolean;
  promo_discount?: number;
  stock_override?: number;
  stock?: number;
  hidden?: boolean;
  visible?: boolean;
  tags?: string[];
  updated_at?: string;
};

export type ShopCartLine = {
  product_id: string;
  quantity: number;
};

export const SHOP_PICKUP_AVAILABLE = false;
export const SHOP_PICKUP_MESSAGE =
  "Le retrait en agence est momentanement indisponible pendant la mise a jour logistique. Les commandes restent securisees: un conseiller FX Pro confirmera la livraison ou la reprise du retrait directement avec l'utilisateur.";
export const SHOP_AGENCY_MESSAGE = SHOP_PICKUP_MESSAGE;

const SUPPORTED = ["EUR", "XOF", "XAF", "USD", "GBP", "NGN", "MAD", "CAD", "CHF", "JPY", "CNY", "AUD", "INR", "BRL", "ZAR", "KES", "GHS", "SEK", "AED"];
const ZERO_DECIMALS = ["XOF", "XAF", "JPY", "NGN", "KES"];
const MAX_SHOP_PRODUCTS = 1400;

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

function slugKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanTags(values: any[] = []) {
  return Array.from(
    new Set(
      values
        .flat()
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 8)
    )
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const MARKET_PRICE_ANCHORS: { pattern: RegExp; price: number }[] = [
  { pattern: /iphone\s*5s/i, price: 35 },
  { pattern: /iphone\s*6\b/i, price: 55 },
  { pattern: /iphone\s*x\b/i, price: 130 },
  { pattern: /iphone\s*13\s*pro/i, price: 330 },
  { pattern: /samsung\s+galaxy\s+s7/i, price: 60 },
  { pattern: /samsung\s+galaxy\s+s8/i, price: 90 },
  { pattern: /samsung\s+galaxy\s+s10/i, price: 150 },
  { pattern: /oppo\s+a57/i, price: 75 },
  { pattern: /oppo\s+f19/i, price: 145 },
  { pattern: /oppo\s+k1/i, price: 85 },
  { pattern: /realme\s+c35/i, price: 85 },
  { pattern: /realme\s+x\b/i, price: 110 },
  { pattern: /realme\s+xt/i, price: 130 },
  { pattern: /vivo\s+s1/i, price: 95 },
  { pattern: /vivo\s+v9/i, price: 90 },
  { pattern: /vivo\s+x21/i, price: 125 },
  { pattern: /gaming laptop|laptop.*16gb|16gb.*laptop/i, price: 620 },
  { pattern: /macbook\s+air\s+m4|macbook\s+air\s+13/i, price: 999 },
  { pattern: /macbook\s+air\s+15/i, price: 1199 },
  { pattern: /macbook\s+pro\s+m4\s+pro|macbook\s+pro\s+14/i, price: 1999 },
  { pattern: /macbook\s+pro\s+16|m4\s+max/i, price: 2499 },
  { pattern: /imac\s+24|mac\s+mini|mac\s+studio/i, price: 699 },
  { pattern: /dell\s+xps|hp\s+spectre|thinkpad\s+x1|surface\s+laptop|galaxy\s+book/i, price: 1180 },
  { pattern: /lenovo\s+legion|asus\s+rog|msi\s+stealth|predator\s+helios|gaming pc/i, price: 1450 },
  { pattern: /\blaptop\b/i, price: 320 },
  { pattern: /55-inch|55 inch|4k ultra hd tv/i, price: 290 },
  { pattern: /curved gaming monitor|super ultrawide/i, price: 480 },
  { pattern: /monitor/i, price: 120 },
  { pattern: /1tb.*ssd|ssd.*1tb/i, price: 55 },
  { pattern: /256gb.*ssd|ssd.*256gb/i, price: 24 },
  { pattern: /2tb.*hard|hard drive.*2tb/i, price: 45 },
  { pattern: /4tb.*gaming drive|gaming drive.*4tb/i, price: 80 },
  { pattern: /wireless bluetooth headphones|over-ear headphones|headphone/i, price: 35 },
  { pattern: /bluetooth speaker/i, price: 25 },
  { pattern: /dslr camera/i, price: 220 },
  { pattern: /action camera/i, price: 75 },
  { pattern: /smartwatch|fitness tracker/i, price: 55 },
  { pattern: /tablet/i, price: 95 },
  { pattern: /usb drive.*64gb|64gb.*usb/i, price: 8 },
  { pattern: /treadmill/i, price: 360 },
  { pattern: /dumbbell/i, price: 70 },
  { pattern: /blood pressure monitor/i, price: 28 },
  { pattern: /thermometer/i, price: 18 },
  { pattern: /kawasaki/i, price: 4200 },
  { pattern: /motogp/i, price: 6200 },
  { pattern: /scooter motorcycle/i, price: 1400 },
  { pattern: /sportbike motorcycle/i, price: 3600 },
  { pattern: /generic motorcycle/i, price: 1600 },
];

export function marketAdjustedPriceUsd(rawPrice: number, seed: string, title = "", category = "") {
  const price = Math.max(0.5, Number(rawPrice) || 0);
  const label = `${title} ${category}`.toLowerCase();
  const anchor = MARKET_PRICE_ANCHORS.find((item) => item.pattern.test(label))?.price || price;
  const categoryKey = String(category || "").toLowerCase();
  const seeded = stableNumber(seed);
  let factor = 0.54 + seeded * 0.16;

  if (/groceries|grocery|beauty|skin|fragrance|personal|health/i.test(categoryKey)) factor = 0.62 + seeded * 0.12;
  if (/smartphone|mobile|electronics|gadgets/i.test(label)) factor = 0.57 + seeded * 0.13;
  if (/motorcycle|sportbike|scooter/i.test(label)) factor = 0.50 + seeded * 0.12;
  if (/furniture|sofa|bed|table|chair|home|kitchen/i.test(label)) factor = 0.55 + seeded * 0.14;
  if (/jewelery|jewelry|gold|silver|bracelet|ring|earring/i.test(label)) factor = 0.48 + seeded * 0.12;
  if (price <= 2) factor = 0.82 + seeded * 0.08;

  let adjusted = anchor * factor;
  if (/motorcycle|sportbike|scooter/i.test(label)) adjusted = clamp(adjusted, 950, 6500);
  else if (/iphone|galaxy|oppo|realme|vivo|smartphone|mobile phone/i.test(label)) adjusted = clamp(adjusted, 18, 420);
  else if (/laptop|monitor|tv|camera|ssd|hard drive|tablet|electronics|gadgets/i.test(label)) adjusted = clamp(adjusted, 6, 950);
  else if (/furniture|sofa|bed|mattress|refrigerator|dining|table|chair/i.test(label)) adjusted = clamp(adjusted, 12, 1400);
  else if (/jewelery|jewelry|gold|silver|bracelet|ring|earring/i.test(label)) adjusted = clamp(adjusted, 6, 360);
  else if (/groceries|grocery|beauty|skin|fragrance|personal|health/i.test(categoryKey)) adjusted = clamp(adjusted, 0.75, 85);
  else adjusted = clamp(adjusted, 0.75, 900);

  return roundShopMoney(adjusted, "USD");
}

function lowerTestPrice(rawPrice: number, seed: string, title = "", category = "") {
  return marketAdjustedPriceUsd(rawPrice, seed, title, category);
}

type GeneratedMarketPack = {
  key: string;
  count: number;
  category: string;
  brandPool: string[];
  nounPool: string[];
  stylePool: string[];
  detailPool: string[];
  imagePool: string[];
  minPrice: number;
  maxPrice: number;
  tags: string[];
};

const REAL_PRODUCT_IMAGE_POOLS = {
  jewelry: [
    "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80",
  ],
  womenFashion: [
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80",
  ],
  menFashion: [
    "https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1520975682031-a51d3c6d7cb1?auto=format&fit=crop&w=900&q=80",
  ],
  menShoes: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=900&q=80",
  ],
  womenShoes: [
    "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=900&q=80",
  ],
  electronics: [
    "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
  ],
  lifestyle: [
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=900&q=80",
  ],
};

const GENERATED_MARKET_PACKS: GeneratedMarketPack[] = [
  {
    key: "jewelry",
    count: 150,
    category: "Bijoux 2025-2026",
    brandPool: ["Aurelia", "Maison Dore", "Luna Pearl", "Nova Bijoux", "Orline"],
    nounPool: ["Bague solitaire", "Collier maille fine", "Bracelet tennis", "Creoles polies", "Pendentif coeur", "Set bague et boucles"],
    stylePool: ["vermeil 18k", "argent 925", "cristal premium", "perles nacrees", "acier dore"],
    detailPool: ["boite cadeau", "anti-ternissure", "taille ajustable", "edition soiree", "serti lumineux"],
    imagePool: REAL_PRODUCT_IMAGE_POOLS.jewelry,
    minPrice: 18,
    maxPrice: 260,
    tags: ["bijoux", "cadeau", "2026", "promotion"],
  },
  {
    key: "women-fashion",
    count: 200,
    category: "Mode femme 2025-2026",
    brandPool: ["Nova Mode", "Lyla Studio", "Sheen Select", "Urban Muse", "Cote Femme"],
    nounPool: ["Robe satin", "Blazer coupe courte", "Top maille", "Jean wide leg", "Ensemble deux pieces", "Chemise oversize", "Jupe plisse"],
    stylePool: ["minimal chic", "pastel ete", "business doux", "streetwear premium", "soiree elegante"],
    detailPool: ["tissu respirant", "coupe actuelle", "finition douce", "taille inclusive", "collection 2026"],
    imagePool: REAL_PRODUCT_IMAGE_POOLS.womenFashion,
    minPrice: 9,
    maxPrice: 74,
    tags: ["femme", "mode", "shein-style", "2026"],
  },
  {
    key: "men-fashion",
    count: 200,
    category: "Mode homme 2025-2026",
    brandPool: ["Northline", "Atlas Wear", "Urban Gent", "Mode Homme FX", "Cobalt Studio"],
    nounPool: ["Chemise oxford", "Polo premium", "Jean slim confort", "Veste bomber", "Sweat molleton", "Pantalon cargo", "Blazer leger"],
    stylePool: ["casual business", "street premium", "sport chic", "minimal noir", "weekend urbain"],
    detailPool: ["coutures renforcees", "coupe moderne", "matiere respirante", "facile a assortir", "collection 2026"],
    imagePool: REAL_PRODUCT_IMAGE_POOLS.menFashion,
    minPrice: 12,
    maxPrice: 92,
    tags: ["homme", "mode", "2026", "promo"],
  },
  {
    key: "men-shoes",
    count: 100,
    category: "Chaussures homme 2025-2026",
    brandPool: ["Stride Pro", "AeroStep", "Urban Sole", "FlexRun", "North Boot"],
    nounPool: ["Sneakers running", "Derbies cuir", "Baskets basses", "Boots urbaines", "Mocassins souples"],
    stylePool: ["semelle confort", "cuir premium", "mesh respirant", "look sport luxe", "usage quotidien"],
    detailPool: ["anti-glisse", "legeres", "amorti renforce", "collection 2026", "finition durable"],
    imagePool: REAL_PRODUCT_IMAGE_POOLS.menShoes,
    minPrice: 24,
    maxPrice: 165,
    tags: ["chaussures", "homme", "sneakers", "2026"],
  },
  {
    key: "women-shoes",
    count: 150,
    category: "Chaussures femme 2025-2026",
    brandPool: ["Bella Step", "Luna Shoes", "Nova Heel", "Soft Walk", "Muse Sole"],
    nounPool: ["Sandales talon", "Sneakers pastel", "Escarpins vernis", "Bottines chic", "Mules confort", "Ballerines souples"],
    stylePool: ["soiree", "bureau", "casual luxe", "ete 2026", "brillant discret"],
    detailPool: ["semelle stable", "confort long port", "finition elegante", "anti-glisse", "forme moderne"],
    imagePool: REAL_PRODUCT_IMAGE_POOLS.womenShoes,
    minPrice: 18,
    maxPrice: 150,
    tags: ["chaussures", "femme", "talons", "2026"],
  },
  {
    key: "electronics",
    count: 200,
    category: "Electronique & ordinateurs 2025-2026",
    brandPool: ["Apple", "Dell", "HP", "Lenovo", "ASUS", "MSI", "Samsung", "Acer", "Microsoft"],
    nounPool: [
      "MacBook Air M4 13 16Go 256Go",
      "MacBook Air M4 15 16Go 512Go",
      "MacBook Pro M4 Pro 14 24Go 512Go",
      "MacBook Pro 16 M4 Max 36Go 1To",
      "iMac 24 M4",
      "Mac mini M4",
      "Dell XPS 13 2025",
      "HP Spectre x360 14",
      "ThinkPad X1 Carbon Gen 13",
      "Surface Laptop 7",
      "ASUS ROG Zephyrus G14",
      "Lenovo Legion Pro 7i",
      "MSI Stealth 16",
      "Acer Predator Helios Neo 16",
      "Galaxy Book4 Pro",
      "Moniteur OLED 27 240Hz",
      "SSD NVMe 2To",
      "Station dock USB-C Pro",
    ],
    stylePool: ["stock verifie", "haute performance", "pro createur", "gaming fluide", "bureau premium"],
    detailPool: ["garantie partenaire", "edition 2025-2026", "pret pour IA", "prix reduit", "configuration fiable"],
    imagePool: REAL_PRODUCT_IMAGE_POOLS.electronics,
    minPrice: 45,
    maxPrice: 2499,
    tags: ["ordinateur", "mac", "pc", "electronique", "2026"],
  },
  {
    key: "lifestyle",
    count: 100,
    category: "Maison & lifestyle 2025-2026",
    brandPool: ["HomeLine", "Travel FX", "WorkNest", "Pure Casa", "Daily Plus"],
    nounPool: ["Valise cabine", "Lampe bureau LED", "Sac ordinateur", "Organiseur maison", "Set verres premium", "Diffuseur aromatique"],
    stylePool: ["compact", "moderne", "durable", "minimal", "cadeau utile"],
    detailPool: ["usage quotidien", "finition propre", "gain de place", "collection 2026", "prix doux"],
    imagePool: REAL_PRODUCT_IMAGE_POOLS.lifestyle,
    minPrice: 8,
    maxPrice: 230,
    tags: ["maison", "lifestyle", "utile", "2026"],
  },
];

let generatedMarketCache: ShopProduct[] | null = null;

function generatedRawPrice(pack: GeneratedMarketPack, index: number, title: string) {
  const label = title.toLowerCase();
  const explicit = [
    [/macbook air m4 13/i, 999],
    [/macbook air m4 15/i, 1199],
    [/macbook pro m4 pro 14/i, 1999],
    [/macbook pro 16/i, 2499],
    [/imac 24/i, 1299],
    [/mac mini/i, 599],
    [/dell xps|spectre|thinkpad|surface laptop|galaxy book/i, 1199],
    [/rog|legion|msi|predator/i, 1499],
    [/oled 27/i, 649],
    [/ssd nvme/i, 129],
    [/station dock/i, 89],
  ].find(([pattern]) => (pattern as RegExp).test(label));
  if (explicit) return explicit[1] as number;
  return pack.minPrice + stableNumber(`${pack.key}:${index}:${title}:price`) * (pack.maxPrice - pack.minPrice);
}

export function buildGeneratedMarketProducts(): ShopProduct[] {
  if (generatedMarketCache) return generatedMarketCache;
  const products: ShopProduct[] = [];
  for (const pack of GENERATED_MARKET_PACKS) {
    for (let i = 0; i < pack.count; i += 1) {
      const n = i + 1;
      const brand = pack.brandPool[i % pack.brandPool.length];
      const noun = pack.nounPool[(i * 3 + 1) % pack.nounPool.length];
      const style = pack.stylePool[(i * 5 + 2) % pack.stylePool.length];
      const detail = pack.detailPool[(i * 7 + 3) % pack.detailPool.length];
      const year = i % 3 === 0 ? "2026" : "2025";
      const title = `${brand} ${noun} ${style} ${year} - S${String(n).padStart(3, "0")}`;
      const id = `gen_${pack.key}_${String(n).padStart(3, "0")}`;
      const image = pack.imagePool[i % pack.imagePool.length];
      const rawPrice = generatedRawPrice(pack, i, title);
      const rating = roundShopMoney(4.35 + stableNumber(`${id}:rating`) * 0.58, "USD");
      products.push({
        id,
        title,
        brand,
        description: `${noun} ${style}, selection ${year} avec une image representative du rayon, une reference boutique unique et un prix reduit pour attirer les clients FX Pro.`,
        category: pack.category,
        image,
        base_currency: "USD",
        base_price: lowerTestPrice(rawPrice, `generated:${id}:${title}`, title, pack.category),
        rating,
        stock: 6 + Math.floor(stableNumber(`${id}:stock`) * 88),
        tags: cleanTags([pack.tags, noun, style, detail, year]),
        source: "generated",
        sku: `FX-${pack.key.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}-${String(n).padStart(4, "0")}`,
        ref: `FXP-${year}-${pack.key.toUpperCase().slice(0, 3)}-${String(n).padStart(4, "0")}`,
        warranty: /electronique|ordinateur/i.test(pack.category) ? "Garantie partenaire 12 mois" : "Garantie boutique 30 jours",
        shipping: "Livraison partenaire ou suivi FX Pro apres paiement",
        availability: "In Stock",
        return_policy: "Retour selon controle produit et disponibilite partenaire",
        minimum_order_quantity: 1,
        images: [image],
        review_count: 24 + Math.floor(stableNumber(`${id}:reviews`) * 420),
      });
    }
  }
  generatedMarketCache = products;
  return products;
}

export function dedupeShopProducts(products: ShopProduct[]) {
  const seen = new Set<string>();
  const deduped: ShopProduct[] = [];
  for (const product of products) {
    const key = `${slugKey(product.title)}:${slugKey(product.category)}`;
    const skuKey = product.sku ? `sku:${String(product.sku).toLowerCase()}` : "";
    if (seen.has(key) || (skuKey && seen.has(skuKey))) continue;
    seen.add(key);
    if (skuKey) seen.add(skuKey);
    deduped.push(product);
  }
  return deduped;
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
        base_price: lowerTestPrice(basePrice > 600 ? basePrice / 100 : basePrice, `apilayer:${id}`, title, category),
        rating: roundShopMoney(4.25 + stableNumber(id) * 0.7, "USD"),
        stock: 8 + Math.floor(stableNumber(`${id}:stock`) * 34),
        tags: cleanTags([category, brand, raw?.breadcrumbs]),
        source: "apilayer" as const,
        sku: String(raw?.upc || raw?.sku || `API-${id}`).toUpperCase(),
        ref: `API-${id}`,
        images: [productImageFromRaw(raw)],
        review_count: 24 + Math.floor(stableNumber(`${id}:reviews`) * 180),
        availability: "In Stock",
      };
    })
    .filter(Boolean)
    .slice(0, 24) as ShopProduct[];
}

export async function fetchApilayerShopProducts(apiKey?: string, query = "premium snack") {
  const key = String(apiKey || "").trim();
  if (!key) return [];
  const encoded = encodeURIComponent(query || "premium snack");
  const attempts: { url: string; headers: Record<string, string> }[] = [
    {
      url: `https://api.apilayer.com/spoonacular/food/products/search?query=${encoded}&number=24`,
      headers: { apikey: key },
    },
    {
      url: `https://api.spoonacular.com/food/products/search?query=${encoded}&number=24&apiKey=${encodeURIComponent(key)}`,
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

export function normalizeDummyJsonProducts(rawProducts: any[] = []): ShopProduct[] {
  return rawProducts
    .map((raw, index) => {
      const rawId = String(raw?.id || index + 1);
      const title = String(raw?.title || "").trim();
      if (!title) return null;
      const category = String(raw?.category || "Catalogue").trim();
      const brand = String(raw?.brand || category || "FX Catalogue").trim();
      const images = Array.isArray(raw?.images) ? raw.images.filter((url: any) => String(url).startsWith("http")) : [];
      const image = String(raw?.thumbnail || images[0] || "").startsWith("http")
        ? String(raw?.thumbnail || images[0])
        : FALLBACK_SHOP_PRODUCTS[index % FALLBACK_SHOP_PRODUCTS.length].image;
      const basePrice = lowerTestPrice(Number(raw?.price || 0), `dummy:${rawId}:${title}`, title, category);
      return {
        id: `dummy_${rawId}`,
        title,
        brand,
        description:
          stripHtml(raw?.description) ||
          "Article catalogue avec photos, reference et retrait possible via une agence FX Pro partenaire.",
        category,
        image,
        base_currency: "USD" as const,
        base_price: basePrice,
        rating: roundShopMoney(Number(raw?.rating || 4.2), "USD"),
        stock: Math.max(0, Math.floor(Number(raw?.stock || 0))),
        tags: cleanTags([raw?.tags, category, brand]),
        source: "dummyjson" as const,
        sku: String(raw?.sku || `DUMMY-${rawId}`).toUpperCase(),
        ref: `DMY-${rawId}`,
        barcode: raw?.meta?.barcode ? String(raw.meta.barcode) : undefined,
        qr_code: raw?.meta?.qrCode ? String(raw.meta.qrCode) : undefined,
        warranty: raw?.warrantyInformation ? String(raw.warrantyInformation) : undefined,
        shipping: raw?.shippingInformation ? String(raw.shippingInformation) : undefined,
        availability: raw?.availabilityStatus ? String(raw.availabilityStatus) : raw?.stock ? "In Stock" : "Out of Stock",
        return_policy: raw?.returnPolicy ? String(raw.returnPolicy) : undefined,
        minimum_order_quantity: Math.max(1, Math.min(8, Math.floor(Number(raw?.minimumOrderQuantity || 1)))),
        images: [image, ...images].filter((url, i, all) => all.indexOf(url) === i).slice(0, 6),
        review_count: Array.isArray(raw?.reviews) ? raw.reviews.length : undefined,
      };
    })
    .filter(Boolean) as ShopProduct[];
}

export function normalizeFreeEcommerceProducts(rawProducts: any[] = []): ShopProduct[] {
  return rawProducts
    .map((raw, index) => {
      const rawId = String(raw?.id || index + 1);
      const title = String(raw?.name || raw?.title || "").trim();
      if (!title) return null;
      const category = String(raw?.category || "Catalogue").trim();
      const subCategory = String(raw?.subCategory || raw?.subcategory || category).trim();
      const image = String(raw?.image || "").startsWith("http")
        ? String(raw.image)
        : FALLBACK_SHOP_PRODUCTS[index % FALLBACK_SHOP_PRODUCTS.length].image;
      const basePrice = lowerTestPrice(Number(raw?.priceCents || raw?.price_cents || 0) / 100, `free:${rawId}:${title}`, title, category);
      return {
        id: `free_${rawId}`,
        title,
        brand: subCategory || "Free Ecommerce API",
        description:
          stripHtml(raw?.description) ||
          "Article catalogue avec retrait possible via le reseau d'agences FX Pro.",
        category,
        image,
        base_currency: "USD" as const,
        base_price: basePrice,
        rating: roundShopMoney(Number(raw?.rating?.stars || raw?.rating || 4.4), "USD"),
        stock: 15 + Math.floor(stableNumber(`free:${rawId}:stock`) * 85),
        tags: cleanTags([raw?.keywords, category, subCategory]),
        source: "freeapi" as const,
        sku: `FREE-${String(rawId).padStart(3, "0")}`,
        ref: `FREE-${rawId}`,
        images: [image],
        review_count: Number(raw?.rating?.count || 0) || undefined,
        availability: "In Stock",
        shipping: "Retrait agence ou expedition partenaire",
        return_policy: "Retour selon agence partenaire",
      };
    })
    .filter(Boolean) as ShopProduct[];
}

function titleCaseCategory(value: string) {
  return String(value || "Catalogue")
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeFakeStoreProducts(rawProducts: any[] = []): ShopProduct[] {
  return rawProducts
    .map((raw, index) => {
      const rawId = String(raw?.id || index + 1);
      const title = String(raw?.title || "").trim();
      if (!title) return null;
      const category = titleCaseCategory(String(raw?.category || "Catalogue"));
      const image = String(raw?.image || "").startsWith("http")
        ? String(raw.image)
        : FALLBACK_SHOP_PRODUCTS[index % FALLBACK_SHOP_PRODUCTS.length].image;
      const basePrice = lowerTestPrice(Number(raw?.price || 0), `fakestore:${rawId}:${title}`, title, category);
      const rating = typeof raw?.rating === "object" ? raw.rating : {};
      return {
        id: `fake_${rawId}`,
        title,
        brand: category,
        description:
          stripHtml(raw?.description) ||
          "Article boutique avec prix verifie cote serveur et recu FX Pro apres paiement.",
        category,
        image,
        base_currency: "USD" as const,
        base_price: basePrice,
        rating: roundShopMoney(Number(rating?.rate || 4.2), "USD"),
        stock: 12 + Math.floor(stableNumber(`fake:${rawId}:stock`) * 58),
        tags: cleanTags([category, title.split(/\s+/).slice(0, 4)]),
        source: "fakestore" as const,
        sku: `FAKE-${String(rawId).padStart(3, "0")}`,
        ref: `FKS-${rawId}`,
        images: [image],
        review_count: Number(rating?.count || 0) || undefined,
        availability: "In Stock",
        shipping: "Livraison partenaire apres confirmation FX Pro",
        return_policy: "Retour selon disponibilite partenaire",
      };
    })
    .filter(Boolean) as ShopProduct[];
}

const ESCUELA_BLOCKED_TITLES = new Set([
  "cot - furniture",
  "samsung",
  "nokia",
  "new product",
  "t-shirt",
  "mobile phones",
  "test product smth to test",
  "n",
  "m",
]);

function isBlockedEscuelaImage(url: string) {
  return /placehold\.co|placeimg\.com|picsum\.photos|products\.com/i.test(url);
}

function escuelaCategory(raw: any, title: string) {
  const source = String(raw?.category?.name || raw?.category || "").trim();
  if (source && !/updated category name/i.test(source)) return titleCaseCategory(source);
  const label = title.toLowerCase();
  if (/cap|jogger|shorts|t-shirt|tee|shirt/i.test(label)) return "Fashion & Apparel";
  if (/controller|headphone|earbud|toaster|mouse|laptop|phone|smartwatch/i.test(label)) return "Electronics & Gadgets";
  if (/sofa|dining|table|armchair|workstation|chair/i.test(label)) return "Home & Kitchen";
  if (/sneaker|heel|sandal|boot|loafer|shoe|cleat/i.test(label)) return "Footwear";
  return "Lifestyle";
}

export function normalizeEscuelajsProducts(rawProducts: any[] = []): ShopProduct[] {
  return rawProducts
    .map((raw, index) => {
      const rawId = String(raw?.id || index + 1);
      const title = String(raw?.title || "").trim();
      const titleKey = title.toLowerCase();
      const images = Array.isArray(raw?.images) ? raw.images.map((url: any) => String(url)).filter((url: string) => url.startsWith("http")) : [];
      const cleanImages = images.filter((url: string) => !isBlockedEscuelaImage(url));
      if (!title || title.length < 4 || ESCUELA_BLOCKED_TITLES.has(titleKey) || !cleanImages.length) return null;
      const description = stripHtml(raw?.description);
      if (description.length < 24 || /^a description$/i.test(description) || /^string$/i.test(description)) return null;
      const category = escuelaCategory(raw, title);
      const image = cleanImages[0] || FALLBACK_SHOP_PRODUCTS[index % FALLBACK_SHOP_PRODUCTS.length].image;
      const basePrice = lowerTestPrice(Number(raw?.price || 0), `escuelajs:${rawId}:${title}`, title, category);
      return {
        id: `escuela_${rawId}`,
        title,
        brand: category,
        description,
        category,
        image,
        base_currency: "USD" as const,
        base_price: basePrice,
        rating: roundShopMoney(4.15 + stableNumber(`escuela:${rawId}:rating`) * 0.75, "USD"),
        stock: 10 + Math.floor(stableNumber(`escuela:${rawId}:stock`) * 74),
        tags: cleanTags([category, raw?.category?.slug, title.split(/\s+/).slice(0, 5)]),
        source: "escuelajs" as const,
        sku: `ESC-${String(rawId).padStart(3, "0")}`,
        ref: `ESC-${rawId}`,
        images: cleanImages.slice(0, 5),
        review_count: 18 + Math.floor(stableNumber(`escuela:${rawId}:reviews`) * 220),
        availability: "In Stock",
        shipping: "Livraison partenaire apres confirmation FX Pro",
        return_policy: "Retour selon disponibilite partenaire",
      };
    })
    .filter(Boolean) as ShopProduct[];
}

let dummyJsonCache: { at: number; items: ShopProduct[] } | null = null;
let freeApiCache: { at: number; items: ShopProduct[] } | null = null;
let fakeStoreCache: { at: number; items: ShopProduct[] } | null = null;
let escuelajsCache: { at: number; items: ShopProduct[] } | null = null;
const SHOP_PROVIDER_CACHE_MS = 12 * 60 * 1000;

export async function fetchDummyJsonShopProducts(limit = 150) {
  if (dummyJsonCache && Date.now() - dummyJsonCache.at < SHOP_PROVIDER_CACHE_MS) return dummyJsonCache.items;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const fields = [
      "id",
      "title",
      "description",
      "category",
      "price",
      "discountPercentage",
      "rating",
      "stock",
      "tags",
      "brand",
      "sku",
      "warrantyInformation",
      "shippingInformation",
      "availabilityStatus",
      "returnPolicy",
      "minimumOrderQuantity",
      "meta",
      "images",
      "thumbnail",
    ].join(",");
    const res = await fetch(`https://dummyjson.com/products?limit=${limit}&select=${fields}`, { signal: controller.signal });
    if (!res.ok) return [];
    const body = await res.json();
    const normalized = normalizeDummyJsonProducts(Array.isArray(body?.products) ? body.products : []).slice(0, limit);
    dummyJsonCache = { at: Date.now(), items: normalized };
    return normalized;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFreeEcommerceShopProducts() {
  if (freeApiCache && Date.now() - freeApiCache.at < SHOP_PROVIDER_CACHE_MS) return freeApiCache.items;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch("https://kolzsticks.github.io/Free-Ecommerce-Products-Api/main/products.json", { signal: controller.signal });
    if (res.ok) {
      const body = await res.json();
      const normalized = normalizeFreeEcommerceProducts(Array.isArray(body) ? body : []);
      if (normalized.length) {
        freeApiCache = { at: Date.now(), items: normalized };
        return normalized;
      }
    }
  } catch {
    // The GitHub Pages endpoint can be slow in some regions; the local seed keeps the page instant.
  } finally {
    clearTimeout(timer);
  }
  const seeded = normalizeFreeEcommerceProducts(FREE_ECOMMERCE_SEED_PRODUCTS);
  freeApiCache = { at: Date.now(), items: seeded };
  return seeded;
}

export async function fetchFakeStoreShopProducts() {
  if (fakeStoreCache && Date.now() - fakeStoreCache.at < SHOP_PROVIDER_CACHE_MS) return fakeStoreCache.items;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch("https://fakestoreapi.com/products", { signal: controller.signal });
    if (!res.ok) return [];
    const body = await res.json();
    const normalized = normalizeFakeStoreProducts(Array.isArray(body) ? body : []);
    fakeStoreCache = { at: Date.now(), items: normalized };
    return normalized;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchEscuelajsShopProducts(limit = 80) {
  if (escuelajsCache && Date.now() - escuelajsCache.at < SHOP_PROVIDER_CACHE_MS) return escuelajsCache.items;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(`https://api.escuelajs.co/api/v1/products?offset=0&limit=${limit}`, { signal: controller.signal });
    if (!res.ok) return [];
    const body = await res.json();
    const normalized = normalizeEscuelajsProducts(Array.isArray(body) ? body : []);
    escuelajsCache = { at: Date.now(), items: normalized };
    return normalized;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function applyShopOverrides(products: ShopProduct[], overrides: ShopProductOverride[] = []) {
  if (!overrides.length) return products;
  const byKey = new Map<string, ShopProductOverride>();
  for (const override of overrides) {
    const key = String(override.product_id || override.id || override.sku || "").trim();
    if (key) byKey.set(key, override);
  }
  return products
    .map((product) => {
      const override = byKey.get(product.id) || (product.sku ? byKey.get(product.sku) : undefined);
      if (!override) return product;
      if (override.hidden || override.visible === false) return { ...product, hidden: true, admin_managed: true };
      const priceOverride = Number(override.price_override_usd ?? override.base_price);
      return {
        ...product,
        title: override.title || product.title,
        brand: override.brand || product.brand,
        description: override.description || product.description,
        category: override.category || product.category,
        image: override.image || product.image,
        base_price: priceOverride > 0 ? roundShopMoney(priceOverride, "USD") : product.base_price,
        stock: Number.isFinite(Number(override.stock_override ?? override.stock))
          ? Math.max(0, Math.floor(Number(override.stock_override ?? override.stock)))
          : product.stock,
        tags: Array.isArray(override.tags) && override.tags.length ? cleanTags([override.tags]) : product.tags,
        admin_managed: true,
      };
    })
    .filter((product) => !product.hidden);
}

export function buildShopPromotions(products: ShopProduct[], todayKey = shopTodayKey()): ShopPromotion[] {
  const pool = [...products].sort((a, b) => stableNumber(`${todayKey}:${a.id}`) - stableNumber(`${todayKey}:${b.id}`));
  const end = new Date(`${todayKey}T23:59:59.000Z`).toISOString();
  const discounts = [70, 55, 40, 30, 22, 15, 12, 10];
  const labels = ["Flash -70%", "Selection -55%", "Bonus -40%", "Prix doux -30%", "Client -22%", "Decouverte -15%", "Panier -12%", "Mini pub -10%"];
  return pool.slice(0, Math.min(8, pool.length)).map((product, index) => ({
    product_id: product.id,
    discount_percent: discounts[index] || 10,
    label: labels[index] || "Promo boutique",
    ends_at: end,
  }));
}

export function buildShopCatalogPayload({
  remoteProducts = [],
  dummyProducts = [],
  freeProducts = normalizeFreeEcommerceProducts(FREE_ECOMMERCE_SEED_PRODUCTS),
  fakeStoreProducts = [],
  escuelajsProducts = [],
  generatedProducts = buildGeneratedMarketProducts(),
  overrides = [],
  currency = "XOF",
  rates = {},
}: {
  remoteProducts?: ShopProduct[];
  dummyProducts?: ShopProduct[];
  freeProducts?: ShopProduct[];
  fakeStoreProducts?: ShopProduct[];
  escuelajsProducts?: ShopProduct[];
  generatedProducts?: ShopProduct[];
  overrides?: ShopProductOverride[];
  currency?: string;
  rates?: Record<string, number>;
}): ShopCatalogPayload {
  const code = normalizeShopCurrency(currency);
  const merged = applyShopOverrides(
    dedupeShopProducts([
      ...remoteProducts,
      ...dummyProducts,
      ...freeProducts,
      ...fakeStoreProducts,
      ...escuelajsProducts,
      ...FALLBACK_SHOP_PRODUCTS,
      ...generatedProducts,
    ]),
    overrides
  ).slice(0, MAX_SHOP_PRODUCTS);
  const products = merged.length ? merged : FALLBACK_SHOP_PRODUCTS;
  const productIds = new Set(products.map((product) => product.id));
  const adminPromotions = overrides
    .filter((override) => override.promo_active && productIds.has(String(override.product_id || override.id || "")))
    .map((override) => {
      const discount = Math.max(1, Math.min(90, Number(override.promo_discount ?? override.discount_override ?? 10)));
      return {
        product_id: String(override.product_id || override.id),
        discount_percent: discount,
        label: `Admin -${discount}%`,
        ends_at: new Date(`${shopTodayKey()}T23:59:59.000Z`).toISOString(),
      };
    });
  const promotions = [...adminPromotions, ...buildShopPromotions(products).filter((promo) => !adminPromotions.some((adminPromo) => adminPromo.product_id === promo.product_id))].slice(0, 10);
  const promoMap = new Map(promotions.map((promo) => [promo.product_id, promo]));
  const priced = products.map((product) => {
    const original = convertShopMoney(product.base_price, product.base_currency, code, rates);
    const promotion = promoMap.get(product.id);
    const price = promotion ? roundShopMoney(original * (1 - promotion.discount_percent / 100), code) : original;
    return { ...product, original_price: original, price, currency: code, promotion };
  });
  const dynamicCount = remoteProducts.length + dummyProducts.length + freeProducts.length + fakeStoreProducts.length + escuelajsProducts.length + generatedProducts.length;
  const source = dynamicCount >= products.length ? "mixed" : dynamicCount ? "mixed" : "fallback";
  return {
    products: priced,
    promotions,
    currency: code,
    source,
    updated_at: new Date().toISOString(),
    agency_message: SHOP_AGENCY_MESSAGE,
    pickup_available: SHOP_PICKUP_AVAILABLE,
    pickup_message: SHOP_PICKUP_MESSAGE,
  };
}

export function hashShopCartSnapshot(items: any[], total: number, currency: string) {
  const raw = JSON.stringify({
    c: currency,
    t: total,
    i: items.map((item) => [item.product_id, item.quantity, item.unit_price, item.discount_percent]),
  });
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sp_${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
  const seen = new Set<string>();
  if (lines.length > 30) throw new Error("Panier trop volumineux. Validez plusieurs commandes.");
  const cleanLines = lines
    .map((line) => {
      const product_id = String(line.product_id || "");
      if (seen.has(product_id)) throw new Error("Produit en doublon detecte dans le panier.");
      seen.add(product_id);
      return {
        product_id,
        quantity: Math.max(1, Math.min(8, Math.floor(Number(line.quantity || 1)))),
      };
    })
    .filter((line) => productMap.has(line.product_id));

  if (!cleanLines.length) throw new Error("Panier vide ou produits indisponibles.");
  if (cleanLines.length > 20) throw new Error("Panier trop volumineux. Validez plusieurs commandes.");

  const items = cleanLines.map((line) => {
    const product = productMap.get(line.product_id)!;
    if (product.hidden) throw new Error(`${product.title}: produit indisponible.`);
    if (!Number.isFinite(product.price) || product.price <= 0) throw new Error(`${product.title}: prix invalide.`);
    if (line.quantity > product.stock) throw new Error(`${product.title}: stock insuffisant.`);
    const lineTotal = roundShopMoney(product.price * line.quantity, orderCurrency);
    const savings = roundShopMoney(Math.max(0, (product.original_price - product.price) * line.quantity), orderCurrency);
    return {
      product_id: product.id,
      title: product.title,
      brand: product.brand,
      image: product.image,
      category: product.category,
      source: product.source,
      seller_id: product.seller_id,
      seller_store_name: product.seller_store_name || product.brand,
      sku: product.sku,
      ref: product.ref,
      quantity: line.quantity,
      unit_price: product.price,
      original_unit_price: product.original_price,
      discount_percent: product.promotion?.discount_percent || 0,
      line_total: lineTotal,
      savings,
    };
  });

  const total = roundShopMoney(items.reduce((sum, item) => sum + item.line_total, 0), orderCurrency);
  const discountTotal = roundShopMoney(items.reduce((sum, item) => sum + item.savings, 0), orderCurrency);
  const debitAmount = convertShopMoney(total, orderCurrency, walletCurrency, rates);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(debitAmount) || debitAmount <= 0) {
    throw new Error("Montant de commande invalide.");
  }
  return {
    items,
    total,
    discount_total: discountTotal,
    currency: normalizeShopCurrency(orderCurrency),
    wallet_currency: normalizeShopCurrency(walletCurrency),
    debit_amount: debitAmount,
    price_snapshot_hash: hashShopCartSnapshot(items, total, orderCurrency),
  };
}
