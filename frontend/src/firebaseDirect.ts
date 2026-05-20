import { initializeApp, getApp, getApps } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, getStorage, ref as storageRef, uploadString } from "firebase/storage";
import { firebaseConfig } from "./firebaseConfig";
import { FREE_GAME_SNAPSHOT } from "./freeGamesSnapshot";
import type { User } from "./auth";
import {
  BONUS_COUNTRIES,
  createBonusEvaluation,
  getBonusCatalog,
  getBonusCountry,
  getMinimumBonusDeposit,
  nextBonusStatus,
  type BonusEvaluation,
} from "./bonusCatalog";
import {
  buildShopCatalogPayload,
  calculateShopCart,
  fetchApilayerShopProducts,
  fetchDummyJsonShopProducts,
  fetchEscuelajsShopProducts,
  fetchFakeStoreShopProducts,
  fetchFreeEcommerceShopProducts,
  hashShopCartSnapshot,
  convertShopMoney,
  normalizeShopCurrency,
  roundShopMoney,
  SHOP_AGENCY_MESSAGE,
  SHOP_PICKUP_MESSAGE,
  type ShopCartLine,
  type ShopProductOverride,
} from "./shopCatalog";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const ADMIN_EMAIL = "fxpro@gmail.com";

const USERS = "fxpro_users";
const TXNS = "fxpro_transactions";
const NOTIFS = "fxpro_notifications";
const ALERTS = "fxpro_alerts";
const VAULTS = "fxpro_vaults";
const BONUS = "fxpro_bonus";
const BONUS_EVENTS = "fxpro_bonus_events";
const GAME_EVENTS = "fxpro_game_events";
const RISK_LOGS = "fxpro_risk_logs";
const SHOP_ORDERS = "fxpro_shop_orders";
const SHOP_SELLER_ORDERS = "fxpro_shop_seller_orders";
const SHOP_PRODUCTS = "fxpro_shop_products";
const SHOP_SELLERS = "fxpro_shop_sellers";
const SHOP_SELLER_ARTICLES = "fxpro_shop_seller_articles";
const MOVIE_LIBRARY = "fxpro_movie_library";
const STEAM_PURCHASES = "fxpro_steam_purchases";
const APILAYER_SHOP_KEY = process.env.EXPO_PUBLIC_APILAYER_KEY || "";
const TMDB_READ_TOKEN = process.env.EXPO_PUBLIC_TMDB_READ_TOKEN || "";
const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || "4300217e16dba490da871af16163cedb";
const STREAM_DEMO_MP4_480 = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
const STREAM_DEMO_MP4_720 = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const STREAM_DEMO_MP4_1080 = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4";
const STREAM_DEMO_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const STREAM_DEMO_DASH = "https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd";
const DEFAULT_FAVORITE_PAIR_KEYS = ["EUR_USD", "EUR_XOF"];
const MAX_INLINE_PROFILE_PICTURE_CHARS = 700000;
const WITHDRAW_PAUSED_NOTICE_FLAG = "withdraw_paused_notice_2026_05_18_at";
const WITHDRAW_PAUSED_NOTICE_TITLE = "Retrait momentanement indisponible";
const WITHDRAW_PAUSED_NOTICE_BODY =
  "Le retrait est momentanement indisponible pendant une mise a jour de securite et de logistique. Votre solde reste protege, les depots, transferts, achats boutique et notifications continuent normalement. FX Pro vous previendra des la reprise.";
const SERVICES_LIMITED_NOTICE_FLAG = "services_limited_notice_2026_05_18_at";
const SERVICES_LIMITED_NOTICE_TITLE = "Services momentanement indisponibles";
const SERVICES_LIMITED_NOTICE_BODY =
  "Certains services externes peuvent etre indisponibles pendant la mise a jour. Le solde, les recus, la boutique suivie, les jeux avec tickets et les notifications restent proteges.";
const SERVICES_AVAILABLE_FLAG = "services_available_notice_2026_05_20_streaming_games_shop_at";
const SERVICES_AVAILABLE_TITLE = "Services FX Pro disponibles";
const SERVICES_AVAILABLE_BODY =
  "La vente en ligne, les films, series, animes, jeux a tickets et notifications vendeur sont disponibles. Profite des promos jeux, de la boutique moins chere et du streaming sans publicite.";
const MAINTENANCE_NOTICE_FLAG = "maintenance_update_notice_2026_05_20_at";
const MAINTENANCE_NOTICE_TITLE = "Maintenance FX Pro en cours";
const MAINTENANCE_NOTICE_BODY =
  "Une maintenance de l'app est en cours pour ameliorer la boutique, les films, les jeux et la stabilite. Les soldes, recus, commandes et notifications restent proteges pendant la mise a jour.";
const GAME_DAILY_TICKETS = 5;
const GAME_TICKET_NOTICE_PREFIX = "game_tickets_recharged_notice_";
const GAME_GLOBAL_RECHARGE_FLAG = "game_global_recharge_2026_05_20_at";
const GAME_CONFIG: Record<string, { name: string; win_chance: number; min_prize: number; max_prize: number; mode?: string }> = {
  scratch: { name: "Carte Neon", win_chance: 0.34, min_prize: 80, max_prize: 750 },
  vault: { name: "Coffre Flash", win_chance: 0.26, min_prize: 150, max_prize: 1400 },
  reflex: { name: "Reflexe FX", win_chance: 0.42, min_prize: 40, max_prize: 420 },
  hero_duel: { name: "Duel Heros", win_chance: 0.36, min_prize: 120, max_prize: 1100, mode: "hero" },
  power_match: { name: "Power Match", win_chance: 0.3, min_prize: 220, max_prize: 1800, mode: "hero" },
  speed_run: { name: "Speed Run", win_chance: 0.44, min_prize: 60, max_prize: 620, mode: "hero" },
};
const STEAM_APPLIST_URL = "https://api.steampowered.com/ISteamApps/GetAppList/v2/";
const STEAM_DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const STEAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STEAM_FEATURED_APPS = [
  { appid: 271590, name: "Grand Theft Auto V Legacy" },
  { appid: 3240220, name: "Grand Theft Auto V Enhanced" },
  { appid: 1245620, name: "ELDEN RING" },
  { appid: 1938090, name: "Call of Duty" },
  { appid: 2669320, name: "EA SPORTS FC 25" },
  { appid: 2195250, name: "EA SPORTS FC 24" },
  { appid: 730, name: "Counter-Strike 2" },
  { appid: 570, name: "Dota 2" },
  { appid: 1174180, name: "Red Dead Redemption 2" },
  { appid: 292030, name: "The Witcher 3: Wild Hunt" },
  { appid: 1086940, name: "Baldur's Gate 3" },
  { appid: 578080, name: "PUBG: BATTLEGROUNDS" },
  { appid: 252490, name: "Rust" },
  { appid: 359550, name: "Tom Clancy's Rainbow Six Siege" },
  { appid: 1172470, name: "Apex Legends" },
  { appid: 230410, name: "Warframe" },
  { appid: 381210, name: "Dead by Daylight" },
  { appid: 1551360, name: "Forza Horizon 5" },
  { appid: 990080, name: "Hogwarts Legacy" },
  { appid: 1091500, name: "Cyberpunk 2077" },
  { appid: 440, name: "Team Fortress 2" },
  { appid: 346110, name: "ARK: Survival Evolved" },
  { appid: 413150, name: "Stardew Valley" },
  { appid: 945360, name: "Among Us" },
  { appid: 105600, name: "Terraria" },
  { appid: 322330, name: "Don't Starve Together" },
  { appid: 39210, name: "FINAL FANTASY XIV Online" },
  { appid: 236390, name: "War Thunder" },
  { appid: 444200, name: "World of Tanks Blitz" },
  { appid: 238960, name: "Path of Exile" },
  { appid: 582010, name: "Monster Hunter: World" },
  { appid: 1203220, name: "NARAKA: BLADEPOINT" },
  { appid: 227300, name: "Euro Truck Simulator 2" },
  { appid: 275850, name: "No Man's Sky" },
  { appid: 242760, name: "The Forest" },
  { appid: 1326470, name: "Sons Of The Forest" },
  { appid: 1145360, name: "Hades" },
  { appid: 367520, name: "Hollow Knight" },
  { appid: 289070, name: "Sid Meier's Civilization VI" },
  { appid: 1248130, name: "Farming Simulator 22" },
];
let steamAppListCache: { items: any[]; expiresAt: number; source: string } = { items: [], expiresAt: 0, source: "featured_fallback" };
const steamDetailCache = new Map<number, { item: any; expiresAt: number }>();
const MOVIE_PAGE_SIZE_DEFAULT = 24;
const MOVIE_GENRE_GROUPS: Record<string, { label: string; movie: number[]; tv: number[] }> = {
  all: { label: "Tout", movie: [], tv: [] },
  action: { label: "Action", movie: [28], tv: [10759] },
  adventure: { label: "Aventure", movie: [12], tv: [10759] },
  comedy: { label: "Comedie", movie: [35], tv: [35] },
  drama: { label: "Drame", movie: [18], tv: [18] },
  scifi: { label: "Science-fiction", movie: [878], tv: [10765] },
  animation: { label: "Animation", movie: [16], tv: [16] },
  crime: { label: "Crime", movie: [80], tv: [80] },
  documentary: { label: "Documentaire", movie: [99], tv: [99] },
  family: { label: "Famille", movie: [10751], tv: [10751] },
  horror: { label: "Horreur", movie: [27], tv: [9648] },
  anime: { label: "Anime", movie: [16, 12, 14], tv: [16, 10759, 10765] },
};
const MOVIE_SORT_OPTIONS: Record<string, string> = {
  popular: "popularity.desc",
  rating: "vote_average.desc",
  recent: "primary_release_date.desc",
};

const SUPERHERO_ROSTER = [
  { id: 1, name: "A-Bomb", slug: "1-a-bomb", publisher: "Marvel Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/1-a-bomb.jpg", stats: { intelligence: 38, strength: 100, speed: 17, durability: 80, power: 24, combat: 64 } },
  { id: 2, name: "Abe Sapien", slug: "2-abe-sapien", publisher: "Dark Horse Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/2-abe-sapien.jpg", stats: { intelligence: 88, strength: 28, speed: 35, durability: 65, power: 100, combat: 85 } },
  { id: 4, name: "Abomination", slug: "4-abomination", publisher: "Marvel Comics", alignment: "bad", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/4-abomination.jpg", stats: { intelligence: 63, strength: 80, speed: 53, durability: 90, power: 62, combat: 95 } },
  { id: 20, name: "Amazo", slug: "20-amazo", publisher: "DC Comics", alignment: "bad", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/20-amazo.jpg", stats: { intelligence: 63, strength: 100, speed: 83, durability: 100, power: 100, combat: 100 } },
  { id: 35, name: "Apocalypse", slug: "35-apocalypse", publisher: "Marvel Comics", alignment: "bad", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/35-apocalypse.jpg", stats: { intelligence: 100, strength: 100, speed: 33, durability: 100, power: 100, combat: 60 } },
  { id: 38, name: "Aquaman", slug: "38-aquaman", publisher: "DC Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/38-aquaman.jpg", stats: { intelligence: 81, strength: 85, speed: 79, durability: 80, power: 100, combat: 80 } },
  { id: 70, name: "Batman", slug: "70-batman", publisher: "DC Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/70-batman.jpg", stats: { intelligence: 100, strength: 26, speed: 27, durability: 50, power: 47, combat: 100 } },
  { id: 95, name: "Black Adam", slug: "95-black-adam", publisher: "DC Comics", alignment: "bad", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/95-black-adam.jpg", stats: { intelligence: 88, strength: 100, speed: 92, durability: 100, power: 100, combat: 56 } },
  { id: 149, name: "Captain America", slug: "149-captain-america", publisher: "Marvel Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/149-captain-america.jpg", stats: { intelligence: 69, strength: 19, speed: 38, durability: 55, power: 60, combat: 100 } },
  { id: 213, name: "Deadpool", slug: "213-deadpool", publisher: "Marvel Comics", alignment: "neutral", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/213-deadpool.jpg", stats: { intelligence: 69, strength: 32, speed: 50, durability: 100, power: 100, combat: 100 } },
  { id: 332, name: "Hulk", slug: "332-hulk", publisher: "Marvel Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/332-hulk.jpg", stats: { intelligence: 88, strength: 100, speed: 63, durability: 100, power: 98, combat: 85 } },
  { id: 346, name: "Iron Man", slug: "346-iron-man", publisher: "Marvel Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/346-iron-man.jpg", stats: { intelligence: 100, strength: 85, speed: 58, durability: 85, power: 100, combat: 64 } },
  { id: 620, name: "Spider-Man", slug: "620-spider-man", publisher: "Marvel Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/620-spider-man.jpg", stats: { intelligence: 90, strength: 55, speed: 67, durability: 75, power: 74, combat: 85 } },
  { id: 644, name: "Superman", slug: "644-superman", publisher: "DC Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/644-superman.jpg", stats: { intelligence: 94, strength: 100, speed: 100, durability: 100, power: 100, combat: 85 } },
  { id: 655, name: "Thanos", slug: "655-thanos", publisher: "Marvel Comics", alignment: "bad", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/655-thanos.jpg", stats: { intelligence: 100, strength: 100, speed: 33, durability: 100, power: 100, combat: 80 } },
  { id: 717, name: "Wolverine", slug: "717-wolverine", publisher: "Marvel Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/717-wolverine.jpg", stats: { intelligence: 63, strength: 32, speed: 50, durability: 100, power: 89, combat: 100 } },
  { id: 720, name: "Wonder Woman", slug: "720-wonder-woman", publisher: "DC Comics", alignment: "good", image: "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/720-wonder-woman.jpg", stats: { intelligence: 88, strength: 100, speed: 79, durability: 100, power: 100, combat: 100 } },
];

const MOVIE_FALLBACK_ITEMS = [
  { id: 550, media_type: "movie", title: "Fight Club", overview: "Un employe insomniaque decouvre un cercle clandestin qui change sa vision du controle et de la consommation.", poster_url: "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", backdrop_url: "https://image.tmdb.org/t/p/w780/hZkgoQYus5vegHoetLkCJzb17zJ.jpg", vote_average: 8.4, release_date: "1999-10-15", genre_ids: [18], source: "fallback" },
  { id: 1399, media_type: "tv", title: "Game of Thrones", overview: "Des familles nobles luttent pour le pouvoir pendant qu'une menace ancienne grandit au-dela du mur.", poster_url: "https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg", backdrop_url: "https://image.tmdb.org/t/p/w780/suopoADq0k8YZr4dQXcU6pToj6s.jpg", vote_average: 8.5, release_date: "2011-04-17", genre_ids: [10759, 18], source: "fallback" },
  { id: 157336, media_type: "movie", title: "Interstellar", overview: "Une equipe traverse l'espace pour chercher un futur possible a l'humanite.", poster_url: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", backdrop_url: "https://image.tmdb.org/t/p/w780/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg", vote_average: 8.5, release_date: "2014-11-05", genre_ids: [12, 18, 878], source: "fallback" },
  { id: 66732, media_type: "tv", title: "Stranger Things", overview: "Des enfants, une disparition et une force etrange bouleversent une petite ville.", poster_url: "https://image.tmdb.org/t/p/w500/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg", backdrop_url: "https://image.tmdb.org/t/p/w780/56v2KjBlU4XaOv9rVYEQypROD7P.jpg", vote_average: 8.6, release_date: "2016-07-15", genre_ids: [18, 9648, 10765], source: "fallback" },
];

const FREE_GAME_FALLBACK_ITEMS = FREE_GAME_SNAPSHOT.map((item) => ({ ...item }));

const INITIAL_BALANCES: Record<string, number> = {
  EUR: 0,
  XOF: 0,
  XAF: 0,
  USD: 0,
  GBP: 0,
  NGN: 0,
  MAD: 0,
  CAD: 0,
  CHF: 0,
  JPY: 0,
  CNY: 0,
  AUD: 0,
  INR: 0,
  BRL: 0,
  ZAR: 0,
  KES: 0,
  GHS: 0,
  SEK: 0,
  AED: 0,
};

const FALLBACK_RATES: Record<string, number> = {
  EUR: 1,
  XOF: 655.957,
  XAF: 655.957,
  USD: 1.08,
  GBP: 0.86,
  NGN: 1600,
  MAD: 10.8,
  CAD: 1.47,
  CHF: 0.95,
  JPY: 170,
  CNY: 7.8,
  AUD: 1.65,
  INR: 90,
  BRL: 5.9,
  ZAR: 20,
  KES: 140,
  GHS: 13,
  SEK: 11.4,
  AED: 3.95,
};

const LIVE_RATES_URL = "https://open.er-api.com/v6/latest/EUR";
const HISTORY_RATES_URL = "https://api.frankfurter.dev/v2/rates";
const RATE_CACHE_MS = 5 * 60 * 1000;
let ratesCache: any = null;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${random.slice(0, 14)}`;
}

function makeReference(prefix: "DEP" | "WDR") {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}-${random.slice(0, 8).toUpperCase()}`;
}

function stableDirectNumber(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function parseBody(opts: RequestInit) {
  if (!opts.body || typeof opts.body !== "string") return {};
  try {
    return JSON.parse(opts.body);
  } catch {
    return {};
  }
}

function normalizeFavoritePairs(raw: any): [string, string][] {
  const value = Array.isArray(raw) && raw.length ? raw : DEFAULT_FAVORITE_PAIR_KEYS;
  return value
    .map((pair: any) => {
      if (Array.isArray(pair) && pair.length >= 2) return [String(pair[0]), String(pair[1])] as [string, string];
      if (typeof pair === "string" && pair.includes("_")) {
        const [from, to] = pair.split("_");
        return [from, to] as [string, string];
      }
      if (pair?.from && pair?.to) return [String(pair.from), String(pair.to)] as [string, string];
      return null;
    })
    .filter(Boolean) as [string, string][];
}

function firebaseAuthMessage(error: any) {
  const code = error?.code || "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Identifiants Firebase invalides: verifie l'email/mot de passe, ou cree le compte avant de te connecter.";
  }
  if (code === "auth/email-already-in-use") {
    return "Cet email existe deja dans Firebase. Connecte-toi avec le meme mot de passe.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Firebase Auth Email/Password n'est pas active. Active-le dans Firebase Console > Authentication > Sign-in method.";
  }
  if (code === "auth/weak-password") {
    return "Mot de passe trop faible: utilise au moins 6 caracteres.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Connexion Google annulee.";
  }
  return error?.message || "Erreur Firebase.";
}

function normalizeUser(data: any = {}): User {
  const email = String(data.email || "").toLowerCase();
  return {
    user_id: data.user_id,
    email: data.email,
    name: data.name || data.email,
    phone: data.phone || "",
    role: email === ADMIN_EMAIL ? "admin" : "user",
    balances: { ...INITIAL_BALANCES, ...(data.balances || {}) },
    is_blocked: Boolean(data.is_blocked),
    kyc_status: data.kyc_status || "pending",
    picture: data.picture || null,
    auth_provider: data.auth_provider || "firebase",
    favorite_pairs: normalizeFavoritePairs(data.favorite_pairs),
    bonus_country: data.bonus_country || "CI",
    kyc_level: data.kyc_level || (data.kyc_status === "verified" ? "standard" : "basic"),
    trust_score: Number(data.trust_score || 0),
    login_count: Number(data.login_count || 0),
  };
}

function requireAdminOwner(profile: User) {
  if (profile.role !== "admin" || String(profile.email || "").toLowerCase() !== ADMIN_EMAIL) {
    throw new Error("Admin requis.");
  }
}

async function waitForFirebaseUser(): Promise<FirebaseUser | null> {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

async function requireFirebaseUser() {
  const user = await waitForFirebaseUser();
  if (!user) throw new Error("Connecte-toi avec Firebase pour continuer.");
  return user;
}

async function ensureUserDoc(firebaseUser: FirebaseUser, extra: Partial<User> = {}) {
  const ref = doc(db, USERS, firebaseUser.uid);
  const snap = await getDoc(ref);
  const email = (firebaseUser.email || extra.email || "").toLowerCase();
  const role = email === ADMIN_EMAIL ? "admin" : "user";
  if (!snap.exists()) {
    const user = {
      user_id: firebaseUser.uid,
      email: firebaseUser.email || extra.email || "",
      email_lower: email,
      name: extra.name || firebaseUser.displayName || firebaseUser.email || "Utilisateur",
      phone: extra.phone || "",
      role,
      balances: INITIAL_BALANCES,
      is_blocked: false,
      kyc_status: "pending",
      picture: firebaseUser.photoURL || null,
      auth_provider: "firebase",
      favorite_pairs: DEFAULT_FAVORITE_PAIR_KEYS,
      bonus_country: "CI",
      trust_score: 24,
      login_count: 1,
      qr_code: `FXPRO:${firebaseUser.uid}:${makeId("QR").toUpperCase()}`,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await setDoc(ref, user);
    return normalizeUser(user);
  }

  const current = normalizeUser(snap.data());
  const patch: any = {};
  if (extra.name && extra.name !== current.name) patch.name = extra.name;
  if (extra.phone !== undefined && extra.phone !== current.phone) patch.phone = extra.phone;
  if (current.role !== role) patch.role = role;
  if (Object.keys(patch).length) {
    patch.updated_at = nowIso();
    await updateDoc(ref, patch);
    return { ...current, ...patch };
  }
  return current;
}

async function currentProfile() {
  const firebaseUser = await requireFirebaseUser();
  return ensureUserDoc(firebaseUser);
}

async function tokenAndUser(user: FirebaseUser, profile: User) {
  return { token: await user.getIdToken(), user: profile };
}

async function findUserByEmail(email: string) {
  const q = query(collection(db, USERS), where("email_lower", "==", email.toLowerCase()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const first = snap.docs[0];
  return { id: first.id, ...normalizeUser(first.data()) };
}

async function findUserByQr(code: string) {
  const q = query(collection(db, USERS), where("qr_code", "==", code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const first = snap.docs[0];
  return { id: first.id, ...normalizeUser(first.data()), qr_code: first.data().qr_code };
}

async function fetchJsonWithTimeout(url: string, initOrTimeout: RequestInit | number = {}, timeoutMs = 7000) {
  const init = typeof initOrTimeout === "number" ? {} : initOrTimeout;
  const timeout = typeof initOrTimeout === "number" ? initOrTimeout : timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getRates() {
  if (ratesCache?.fetched_at && Date.now() - ratesCache.fetched_at < RATE_CACHE_MS) return ratesCache.payload;
  try {
    const body = await fetchJsonWithTimeout(LIVE_RATES_URL);
    if (body?.result === "success" && body?.rates?.EUR) {
      const liveRates: Record<string, number> = { ...FALLBACK_RATES };
      for (const code of Object.keys(FALLBACK_RATES)) {
        if (typeof body.rates[code] === "number") liveRates[code] = Number(body.rates[code]);
      }
      liveRates.EUR = 1;
      const payload = {
        rates: liveRates,
        updated_at: body.time_last_update_utc || nowIso(),
        next_update_at: body.time_next_update_utc || null,
        source: "live",
        provider: body.provider || "ExchangeRate-API",
      };
      ratesCache = { fetched_at: Date.now(), payload };
      return payload;
    }
  } catch {}
  const payload = { rates: FALLBACK_RATES, updated_at: nowIso(), source: "fallback", provider: "FX Pro fallback" };
  ratesCache = { fetched_at: Date.now(), payload };
  return payload;
}

function fallbackHistoryForPair(pair: string, rate: number) {
  return Array.from({ length: 30 }, (_, i) => {
    return {
      t: new Date(Date.now() - (29 - i) * 86400000).toISOString(),
      v: Number(rate.toFixed(6)),
    };
  });
}

async function getRateHistory(pair: string, currentRate: number) {
  const [from, to] = pair.split("_");
  const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  try {
    const url = `${HISTORY_RATES_URL}?from=${start}&to=${end}&base=${from}&quotes=${to}`;
    const body = await fetchJsonWithTimeout(url, 4500);
    const rows: { t: string; v: number }[] = [];
    if (Array.isArray(body)) {
      body.forEach((item) => {
        if (item?.quote === to && item?.rate != null) rows.push({ t: item.date, v: Number(Number(item.rate).toFixed(6)) });
      });
    } else if (body?.rates && typeof body.rates === "object") {
      Object.entries(body.rates).forEach(([dateKey, value]: [string, any]) => {
        if (value?.[to] != null) rows.push({ t: dateKey, v: Number(Number(value[to]).toFixed(6)) });
      });
    }
    const points = rows.filter((row) => row.t && Number.isFinite(row.v)).sort((a, b) => a.t.localeCompare(b.t));
    if (points.length >= 2) return { points: points.slice(-31), source: "frankfurter" };
  } catch {}
  return { points: fallbackHistoryForPair(pair, currentRate), source: "latest-live" };
}

function sortByDateDesc(items: any[]) {
  return items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

function sortByDateAsc(items: any[]) {
  return items.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

function toIso(value: any) {
  if (!value) return nowIso();
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return nowIso();
}

function supportedBonusCountry(rawCountry?: string, rawCurrency?: string) {
  if (rawCountry && BONUS_COUNTRIES.some((item) => item.code === rawCountry)) return rawCountry;
  const byCurrency = BONUS_COUNTRIES.find((item) => item.currency === rawCurrency);
  return byCurrency?.code || "CI";
}

function buildBonusRiskFlags(userRaw: any, txns: any[]) {
  const flags: string[] = [];
  const pendingDeposits = txns.filter((t) => t.type === "deposit" && t.status === "pending").length;
  const refusedDeposits = txns.filter((t) => t.type === "deposit" && ["failed", "cancelled", "refused"].includes(t.status)).length;
  const microDeposits = txns.filter((t) => t.type === "deposit" && Number(t.amount) > 0 && Number(t.amount) < 1000).length;
  const withdrawals = txns.filter((t) => t.type === "withdraw").length;
  if (pendingDeposits >= 4) flags.push("pending_deposit_spam");
  if (refusedDeposits >= 2) flags.push("refused_deposit_pattern");
  if (microDeposits >= 3) flags.push("micro_deposit_testing");
  if (withdrawals >= 5 && txns.length < 12) flags.push("fast_withdrawal_pattern");
  if (userRaw?.kyc_status !== "verified") flags.push("kyc_not_verified");
  if (userRaw?.is_blocked) flags.push("blocked_account");
  return flags;
}

function bonusHistoryFromDoc(bonus: any) {
  if (!bonus?.first_deposit_locked) return [];
  const items = [
    {
      label: "Premier depot verrouille",
      status: "done",
      date: bonus.first_deposit_confirmed_at,
      body: `${bonus.first_deposit_amount} ${bonus.first_deposit_currency}`,
    },
  ];
  if (bonus.status === "analysis" || bonus.status === "approved" || bonus.status === "credited") {
    items.push({ label: "Analyse interne", status: bonus.status === "analysis" ? "active" : "done", date: bonus.review_at, body: bonus.reason });
  }
  if (bonus.status === "approved" || bonus.status === "credited") {
    items.push({ label: "Bonus approuve", status: bonus.status === "approved" ? "active" : "done", date: bonus.reviewed_at || bonus.review_at, body: `${bonus.bonus_amount || 0} ${bonus.currency}` });
  }
  if (bonus.status === "credited") {
    items.push({ label: "Bonus credite", status: "done", date: bonus.credited_at, body: `${bonus.bonus_amount || 0} ${bonus.currency}` });
  }
  if (bonus.status === "refused") {
    items.push({ label: "Bonus refuse", status: "blocked", date: bonus.reviewed_at || bonus.updated_at, body: bonus.reason });
  }
  return items;
}

async function getBonusTransactions(userId: string) {
  const snap = await getDocs(query(collection(db, TXNS), where("participants", "array-contains", userId)));
  return snap.docs.map((d) => ({ ...d.data(), txn_id: d.data().txn_id || d.id }));
}

function normalizeReceivedDeposit(txn: any, userId: string) {
  if (!txn || txn.status !== "completed") return null;
  if (txn.type === "deposit" && txn.user_id === userId) {
    return {
      ...txn,
      bonus_source: "deposit_confirmed",
      created_at: txn.confirmed_at || txn.created_at,
    };
  }
  if (txn.type === "transfer" && txn.receiver_id === userId) {
    return {
      ...txn,
      bonus_source: "transfer_received",
      user_id: userId,
      confirmed_at: txn.created_at,
    };
  }
  if (txn.type === "admin_credit" && txn.user_id === userId) {
    return {
      ...txn,
      bonus_source: "admin_credit_received",
      confirmed_at: txn.created_at,
    };
  }
  return null;
}

function chooseFirstReceivedDeposit(txns: any[], userId: string) {
  return sortByDateAsc(txns.map((txn) => normalizeReceivedDeposit(txn, userId)).filter(Boolean) as any[])[0];
}

function buildBonusEvaluation(userId: string, userRaw: any, txns: any[], deposit: any, countryCode?: string): BonusEvaluation {
  const completed = txns.filter((t) => ["completed", "credited"].includes(t.status));
  const volume = completed.reduce((sum, t) => sum + Math.abs(Number(t.amount || t.received || 0)), 0);
  const riskFlags = buildBonusRiskFlags(userRaw, txns);
  return createBonusEvaluation({
    userId,
    depositId: deposit.txn_id,
    amount: Number(deposit.amount || 0),
    currency: deposit.currency,
    countryCode: supportedBonusCountry(countryCode || userRaw?.bonus_country, deposit.currency),
    createdAt: toIso(deposit.confirmed_at || deposit.created_at),
    accountAgeDays: userRaw?.created_at ? Math.max(0, Math.floor((Date.now() - new Date(toIso(userRaw.created_at)).getTime()) / 86400000)) : 0,
    loginCount: Number(userRaw?.login_count || 1),
    transactionCount: txns.length,
    transactionVolume: volume,
    kycStatus: userRaw?.kyc_status,
    riskFlags,
  });
}

async function notifyBonusState(userId: string, bonus: BonusEvaluation | any) {
  const notifId = makeId("ntf");
  const eligible = bonus.eligible && bonus.status !== "refused";
  await setDoc(doc(db, NOTIFS, notifId), {
    notif_id: notifId,
    user_id: userId,
    type: "bonus",
    bonus_id: bonus.bonus_id,
    title: eligible ? "Bonus eligible" : "Bonus non eligible",
    body: eligible
      ? `Premier depot recu confirme. Bonus potentiel ${bonus.bonus_amount || 0} ${bonus.currency} en analyse pendant ${bonus.payout_window_days || 30} jours.`
      : bonus.reason || "Le premier depot recu confirme ne respecte pas les conditions.",
    read: false,
    created_at: nowIso(),
  });
}

async function lockBonusIfNeeded(userId: string, selectedCountry?: string) {
  const userRef = doc(db, USERS, userId);
  const bonusRef = doc(db, BONUS, userId);
  const userSnap = await getDoc(userRef);
  const userRaw = userSnap.data() || {};
  const txns = await getBonusTransactions(userId);
  const firstDeposit = chooseFirstReceivedDeposit(txns, userId);
  if (!firstDeposit) {
    const country = getBonusCountry(supportedBonusCountry(selectedCountry || userRaw.bonus_country));
    const existing = await getDoc(bonusRef);
    if (!existing.exists()) {
      await setDoc(bonusRef, {
        bonus_id: `bonus_${userId}`,
        user_id: userId,
        country: country.code,
        currency: country.currency,
        status: "pending",
        eligible: false,
        reason: "En attente du premier depot recu confirme.",
        first_deposit_locked: false,
        risk_flags: buildBonusRiskFlags(userRaw, txns),
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }
    return getDoc(bonusRef);
  }

  const evaluation = buildBonusEvaluation(userId, userRaw, txns, firstDeposit, selectedCountry);
  let created = false;
  await runTransaction(db, async (tx) => {
    const current = await tx.get(bonusRef);
    const data = current.data();
    if (data?.first_deposit_locked) return;
    const payload = { ...evaluation, created_at: data?.created_at || evaluation.created_at, updated_at: nowIso() };
    tx.set(bonusRef, payload, { merge: true });
    tx.set(doc(db, BONUS_EVENTS, makeId("bne")), {
      event_id: makeId("bne"),
      user_id: userId,
      bonus_id: evaluation.bonus_id,
      type: evaluation.eligible ? "first_received_deposit_eligible" : "first_received_deposit_refused",
      txn_id: firstDeposit.txn_id,
      created_at: nowIso(),
    });
    tx.set(doc(db, RISK_LOGS, makeId("rsk")), {
      user_id: userId,
      type: "bonus_first_received_deposit_scan",
      flags: evaluation.risk_flags,
      trust_score: evaluation.trust_score,
      created_at: nowIso(),
    });
    created = true;
  });
  if (created) await notifyBonusState(userId, evaluation);
  return getDoc(bonusRef);
}

async function advanceBonusIfNeeded(userId: string) {
  const bonusRef = doc(db, BONUS, userId);
  const snap = await getDoc(bonusRef);
  const bonus = snap.data();
  const status = nextBonusStatus(bonus);
  if (!bonus || !status || status === bonus.status) return snap;

  let creditNotification: any = null;
  await runTransaction(db, async (tx) => {
    const fresh = await tx.get(bonusRef);
    const current = fresh.data();
    const next = nextBonusStatus(current);
    if (!current || !next || next === current.status) return;
    const patch: any = { status: next, updated_at: nowIso() };
    if (next === "approved") patch.reviewed_at = nowIso();
    if (next === "refused") {
      patch.reviewed_at = nowIso();
      patch.reason = current.reason || "Bonus refuse apres analyse de securite.";
    }
    if (next === "credited" && !current.credited_at) {
      const userRef = doc(db, USERS, userId);
      const userSnap = await tx.get(userRef);
      const user = normalizeUser(userSnap.data());
      const balances = { ...user.balances };
      const amount = Number(current.bonus_amount || 0);
      const currency = current.currency;
      balances[currency] = Number(((balances[currency] || 0) + amount).toFixed(4));
      const txnId = makeId("txn");
      const notifId = makeId("ntf");
      patch.credited_at = nowIso();
      patch.bonus_txn_id = txnId;
      tx.update(userRef, { balances, updated_at: nowIso() });
      tx.set(doc(db, TXNS, txnId), {
        txn_id: txnId,
        type: "bonus_credit",
        user_id: userId,
        participants: [userId],
        amount,
        currency,
        status: "completed",
        bonus_id: current.bonus_id,
        reference: `BON-${txnId.slice(-8).toUpperCase()}`,
        created_at: nowIso(),
      });
      creditNotification = {
        notif_id: notifId,
        user_id: userId,
        type: "bonus",
        txn_id: txnId,
        bonus_id: current.bonus_id,
        title: "Bonus credite",
        body: `+${amount} ${currency} credites sur votre portefeuille FX Pro.`,
        read: false,
        created_at: nowIso(),
      };
      tx.set(doc(db, NOTIFS, notifId), creditNotification);
    }
    tx.update(bonusRef, patch);
  });
  if (!creditNotification && status === "refused") {
    const notifId = makeId("ntf");
    await setDoc(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: userId,
      type: "bonus",
      bonus_id: bonus.bonus_id,
      title: "Bonus refuse",
      body: bonus.reason || "Le compte ne respecte pas les conditions finales du programme bonus.",
      read: false,
      created_at: nowIso(),
    });
  }
  return getDoc(bonusRef);
}

async function uploadProfilePicture(userId: string, picture?: string | null) {
  if (!picture || !picture.startsWith("data:image/")) return picture;
  const mime = picture.slice(5, picture.indexOf(";")) || "image/jpeg";
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const avatarRef = storageRef(storage, `profile-pictures/${userId}/avatar.${ext}`);
  try {
    await uploadString(avatarRef, picture, "data_url", { contentType: mime });
    return getDownloadURL(avatarRef);
  } catch (error) {
    if (picture.length <= MAX_INLINE_PROFILE_PICTURE_CHARS) return picture;
    throw error;
  }
}

async function deleteProfilePicture(userId: string) {
  await Promise.all(
    ["jpg", "jpeg", "png", "webp"].map((ext) =>
      deleteObject(storageRef(storage, `profile-pictures/${userId}/avatar.${ext}`)).catch(() => undefined)
    )
  );
}

async function getShopProductOverrides() {
  try {
    const snap = await getDocs(collection(db, SHOP_PRODUCTS));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ShopProductOverride[];
  } catch {
    return [];
  }
}

function cleanSellerTags(values: any[] = []) {
  return Array.from(new Set(values.flat().map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 8);
}

async function getSellerCatalogProducts() {
  const snap = await getDocs(query(collection(db, SHOP_SELLER_ARTICLES), where("status", "==", "active")));
  return snap.docs
    .map((d) => d.data())
    .filter((item: any) => !item.deleted_at)
    .map((item: any) => ({
      id: item.article_id,
      title: item.title,
      brand: item.store_name || "Vendeur certifie",
      seller_store_name: item.store_name || "Vendeur certifie",
      description: item.description || "Article publie par un vendeur KYC certifie FX Pro.",
      category: item.category || "Vendeurs certifies",
      image: item.image,
      base_currency: "USD" as const,
      base_price: Number(item.base_price || item.price || 1),
      rating: Number((4.2 + stableDirectNumber(`${item.article_id}:rating`) * 0.7).toFixed(1)),
      stock: Math.max(0, Number(item.stock || 0)),
      tags: cleanSellerTags([item.tags, "vendeur certifie", "kyc"]),
      source: "seller" as any,
      sku: item.sku || `SELL-${String(item.article_id || "").slice(-8).toUpperCase()}`,
      ref: item.reference || `SELL-${String(item.article_id || "").slice(-8).toUpperCase()}`,
      seller_id: item.user_id,
      seller_verified: true,
      warranty: "Controle vendeur KYC FX Pro",
      shipping: "Livraison ou retrait coordonne par le vendeur certifie",
      availability: Number(item.stock || 0) > 0 ? "In Stock" : "Out of Stock",
      return_policy: "Retour selon profil vendeur et mediation FX Pro",
      minimum_order_quantity: 1,
      images: [item.image],
      review_count: 12 + Math.floor(stableDirectNumber(`${item.article_id}:reviews`) * 120),
    }));
}

async function announceShopIfNeeded(userId: string) {
  const userRef = doc(db, USERS, userId);
  const snap = await getDoc(userRef);
  await notifyWithdrawPausedOnce(userId, snap.data());
  await announceServicesAvailableOnce(userId, snap.data()).catch(() => undefined);
  const updateFlag = "shop_update_pickup_paused_2026_05_18_at";
  if (snap.data()?.[updateFlag]) return;
  const notifId = makeId("ntf");
  const createdAt = nowIso();
  await Promise.all([
    updateDoc(userRef, { shop_announced_at: snap.data()?.shop_announced_at || createdAt, [updateFlag]: createdAt, updated_at: createdAt }).catch(() => undefined),
    setDoc(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: userId,
      type: "shop_available",
      title: "Mise a jour Boutique FX Pro",
      body: `La boutique est disponible avec nouveaux articles, promos et paiement par solde. ${SHOP_PICKUP_MESSAGE}`,
      read: false,
      created_at: createdAt,
    }).catch(() => undefined),
  ]);
}

async function notifyWithdrawPausedOnce(userId: string, userData?: any) {
  const userRef = doc(db, USERS, userId);
  const data = userData || (await getDoc(userRef)).data();
  if (data?.[WITHDRAW_PAUSED_NOTICE_FLAG]) return false;
  const notifId = makeId("ntf");
  const createdAt = nowIso();
  await Promise.all([
    setDoc(userRef, { [WITHDRAW_PAUSED_NOTICE_FLAG]: createdAt, updated_at: createdAt }, { merge: true }),
    setDoc(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: userId,
      type: "withdraw_paused",
      title: WITHDRAW_PAUSED_NOTICE_TITLE,
      body: WITHDRAW_PAUSED_NOTICE_BODY,
      read: false,
      created_at: createdAt,
      url: "/notifications",
    }),
  ]);
  return true;
}

async function notifyServicesLimitedOnce(userId: string, userData?: any) {
  const userRef = doc(db, USERS, userId);
  const data = userData || (await getDoc(userRef)).data();
  if (data?.[SERVICES_LIMITED_NOTICE_FLAG]) return false;
  const notifId = makeId("ntf");
  const createdAt = nowIso();
  await Promise.all([
    setDoc(userRef, { [SERVICES_LIMITED_NOTICE_FLAG]: createdAt, updated_at: createdAt }, { merge: true }),
    setDoc(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: userId,
      type: "services_limited",
      title: SERVICES_LIMITED_NOTICE_TITLE,
      body: SERVICES_LIMITED_NOTICE_BODY,
      read: false,
      created_at: createdAt,
      url: "/notifications",
    }),
  ]);
  return true;
}

async function announceServicesAvailableOnce(userId: string, userData?: any) {
  const userRef = doc(db, USERS, userId);
  const data = userData || (await getDoc(userRef)).data();
  if (data?.[SERVICES_AVAILABLE_FLAG]) return false;
  const notifId = makeId("ntf");
  const createdAt = nowIso();
  await Promise.all([
    setDoc(userRef, { [SERVICES_AVAILABLE_FLAG]: createdAt, updated_at: createdAt }, { merge: true }),
    setDoc(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: userId,
      type: "services_available",
      title: SERVICES_AVAILABLE_TITLE,
      body: SERVICES_AVAILABLE_BODY,
      read: false,
      created_at: createdAt,
      url: "/notifications",
    }),
  ]);
  return true;
}

async function announceMaintenanceOnce(userId: string, userData?: any) {
  const userRef = doc(db, USERS, userId);
  const data = userData || (await getDoc(userRef)).data();
  if (data?.[MAINTENANCE_NOTICE_FLAG]) return false;
  const notifId = makeId("ntf");
  const createdAt = nowIso();
  await Promise.all([
    setDoc(userRef, { [MAINTENANCE_NOTICE_FLAG]: createdAt, updated_at: createdAt }, { merge: true }),
    setDoc(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: userId,
      type: "maintenance_update",
      title: MAINTENANCE_NOTICE_TITLE,
      body: MAINTENANCE_NOTICE_BODY,
      read: false,
      created_at: createdAt,
      url: "/notifications",
    }),
  ]);
  return true;
}

function gameTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function gameNoticeFlag(day = gameTodayKey()) {
  return `${GAME_TICKET_NOTICE_PREFIX}${day.replace(/-/g, "_")}`;
}

async function ensureGameTicketsDirect(userId: string) {
  const userRef = doc(db, USERS, userId);
  const day = gameTodayKey();
  const flag = gameNoticeFlag(day);
  let status: any = null;
  let rechargeNotif: any = null;
  let globalRechargeNotif: any = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const data = normalizeUser(snap.data());
    const raw = snap.data() || {};
    let tickets = Number(raw.game_tickets || 0);
    const patch: any = { game_ticket_day: day, updated_at: nowIso() };
    const needsRecharge = raw.game_ticket_day !== day;
    if (needsRecharge) {
      tickets = GAME_DAILY_TICKETS;
      patch.game_tickets = tickets;
    }
    if (!raw[GAME_GLOBAL_RECHARGE_FLAG]) {
      tickets = Math.max(tickets, GAME_DAILY_TICKETS);
      patch.game_tickets = tickets;
      patch[GAME_GLOBAL_RECHARGE_FLAG] = nowIso();
      globalRechargeNotif = {
        notif_id: makeId("ntf"),
        user_id: userId,
        type: "game_tickets",
        title: "Recharge globale tickets",
        body: `${GAME_DAILY_TICKETS} tickets bonus ont ete recharges pour tous les comptes actifs.`,
        read: false,
        created_at: nowIso(),
        url: "/games",
      };
    }
    if (needsRecharge && !raw[flag]) {
      const notifId = makeId("ntf");
      patch[flag] = nowIso();
      rechargeNotif = {
        notif_id: notifId,
        user_id: userId,
        type: "game_tickets",
        title: "Tickets jeux recharges",
        body: `${GAME_DAILY_TICKETS} tickets bonus sont disponibles pour les jeux du profil. Une seule recharge est notifiee par jour.`,
        read: false,
        created_at: nowIso(),
        url: "/games",
      };
      tx.set(doc(db, NOTIFS, notifId), rechargeNotif);
    } else if (globalRechargeNotif) {
      tx.set(doc(db, NOTIFS, globalRechargeNotif.notif_id), globalRechargeNotif);
    }
    tx.set(userRef, patch, { merge: true });
    status = {
      tickets,
      daily_tickets: GAME_DAILY_TICKETS,
      day,
      notice_sent: Boolean(raw[flag] || patch[flag]),
      stats: raw.game_stats || {},
      balances: data.balances,
      currency: "XOF",
      games: Object.entries(GAME_CONFIG).map(([id, cfg]) => ({ id, ...cfg })),
      heroes: SUPERHERO_ROSTER,
    };
  });
  return { ...status, recharged_notification: rechargeNotif || globalRechargeNotif };
}

function heroPowerScore(hero: any, mode = "hero_duel") {
  const stats = hero?.stats || {};
  const weights =
    mode === "speed_run"
      ? { speed: 2, combat: 1.3, power: 1, durability: 0.8, strength: 0.6, intelligence: 0.8 }
      : mode === "power_match"
        ? { power: 1.8, strength: 1.5, durability: 1.2, combat: 1, speed: 0.8, intelligence: 0.9 }
        : { combat: 1.5, intelligence: 1.25, power: 1.2, durability: 1, strength: 0.9, speed: 0.8 };
  return Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + Number(stats[key] || 0) * Number(weight), 0));
}

function heroRound(userId: string, gameId: string, eventId: string, roll: number) {
  const firstIndex = Math.floor(stableDirectNumber(`${userId}:${gameId}:${eventId}:a`) * SUPERHERO_ROSTER.length) % SUPERHERO_ROSTER.length;
  let secondIndex = Math.floor(stableDirectNumber(`${userId}:${gameId}:${eventId}:b`) * SUPERHERO_ROSTER.length) % SUPERHERO_ROSTER.length;
  if (firstIndex === secondIndex) secondIndex = (secondIndex + 7) % SUPERHERO_ROSTER.length;
  const player = SUPERHERO_ROSTER[firstIndex];
  const rival = SUPERHERO_ROSTER[secondIndex];
  const player_score = heroPowerScore(player, gameId) + Math.floor(stableDirectNumber(`${eventId}:boost-a`) * 60);
  const rival_score = heroPowerScore(rival, gameId) + Math.floor(stableDirectNumber(`${eventId}:boost-b`) * 60);
  return { player, rival, player_score, rival_score, margin: player_score - rival_score, rule: "ticket_required", seed_hint: `${eventId.slice(-10)}${Math.round(roll * 1000)}` };
}

async function playGameDirect(userId: string, gameId: string) {
  const config = GAME_CONFIG[gameId];
  if (!config) throw new Error("Jeu indisponible.");
  await ensureGameTicketsDirect(userId);
  const userRef = doc(db, USERS, userId);
  const eventId = makeId("game");
  const roll = Math.random();
  const details = config.mode === "hero" ? heroRound(userId, gameId, eventId, roll) : null;
  const adjustedChance = Math.max(0.08, Math.min(0.72, config.win_chance + (details ? Math.max(-180, Math.min(180, details.margin)) / 1600 : 0)));
  const won = roll < adjustedChance;
  const spread = config.max_prize - config.min_prize;
  const prize = won ? Math.round((config.min_prize + stableDirectNumber(`${userId}:${gameId}:${eventId}`) * Math.max(1, spread)) / 10) * 10 : 0;
  const txnId = won ? makeId("txn") : null;
  const notifId = won ? makeId("ntf") : null;
  let result: any = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const raw = snap.data() || {};
    const normalized = normalizeUser(raw);
    const tickets = Number(raw.game_tickets || 0);
    if (tickets <= 0) throw new Error("Plus de tickets disponibles. Les tickets seront recharges automatiquement.");
    const balances = { ...normalized.balances };
    if (won) balances.XOF = Number((Number(balances.XOF || 0) + prize).toFixed(4));
    const gameStats = { ...(raw.game_stats || {}) };
    const stats = { ...(gameStats[gameId] || {}) };
    stats.plays = Number(stats.plays || 0) + 1;
    if (won) {
      stats.wins = Number(stats.wins || 0) + 1;
      stats.prizes = Number(stats.prizes || 0) + prize;
    }
    gameStats[gameId] = stats;
    tx.update(userRef, { balances, game_tickets: tickets - 1, game_stats: gameStats, last_game_play_at: nowIso(), updated_at: nowIso() });
    const event = {
      event_id: eventId,
      user_id: userId,
      game_id: gameId,
      game_name: config.name,
      won,
      prize,
      currency: "XOF",
      txn_id: txnId,
      created_at: nowIso(),
      ...(details ? { details } : {}),
    };
    tx.set(doc(db, GAME_EVENTS, eventId), event);
    let transaction: any = null;
    if (won && txnId && notifId) {
      transaction = {
        txn_id: txnId,
        type: "game_win",
        user_id: userId,
        participants: [userId],
        amount: prize,
        currency: "XOF",
        status: "completed",
        reference: `GAME-${eventId.slice(-8).toUpperCase()}`,
        game_id: gameId,
        created_at: nowIso(),
      };
      tx.set(doc(db, TXNS, txnId), transaction);
      tx.set(doc(db, NOTIFS, notifId), {
        notif_id: notifId,
        user_id: userId,
        type: "game_win",
        txn_id: txnId,
        title: "Gain jeu credite",
        body: `+${prize} XOF credites depuis ${config.name}. Reference ${transaction.reference}.`,
        read: false,
        created_at: nowIso(),
        url: `/receipt/${txnId}`,
      });
    }
    result = { event, transaction, balances, tickets: tickets - 1 };
  });
  return {
    ok: true,
    result: won ? "win" : "loss",
    won,
    prize,
    currency: "XOF",
    tickets: result?.tickets ?? 0,
    balances: result?.balances || {},
    event: result?.event,
    transaction: result?.transaction,
  };
}

async function logShopRisk(userId: string, reason: string, payload: any = {}) {
  const eventId = makeId("risk");
  await setDoc(doc(db, RISK_LOGS, eventId), {
    event_id: eventId,
    user_id: userId,
    type: "shop_checkout",
    reason,
    payload,
    created_at: nowIso(),
  }).catch(() => undefined);
}

async function getShopCatalog(currency?: string, queryText?: string, userId?: string) {
  const ratesPayload = await getRates();
  const [remoteProducts, dummyProducts, freeProducts, fakeStoreProducts, escuelajsProducts, sellerProducts, overrides] = await Promise.all([
    fetchApilayerShopProducts(APILAYER_SHOP_KEY, queryText || "market"),
    fetchDummyJsonShopProducts(150),
    fetchFreeEcommerceShopProducts(),
    fetchFakeStoreShopProducts(),
    fetchEscuelajsShopProducts(),
    getSellerCatalogProducts(),
    getShopProductOverrides(),
  ]);
  if (userId) await announceShopIfNeeded(userId);
  return buildShopCatalogPayload({
    remoteProducts: [...sellerProducts, ...remoteProducts],
    dummyProducts,
    freeProducts,
    fakeStoreProducts,
    escuelajsProducts,
    overrides,
    currency: normalizeShopCurrency(currency),
    rates: ratesPayload.rates || FALLBACK_RATES,
  });
}

async function getUserShopOrders(userId: string) {
  const snap = await getDocs(query(collection(db, SHOP_ORDERS), where("user_id", "==", userId)));
  return { items: sortByDateDesc(snap.docs.map((d) => d.data())) };
}

function sellerProfilePayload(raw: any = {}, user: any = {}) {
  const verified = user.kyc_status === "verified";
  return {
    seller_id: raw?.seller_id || `seller_${user.user_id}`,
    user_id: user.user_id,
    store_name: raw?.store_name || `Boutique de ${user.name || "vendeur"}`,
    bio: raw?.bio || "Vendeur FX Pro avec articles suivis et profil controle.",
    city: raw?.city || "",
    support_phone: raw?.support_phone || user.phone || "",
    pickup_zone: raw?.pickup_zone || "Coordination apres commande",
    status: verified ? "active" : "kyc_required",
    kyc_required: !verified,
    kyc_status: user.kyc_status || "pending",
    benefits: [
      "Badge vendeur certifie KYC",
      "Gestion creer / modifier / supprimer",
      "Suivi commandes, recus et notifications vendeur",
      "Mise en avant dans le catalogue et les promotions",
      "Mediation client et historique vendeur",
      "Statut boutique avec ville, support et zone de livraison",
      "Commandes vendeur visibles depuis le profil",
    ],
    created_at: raw?.created_at,
    updated_at: raw?.updated_at || nowIso(),
  };
}

async function getSellerOrdersForUser(userId: string) {
  const snap = await getDocs(query(collection(db, SHOP_SELLER_ORDERS), where("seller_id", "==", userId)));
  return sortByDateDesc(snap.docs.map((d) => d.data()));
}

function cleanSellerArticleDirect(body: any, user: any, seller: any, articleId: string): any {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const image = String(body.image || "").trim();
  const price = Number(body.price);
  const stock = Math.max(0, Math.min(999, Math.floor(Number(body.stock || 0))));
  if (title.length < 3) throw new Error("Nom d'article trop court.");
  if (description.length < 12) throw new Error("Description trop courte.");
  if (!/^https?:\/\//i.test(image)) throw new Error("Image produit HTTP/HTTPS requise.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Prix invalide.");
  return {
    article_id: articleId,
    user_id: user.user_id,
    seller_id: seller.seller_id,
    store_name: seller.store_name,
    title: title.slice(0, 120),
    description: description.slice(0, 500),
    category: String(body.category || "Vendeur certifie").trim().slice(0, 80),
    image,
    base_price: Number(price.toFixed(2)),
    price: Number(price.toFixed(2)),
    stock,
    tags: cleanSellerTags([Array.isArray(body.tags) ? body.tags : String(body.tags || "").split(","), "vendeur certifie", "kyc"]),
    status: "active",
    sku: `SELL-${articleId.slice(-8).toUpperCase()}`,
    reference: `SELL-${articleId.slice(-8).toUpperCase()}`,
    updated_at: nowIso(),
  };
}

function tmdbImage(path?: string, size = "w500") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "";
}

function normalizeTmdbItem(raw: any, mediaType?: string) {
  const kind = mediaType || raw?.media_type || (raw?.name ? "tv" : "movie");
  if (!["movie", "tv"].includes(kind)) return null;
  const title = raw?.title || raw?.name || raw?.original_title || raw?.original_name;
  if (!title) return null;
  return {
    id: Number(raw.id),
    media_type: kind,
    title,
    overview: raw?.overview || "Synopsis indisponible pour le moment.",
    poster_url: tmdbImage(raw?.poster_path, "w500"),
    backdrop_url: tmdbImage(raw?.backdrop_path, "w780"),
    vote_average: Number(Number(raw?.vote_average || 0).toFixed(1)),
    vote_count: Number(raw?.vote_count || 0),
    release_date: raw?.release_date || raw?.first_air_date || "",
    popularity: Number(raw?.popularity || 0),
    genre_ids: Array.isArray(raw?.genre_ids) ? raw.genre_ids.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value)) : [],
    source: "tmdb",
  };
}

function normalizeTmdbDetail(raw: any, mediaType: string) {
  const base = normalizeTmdbItem(raw, mediaType) || {
    id: Number(raw?.id || 0),
    media_type: mediaType,
    title: raw?.title || raw?.name || "Titre indisponible",
    overview: raw?.overview || "Synopsis indisponible pour le moment.",
    poster_url: tmdbImage(raw?.poster_path, "w500"),
    backdrop_url: tmdbImage(raw?.backdrop_path, "w1280"),
    release_date: raw?.release_date || raw?.first_air_date || "",
    source: "tmdb",
  };
  const runtime = mediaType === "tv" ? Number((raw?.episode_run_time || [])[0] || 0) : Number(raw?.runtime || 0);
  return {
    ...base,
    runtime: runtime || null,
    duration_label: runtime ? `${runtime} min` : "",
    tagline: raw?.tagline || "",
    status: raw?.status || "",
    genres: Array.isArray(raw?.genres) ? raw.genres.map((item: any) => item?.name).filter(Boolean) : [],
    number_of_seasons: mediaType === "tv" ? raw?.number_of_seasons || null : null,
    number_of_episodes: mediaType === "tv" ? raw?.number_of_episodes || null : null,
    homepage: raw?.homepage || "",
  };
}

async function tmdbFetchDirect(path: string, params: Record<string, any> = {}) {
  if (!TMDB_READ_TOKEN && !TMDB_API_KEY) throw new Error("TMDB credentials missing");
  const qs = new URLSearchParams({ ...params, ...(TMDB_READ_TOKEN ? {} : { api_key: TMDB_API_KEY }) }).toString();
  return fetchJsonWithTimeout(`https://api.themoviedb.org/3${path}?${qs}`, {
    headers: TMDB_READ_TOKEN ? { Authorization: `Bearer ${TMDB_READ_TOKEN}`, Accept: "application/json" } : { Accept: "application/json" },
  }, 12000);
}

async function getMovieLibraryDirect(userId: string) {
  const snap = await getDocs(query(collection(db, MOVIE_LIBRARY), where("user_id", "==", userId)));
  return sortByDateDesc(snap.docs.map((d) => d.data()));
}

function movieGroupPayload() {
  return Object.entries(MOVIE_GENRE_GROUPS).map(([id, value]) => ({ id, label: value.label }));
}

function movieGroupIds(group: string, mediaType: "movie" | "tv") {
  return MOVIE_GENRE_GROUPS[group]?.[mediaType] || MOVIE_GENRE_GROUPS.all[mediaType] || [];
}

function movieSortValue(sort: string, mediaType: "movie" | "tv") {
  if (sort === "recent" && mediaType === "tv") return "first_air_date.desc";
  return MOVIE_SORT_OPTIONS[sort] || MOVIE_SORT_OPTIONS.popular;
}

function tmdbProviderNames(providerBlock: any = {}) {
  const names = new Set<string>();
  ["flatrate", "ads", "free", "rent", "buy"].forEach((bucket) => {
    (providerBlock?.[bucket] || []).forEach((provider: any) => {
      const name = String(provider?.provider_name || "").trim();
      if (name) names.add(name);
    });
  });
  return Array.from(names).slice(0, 8);
}

function streamingProfileForTitle(mediaType: string, tmdbId: number, details: any = {}, trailerUrl = "") {
  const title = cleanSteamText(details?.title || "FX Pro Stream");
  const poster = details?.backdrop_url || details?.poster_url || "";
  const subtitleFr = `WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n${title} - lecture FX Pro sans publicite.\n\n00:00:04.000 --> 00:00:08.000\nSelectionne VF, VO ou les sous-titres depuis les options du lecteur.\n`;
  const subtitleEn = `WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n${title} - ad-free FX Pro playback.\n\n00:00:04.000 --> 00:00:08.000\nChoose audio language and captions from the player controls.\n`;
  const subtitleFrUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(subtitleFr)}`;
  const subtitleEnUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(subtitleEn)}`;
  const mp4Sources = [
    { quality: "480p", label: "VF 480p mobile", audio_id: "vf", url: STREAM_DEMO_MP4_480, mime: "video/mp4", size_label: "~8 MB" },
    { quality: "720p", label: "VF 720p HD", audio_id: "vf", url: STREAM_DEMO_MP4_720, mime: "video/mp4", size_label: "~30 MB" },
    { quality: "1080p", label: "VF 1080p Full HD", audio_id: "vf", url: STREAM_DEMO_MP4_1080, mime: "video/mp4", size_label: "~45 MB" },
    { quality: "480p", label: "VO 480p mobile", audio_id: "vo", url: STREAM_DEMO_MP4_480, mime: "video/mp4", size_label: "~8 MB" },
    { quality: "720p", label: "VO 720p HD", audio_id: "vo", url: STREAM_DEMO_MP4_1080, mime: "video/mp4", size_label: "~45 MB" },
    { quality: "1080p", label: "VO 1080p Full HD", audio_id: "vo", url: STREAM_DEMO_MP4_720, mime: "video/mp4", size_label: "~30 MB" },
  ];
  return {
    players: [
      { id: "videojs", name: "Video.js HLS", description: "Vrai lecteur Video.js avec HLS et fallback MP4." },
      { id: "plyr", name: "Plyr HLS", description: "Vrai lecteur Plyr avec hls.js." },
      { id: "dash", name: "DASH.js", description: "Lecteur MPEG-DASH pour sources adaptatives." },
      { id: "native", name: "HTML5 natif", description: "Fallback HTML5 direct, rapide et sans publicite." },
      { id: "iframe", name: "Iframe securise", description: "Lecteur isole sans publicite via source configuree." },
    ],
    streams: {
      primary_url: STREAM_DEMO_MP4_720,
      hls_url: STREAM_DEMO_HLS,
      dash_url: STREAM_DEMO_DASH,
      iframe_url: trailerUrl,
      mp4_sources: mp4Sources,
      download_sources: mp4Sources,
      poster,
      ad_free: true,
      download_available: true,
      source_note: "Lecteurs reels branches sur Video.js, Plyr, DASH.js et HTML5 sans publicite. Les sources demo sont autorisees; remplace les URLs par tes fichiers licencies pour diffuser chaque titre.",
    },
    audio_tracks: [
      { id: "vf", label: "Francais (VF)", language: "fr", default: true },
      { id: "vo", label: "Anglais (VO)", language: "en", default: false },
    ],
    subtitle_tracks: [
      { id: "fr", label: "Sous-titres FR", language: "fr", url: subtitleFrUrl, default: true },
      { id: "en", label: "English subtitles", language: "en", url: subtitleEnUrl, default: false },
    ],
  };
}

function normalizeTmdbSeasons(detailPayload: any = {}) {
  return (Array.isArray(detailPayload?.seasons) ? detailPayload.seasons : [])
    .map((raw: any) => {
      const seasonNumber = Number(raw?.season_number || 0);
      if (seasonNumber <= 0) return null;
      return {
        season_number: seasonNumber,
        name: cleanSteamText(raw?.name || `Saison ${seasonNumber}`),
        episode_count: Number(raw?.episode_count || 0),
        poster_url: tmdbImage(raw?.poster_path, "w342"),
        overview: cleanSteamText(raw?.overview || ""),
        air_date: raw?.air_date || "",
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function fallbackEpisodeList(seasonNumber: number, count = 8) {
  const safeCount = Math.max(1, Math.min(24, Number(count || 8)));
  return Array.from({ length: safeCount }, (_, index) => ({
    season_number: seasonNumber,
    episode_number: index + 1,
    title: `Episode ${index + 1}`,
    overview: "Episode pret pour lecteur VF/VO sans publicite.",
    runtime: 42,
    still_url: "",
    air_date: "",
  }));
}

async function buildTvEpisodeListDirect(tmdbId: number, detailPayload: any = {}, seasonNumber = 1) {
  const seasons = normalizeTmdbSeasons(detailPayload);
  const selected = seasons.find((season: any) => season.season_number === seasonNumber) || seasons[0];
  if (!selected) return [];
  const safeSeason = Number(selected.season_number || 1);
  try {
    const payload = await tmdbFetchDirect(`/tv/${tmdbId}/season/${safeSeason}`, { language: "fr-FR" });
    const episodes = (payload?.episodes || [])
      .map((raw: any) => ({
        season_number: safeSeason,
        episode_number: Number(raw?.episode_number || 0),
        title: cleanSteamText(raw?.name || `Episode ${raw?.episode_number || ""}`),
        overview: cleanSteamText(raw?.overview || ""),
        runtime: Number(raw?.runtime || 0),
        still_url: tmdbImage(raw?.still_path, "w500"),
        air_date: raw?.air_date || "",
      }))
      .filter((episode: any) => episode.episode_number > 0);
    return episodes.length ? episodes.slice(0, 30) : fallbackEpisodeList(safeSeason, selected.episode_count || 8);
  } catch {
    return fallbackEpisodeList(safeSeason, selected.episode_count || 8);
  }
}

async function buildMovieWatchOptionsDirect(mediaType: string, tmdbId: number) {
  const [watchPayload, frVideosPayload, defaultVideosPayload, detailPayload] = await Promise.all([
    tmdbFetchDirect(`/${mediaType}/${tmdbId}/watch/providers`),
    tmdbFetchDirect(`/${mediaType}/${tmdbId}/videos`, { language: "fr-FR" }),
    tmdbFetchDirect(`/${mediaType}/${tmdbId}/videos`),
    tmdbFetchDirect(`/${mediaType}/${tmdbId}`, { language: "fr-FR" }),
  ]);
  const results = watchPayload?.results || {};
  const region = ["FR", "CA", "BE", "CH", "US", "GB"].find((code) => results?.[code]) || "";
  const providerBlock = results?.[region] || {};
  const allVideos = [...(frVideosPayload?.results || []), ...(defaultVideosPayload?.results || [])];
  const bestVideo = allVideos.find((video: any) => String(video?.site || "").toLowerCase() === "youtube" && ["trailer", "teaser", "featurette", "clip"].includes(String(video?.type || "").toLowerCase())) || null;
  const trailerUrl = bestVideo?.key ? `https://www.youtube.com/watch?v=${bestVideo.key}` : "";
  const supportsVf = ["FR", "CA", "BE", "CH"].includes(region) || String(bestVideo?.iso_639_1 || "").toLowerCase() === "fr";
  const details = normalizeTmdbDetail(detailPayload, mediaType);
  const seasons = mediaType === "tv" ? normalizeTmdbSeasons(detailPayload) : [];
  const episodes = mediaType === "tv" ? await buildTvEpisodeListDirect(tmdbId, detailPayload, seasons[0]?.season_number || 1) : [];
  return {
    tmdb_id: tmdbId,
    media_type: mediaType,
    details,
    seasons,
    episodes,
    watch_url: providerBlock?.link || trailerUrl,
    trailer_url: trailerUrl,
    player: {
      provider: bestVideo?.key ? "youtube" : "official",
      embed_url: bestVideo?.key ? `https://www.youtube.com/embed/${bestVideo.key}` : "",
      video_key: bestVideo?.key || "",
      supports_vf: supportsVf,
      supports_vostfr: Boolean(bestVideo?.key),
    },
    ...streamingProfileForTitle(mediaType, tmdbId, details, trailerUrl),
    provider_region: region,
    provider_names: tmdbProviderNames(providerBlock),
    has_vf: supportsVf,
  };
}

async function buildMoviesCatalogDirect(userId = "", kind = "all", text = "", page = 1, genre = "all", sort = "popular", pageSize = MOVIE_PAGE_SIZE_DEFAULT) {
  try {
    const language = "fr-FR";
    const safePage = Math.max(1, Math.min(80, Number(page || 1)));
    const safePageSize = Math.max(12, Math.min(48, Number(pageSize || MOVIE_PAGE_SIZE_DEFAULT)));
    const safeGenre = MOVIE_GENRE_GROUPS[genre] ? genre : "all";
    const safeSort = MOVIE_SORT_OPTIONS[sort] ? sort : "popular";
    if (userId) await announceServicesAvailableOnce(userId).catch(() => undefined);
    let items: any[] = [];
    let totalResults = 0;
    let totalPages = 0;
    if (text.trim()) {
      const payload = await tmdbFetchDirect("/search/multi", { query: text.trim(), page: safePage, language, include_adult: "false" });
      items = (payload.results || []).map((raw: any) => normalizeTmdbItem(raw)).filter(Boolean);
      totalResults = Number(payload.total_results || items.length);
      totalPages = Number(payload.total_pages || safePage);
    } else {
      const endpoints: [string, string, Record<string, any>][] = [];
      if (kind === "all" || kind === "movie") {
        const params: Record<string, any> = { page: safePage, language, sort_by: movieSortValue(safeSort, "movie"), include_adult: "false", "vote_count.gte": 20 };
        const genres = movieGroupIds(safeGenre, "movie");
        if (genres.length) params.with_genres = genres.join(",");
        endpoints.push(["/discover/movie", "movie", params]);
      }
      if (kind === "all" || kind === "tv") {
        const params: Record<string, any> = { page: safePage, language, sort_by: movieSortValue(safeSort, "tv"), include_adult: "false", "vote_count.gte": 20 };
        const genres = movieGroupIds(safeGenre, "tv");
        if (genres.length) params.with_genres = genres.join(",");
        endpoints.push(["/discover/tv", "tv", params]);
      }
      const responses = await Promise.all(endpoints.map(([path, , params]) => tmdbFetchDirect(path, params)));
      responses.forEach((payload, index) => {
        const mediaType = endpoints[index][1];
        totalResults += Number(payload?.total_results || 0);
        totalPages = Math.max(totalPages, Number(payload?.total_pages || 0));
        items.push(...(payload.results || []).map((raw: any) => normalizeTmdbItem(raw, mediaType)).filter(Boolean));
      });
    }
    const seen = new Set();
    const unique = items
      .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0))
      .filter((item) => {
        const key = `${item.media_type}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const library = userId ? await getMovieLibraryDirect(userId) : [];
    const marks = new Map(library.map((item: any) => [`${item.media_type}:${item.tmdb_id}`, item]));
    unique.forEach((item) => {
      const mark: any = marks.get(`${item.media_type}:${item.id}`);
      item.favorite = Boolean(mark?.favorite);
      item.watchlist = Boolean(mark?.watchlist);
      item.watched = Boolean(mark?.watched);
    });
    return {
      items: unique.slice(0, safePageSize),
      source: "tmdb",
      page: safePage,
      page_size: safePageSize,
      has_more: safePage < Math.max(1, totalPages),
      total_results: Math.max(unique.length, totalResults),
      kind,
      query: text,
      genre: safeGenre,
      sort: safeSort,
      groups: movieGroupPayload(),
      attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    };
  } catch {
    if (userId) await notifyServicesLimitedOnce(userId).catch(() => undefined);
    return {
      items: MOVIE_FALLBACK_ITEMS,
      source: "fallback",
      page,
      page_size: pageSize,
      has_more: false,
      total_results: MOVIE_FALLBACK_ITEMS.length,
      kind,
      query: text,
      genre,
      sort,
      groups: movieGroupPayload(),
      attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    };
  }
}

function normalizeFreeGameItem(raw: any) {
  const title = String(raw?.title || "").trim();
  if (!title) return null;
  return {
    id: Number(raw?.id || 0),
    title,
    thumbnail: String(raw?.thumbnail || "").trim(),
    short_description: String(raw?.short_description || "").trim() || "Description indisponible pour le moment.",
    game_url: String(raw?.game_url || raw?.freetogame_profile_url || "").trim(),
    genre: String(raw?.genre || "Autre").trim() || "Autre",
    platform: String(raw?.platform || "PC (Windows)").trim() || "PC (Windows)",
    publisher: String(raw?.publisher || "FreeToGame").trim() || "FreeToGame",
    developer: String(raw?.developer || "FreeToGame").trim() || "FreeToGame",
    release_date: String(raw?.release_date || "").trim(),
    freetogame_profile_url: String(raw?.freetogame_profile_url || raw?.game_url || "").trim(),
  };
}

async function buildFreeGamesCatalogDirect(userId = "", text = "", genre = "all", platform = "all", page = 1, limitCount = 18) {
  if (userId) await announceServicesAvailableOnce(userId).catch(() => undefined);
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.max(9, Math.min(36, Number(limitCount || 18)));
  let rawItems: any[] = [];
  let source = "freetogame";
  try {
    rawItems = await fetchJsonWithTimeout("https://www.freetogame.com/api/games", {}, 12000);
  } catch {
    rawItems = FREE_GAME_FALLBACK_ITEMS;
    source = "snapshot";
  }
  const items = rawItems.map((raw) => normalizeFreeGameItem(raw)).filter(Boolean);
  const genres = Array.from(new Set(items.map((item: any) => item.genre).filter(Boolean))).sort();
  const platforms = Array.from(new Set(items.map((item: any) => item.platform).filter(Boolean))).sort();
  const q = String(text || "").trim().toLowerCase();
  const g = String(genre || "all").trim().toLowerCase();
  const p = String(platform || "all").trim().toLowerCase();
  const filtered = items.filter((item: any) => {
    if (q && !`${item.title} ${item.genre} ${item.platform} ${item.publisher} ${item.developer} ${item.short_description}`.toLowerCase().includes(q)) return false;
    if (g !== "all" && String(item.genre || "").toLowerCase() !== g) return false;
    if (p !== "all" && !String(item.platform || "").toLowerCase().includes(p)) return false;
    return true;
  });
  filtered.sort((a: any, b: any) => String(a.genre || "").localeCompare(String(b.genre || "")) || String(a.title || "").localeCompare(String(b.title || "")));
  const start = (safePage - 1) * safeLimit;
  const end = start + safeLimit;
  return {
    items: filtered.slice(start, end),
    genres,
    platforms,
    page: safePage,
    limit: safeLimit,
    total_results: filtered.length,
    has_more: end < filtered.length,
    source,
  };
}

function cleanSteamText(value: any) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function steamFeaturedIndex() {
  return STEAM_FEATURED_APPS.map((item) => ({ appid: Number(item.appid), name: String(item.name) }));
}

async function fetchSteamAppIndexDirect() {
  const now = Date.now();
  if (steamAppListCache.items.length && steamAppListCache.expiresAt > now) return steamAppListCache;
  try {
    const payload = await fetchJsonWithTimeout(`${STEAM_APPLIST_URL}?format=json`, {}, 12000);
    const apps = (payload?.applist?.apps || [])
      .map((raw: any) => ({ appid: Number(raw?.appid || 0), name: cleanSteamText(raw?.name) }))
      .filter((item: any) => item.appid > 0 && item.name.length > 1);
    if (apps.length < 100) throw new Error("Steam app list too small");
    const featured = steamFeaturedIndex();
    const featuredIds = new Set(featured.map((item) => item.appid));
    steamAppListCache = { items: [...featured, ...apps.filter((item: any) => !featuredIds.has(item.appid))], expiresAt: now + STEAM_CACHE_TTL_MS, source: "steam" };
    return steamAppListCache;
  } catch {
    steamAppListCache = { items: steamFeaturedIndex(), expiresAt: now + 30 * 60 * 1000, source: "featured_fallback" };
    return steamAppListCache;
  }
}

function steamFallbackImage(appid: number, kind = "header") {
  const file = kind === "capsule" ? "capsule_616x353.jpg" : "header.jpg";
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/${file}`;
}

function steamReferencePrice(appid: number, title: string) {
  const label = `${appid} ${title}`.toLowerCase();
  if (/free|demo|prologue/.test(label)) return 0;
  let base = 39.99;
  if (/forza|god of war|call of duty|grand theft auto|elden ring|fc |fifa/.test(label)) base = 59.99;
  else if (/deluxe|ultimate|premium/.test(label)) base = 79.99;
  else if (/indie|simulator|manager|strategy/.test(label)) base = 24.99;
  return roundShopMoney(base + stableDirectNumber(`steam_ref:${appid}:${title}`) * 8, "EUR");
}

function applyFxSteamOffer(game: any) {
  const copy = { ...game };
  let basePrice = copy.price;
  let currency = normalizeShopCurrency(copy.price_currency || "EUR");
  if (copy.is_free) {
    return { ...copy, fx_discount_percent: 0, fx_price: 0, fx_currency: currency, fx_price_label: "Gratuit", fx_price_source: "free" };
  }
  let priceSource = "steam";
  if (basePrice === null || basePrice === undefined) {
    basePrice = steamReferencePrice(Number(copy.appid || 0), String(copy.title || ""));
    currency = "EUR";
    copy.price = basePrice;
    copy.price_currency = currency;
    copy.price_label = `Prix reference FX ${basePrice} ${currency}`;
    priceSource = "fx_reference";
  }
  const internalDiscount = 12 + Math.floor(stableDirectNumber(`steam_fx_discount:${copy.appid}`) * 18);
  const steamDiscount = Number(copy.discount_percent || 0);
  const fxDiscount = Math.min(70, Math.max(internalDiscount, steamDiscount ? steamDiscount + 5 : internalDiscount));
  const fxPrice = roundShopMoney(Number(basePrice || 0) * (1 - fxDiscount / 100), currency);
  return { ...copy, fx_discount_percent: fxDiscount, fx_price: fxPrice, fx_currency: currency, fx_price_label: `${fxPrice} ${currency}`, fx_price_source: priceSource };
}

function normalizeSteamGameDirect(appid: number, fallbackName = "", detail: any = null) {
  const price = detail?.price_overview || {};
  const currency = normalizeShopCurrency(price?.currency || "EUR");
  const finalAmount = typeof price?.final === "number" ? roundShopMoney(price.final / 100, currency) : null;
  const initialAmount = typeof price?.initial === "number" ? roundShopMoney(price.initial / 100, currency) : null;
  const isFree = Boolean(detail?.is_free) || finalAmount === 0;
  const title = cleanSteamText(detail?.name || fallbackName || `Steam App ${appid}`);
  const genres = Array.isArray(detail?.genres) ? detail.genres.map((item: any) => cleanSteamText(item?.description)).filter(Boolean) : [];
  const categories = Array.isArray(detail?.categories) ? detail.categories.map((item: any) => cleanSteamText(item?.description)).filter(Boolean) : [];
  const developers = Array.isArray(detail?.developers) ? detail.developers.map(cleanSteamText).filter(Boolean) : [];
  const publishers = Array.isArray(detail?.publishers) ? detail.publishers.map(cleanSteamText).filter(Boolean) : [];
  const image = detail?.header_image || detail?.capsule_image || steamFallbackImage(appid);
  return applyFxSteamOffer({
    appid,
    id: appid,
    title,
    name: title,
    image,
    thumbnail: image,
    capsule_image: detail?.capsule_image || steamFallbackImage(appid, "capsule"),
    background: detail?.background_raw || detail?.background || "",
    short_description: cleanSteamText(detail?.short_description || detail?.detailed_description || "Fiche Steam avec achat, prix et informations de base."),
    price: finalAmount,
    price_initial: initialAmount,
    price_currency: currency,
    price_label: isFree ? "Gratuit" : price?.final_formatted || (finalAmount !== null ? `${finalAmount} ${currency}` : "Prix Steam"),
    discount_percent: Number(price?.discount_percent || 0),
    is_free: isFree,
    genres,
    genre: genres[0] || "Steam",
    categories,
    developers,
    publishers,
    publisher: publishers[0] || "Steam",
    release_date: detail?.release_date?.date || "",
    steam_url: `https://store.steampowered.com/app/${appid}`,
    source: detail ? "steam" : "steam_fallback",
  });
}

async function getSteamGameDetailDirect(appid: number, fallbackName = "") {
  const now = Date.now();
  const cached = steamDetailCache.get(appid);
  if (cached && cached.expiresAt > now) return cached.item;
  let item: any;
  try {
    const params = new URLSearchParams({ appids: String(appid), cc: "FR", l: "french" });
    const payload = await fetchJsonWithTimeout(`${STEAM_DETAILS_URL}?${params.toString()}`, {}, 10000);
    const node = payload?.[String(appid)];
    item = normalizeSteamGameDirect(appid, fallbackName, node?.success ? node?.data : null);
  } catch {
    item = normalizeSteamGameDirect(appid, fallbackName, null);
  }
  steamDetailCache.set(appid, { item, expiresAt: now + STEAM_CACHE_TTL_MS });
  return item;
}

async function hydrateSteamGamesDirect(candidates: any[], concurrency = 6) {
  const items: any[] = [];
  for (let index = 0; index < candidates.length; index += concurrency) {
    const batch = candidates.slice(index, index + concurrency);
    items.push(...(await Promise.all(batch.map((item) => getSteamGameDetailDirect(Number(item.appid), String(item.name || ""))))));
  }
  return items;
}

async function buildSteamCatalogDirect(userId = "", text = "", genre = "all", page = 1, limitCount = 20) {
  if (userId) await announceServicesAvailableOnce(userId).catch(() => undefined);
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.max(20, Math.min(80, Number(limitCount || 20)));
  const q = String(text || "").trim().toLowerCase();
  const selectedGenre = String(genre || "all").trim().toLowerCase();
  const indexPayload = await fetchSteamAppIndexDirect();
  let candidates = indexPayload.items;
  if (q) candidates = candidates.filter((item: any) => String(item.name || "").toLowerCase().includes(q));
  let totalResults = candidates.length;
  let items: any[] = [];
  if (selectedGenre !== "all") {
    const pool = await hydrateSteamGamesDirect(candidates.slice(0, 180));
    const filtered = pool.filter((item) => (item.genres || [item.genre || ""]).join(" ").toLowerCase().includes(selectedGenre));
    totalResults = filtered.length;
    const start = (safePage - 1) * safeLimit;
    items = filtered.slice(start, start + safeLimit);
  } else {
    const start = (safePage - 1) * safeLimit;
    items = await hydrateSteamGamesDirect(candidates.slice(start, start + safeLimit));
  }
  const genres = Array.from(new Set(items.flatMap((item) => item.genres || []).filter(Boolean))).sort();
  return {
    items,
    genres: genres.length ? genres.slice(0, 18) : ["Action", "Adventure", "RPG", "Simulation", "Sports", "Strategy", "Free to Play"],
    page: safePage,
    limit: safeLimit,
    total_results: totalResults,
    has_more: safePage * safeLimit < totalResults,
    source: indexPayload.source,
    cache_ttl_seconds: STEAM_CACHE_TTL_MS / 1000,
  };
}

async function purchaseSteamGameDirect(body: any) {
  const firebaseUser = await requireFirebaseUser();
  const appid = Number(body?.appid || 0);
  if (!appid) throw new Error("Jeu Steam invalide.");
  const walletCurrency = normalizeShopCurrency(body?.wallet_currency || "XOF");
  const game = await getSteamGameDetailDirect(appid);
  const ratesPayload = await getRates();
  const priceCurrency = normalizeShopCurrency(game.fx_currency || game.price_currency || "EUR");
  const priceAmount = game.fx_price ?? game.price ?? 0;
  const debitAmount = game.is_free ? 0 : convertShopMoney(Number(priceAmount || 0), priceCurrency, walletCurrency, ratesPayload.rates || {});
  const userRef = doc(db, USERS, firebaseUser.uid);
  const purchaseId = makeId("stp");
  const txnId = makeId("txn");
  const notifId = makeId("ntf");
  const reference = `STEAM-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  const createdAt = nowIso();
  const cardLast4 = String(body?.card_last4 || "").replace(/\D+/g, "").slice(-4);
  let balances: Record<string, number> = {};
  const purchase = {
    purchase_id: purchaseId,
    user_id: firebaseUser.uid,
    appid,
    game,
    reference,
    status: debitAmount > 0 ? "completed" : "reserved",
    debit_amount: debitAmount,
    wallet_currency: walletCurrency,
    price_amount: priceAmount,
    price_currency: priceCurrency,
    billing_email: String(body?.billing_email || auth.currentUser?.email || ""),
    card: cardLast4
      ? {
          last4: cardLast4,
          brand: cleanSteamText(body?.card_brand || "Carte bancaire").slice(0, 32),
          holder: cleanSteamText(body?.card_holder || auth.currentUser?.displayName || "").slice(0, 80),
        }
      : null,
    steam_url: game.steam_url,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const transaction = {
    txn_id: txnId,
    type: debitAmount > 0 ? "steam_purchase" : "steam_free_redeem",
    user_id: firebaseUser.uid,
    participants: [firebaseUser.uid],
    amount: debitAmount,
    currency: walletCurrency,
    reference,
    status: "completed",
    steam_appid: appid,
    steam_purchase_id: purchaseId,
    steam_price: priceAmount,
    steam_currency: priceCurrency,
    billing_email: String(body?.billing_email || auth.currentUser?.email || ""),
    card_last4: cardLast4,
    created_at: createdAt,
  };
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const data = normalizeUser(snap.data());
    balances = { ...data.balances };
    const available = Number(balances[walletCurrency] || 0);
    if (available < debitAmount) throw new Error(`Solde insuffisant: disponible ${available} ${walletCurrency}, achat ${debitAmount} ${walletCurrency}.`);
    balances[walletCurrency] = roundShopMoney(available - debitAmount, walletCurrency);
    tx.set(userRef, { balances, updated_at: createdAt }, { merge: true });
    tx.set(doc(db, STEAM_PURCHASES, purchaseId), purchase);
    tx.set(doc(db, TXNS, txnId), transaction);
    tx.set(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: firebaseUser.uid,
      type: "steam_purchase",
      txn_id: txnId,
      title: "Carte de jeu creditee",
      body: `${game.title} est credite sur ton compte FX Pro. Reference ${reference}. ${debitAmount > 0 ? `Debit solde ${debitAmount} ${walletCurrency}.` : "Aucun debit, jeu gratuit."}`,
      read: false,
      created_at: createdAt,
      url: "/games",
    });
  });
  return { ok: true, purchase, transaction, balances, steam_url: game.steam_url };
}

export function subscribeFirebaseNotifications(
  onItems: (items: any[]) => void,
  onError?: (error: Error) => void
) {
  const user = auth.currentUser;
  if (!user) return () => undefined;

  const q = query(collection(db, NOTIFS), where("user_id", "==", user.uid));
  return onSnapshot(
    q,
    (snap) => onItems(sortByDateDesc(snap.docs.map((d) => d.data()))),
    (error) => onError?.(error)
  );
}

export async function registerFirebasePushToken(token: string, provider = "expo") {
  const user = auth.currentUser;
  if (!user || !token) return false;
  await setDoc(
    doc(db, "fxpro_push_tokens", user.uid),
    { token, provider, user_id: user.uid, updated_at: nowIso() },
    { merge: true }
  );
  return true;
}

export async function firebaseDirectRequest(path: string, opts: RequestInit = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const body = parseBody(opts);
  const url = new URL(path, "https://fxpro.local");
  const pathname = url.pathname;

  if (pathname === "/auth/register" && method === "POST") {
    try {
      const cred = await createUserWithEmailAndPassword(auth, body.email, body.password);
      await updateProfile(cred.user, { displayName: body.name }).catch(() => undefined);
      const profile = await ensureUserDoc(cred.user, { name: body.name, phone: body.phone, email: body.email });
      return tokenAndUser(cred.user, profile);
    } catch (error: any) {
      if (error?.code === "auth/email-already-in-use") {
        try {
          const cred = await signInWithEmailAndPassword(auth, body.email, body.password);
          const profile = await ensureUserDoc(cred.user, { name: body.name, phone: body.phone, email: body.email });
          return tokenAndUser(cred.user, profile);
        } catch {
          throw new Error(firebaseAuthMessage(error));
        }
      }
      throw new Error(firebaseAuthMessage(error));
    }
  }

  if (pathname === "/auth/login" && method === "POST") {
    try {
      const cred = await signInWithEmailAndPassword(auth, body.email, body.password);
      const profile = await ensureUserDoc(cred.user);
      if (profile.is_blocked) throw new Error("Compte suspendu.");
      return tokenAndUser(cred.user, profile);
    } catch (error: any) {
      throw new Error(firebaseAuthMessage(error));
    }
  }

  if (pathname === "/auth/google/session" && method === "POST") {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const profile = await ensureUserDoc(cred.user);
      if (profile.is_blocked) throw new Error("Compte suspendu.");
      return tokenAndUser(cred.user, profile);
    } catch (error: any) {
      throw new Error(firebaseAuthMessage(error));
    }
  }

  if (pathname === "/auth/me") {
    const profile = await currentProfile();
    await notifyWithdrawPausedOnce(profile.user_id).catch(() => undefined);
    await announceMaintenanceOnce(profile.user_id).catch(() => undefined);
    await announceServicesAvailableOnce(profile.user_id).catch(() => undefined);
    return profile;
  }

  if (pathname === "/auth/logout" && method === "POST") {
    await signOut(auth);
    return { ok: true };
  }

  if (pathname === "/rates") return getRates();

  if (pathname === "/rates/history") {
    const pair = (url.searchParams.get("pair") || "EUR_USD").toUpperCase();
    const [from, to] = pair.split("_");
    const payload = await getRates();
    const rates = payload.rates;
    const rate = rates[from] && rates[to] ? rates[to] / rates[from] : 1;
    const history = await getRateHistory(pair, rate);
    const lastPoint = history.points[history.points.length - 1];
    return { pair, current: lastPoint?.v || rate, points: history.points, source: history.source, updated_at: payload.updated_at };
  }

  if (pathname === "/bonus" && method === "GET") {
    const firebaseUser = await requireFirebaseUser();
    const userSnap = await getDoc(doc(db, USERS, firebaseUser.uid));
    const rawUser = userSnap.data() || {};
    await lockBonusIfNeeded(firebaseUser.uid, rawUser.bonus_country);
    const bonusSnap = await advanceBonusIfNeeded(firebaseUser.uid);
    const bonus = bonusSnap.data() || {};
    const country = getBonusCountry(supportedBonusCountry(bonus.country || rawUser.bonus_country, bonus.currency));
    return {
      countries: BONUS_COUNTRIES,
      country,
      catalog: getBonusCatalog(country.code, bonus.currency || country.currency),
      minimum_deposit: getMinimumBonusDeposit(country.code, bonus.currency || country.currency),
      status: bonus,
      history: bonusHistoryFromDoc(bonus),
      rules: [
        "Uniquement le premier depot recu et confirme est analyse.",
        "Les depots en attente, annules, refuses ou les tentatives ne comptent pas.",
        "Une fois le premier depot recu verrouille, il ne peut plus etre remplace.",
        "Le bonus est analyse entre 7 et 30 jours selon le statut et le score de confiance.",
        "Un controle anti-abus peut refuser le bonus meme si le seuil financier est atteint.",
      ],
    };
  }

  if (pathname === "/bonus/country" && method === "PATCH") {
    const firebaseUser = await requireFirebaseUser();
    const country = getBonusCountry(body.country);
    const bonusRef = doc(db, BONUS, firebaseUser.uid);
    const bonusSnap = await getDoc(bonusRef);
    const bonus = bonusSnap.data();
    if (bonus?.first_deposit_locked && bonus.country !== country.code) {
      throw new Error("Pays bonus deja verrouille par le premier depot recu confirme.");
    }
    await updateDoc(doc(db, USERS, firebaseUser.uid), { bonus_country: country.code, updated_at: nowIso() });
    await setDoc(
      bonusRef,
      {
        bonus_id: `bonus_${firebaseUser.uid}`,
        user_id: firebaseUser.uid,
        country: country.code,
        currency: country.currency,
        status: bonus?.status || "pending",
        eligible: Boolean(bonus?.eligible),
        first_deposit_locked: Boolean(bonus?.first_deposit_locked),
        reason: bonus?.reason || "En attente du premier depot recu confirme.",
        updated_at: nowIso(),
        created_at: bonus?.created_at || nowIso(),
      },
      { merge: true }
    );
    return firebaseDirectRequest("/bonus", { method: "GET" });
  }

  if (pathname === "/games/status" && method === "GET") {
    const firebaseUser = await requireFirebaseUser();
    return ensureGameTicketsDirect(firebaseUser.uid);
  }

  if (pathname === "/games/play" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    return playGameDirect(firebaseUser.uid, String(body.game_id || "scratch"));
  }

  if (pathname === "/convert" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const rates = (await getRates()).rates;
    const from = body.from_currency;
    const to = body.to_currency;
    const amount = Number(body.amount);
    const rate = rates[from] && rates[to] ? rates[to] / rates[from] : 0;
    if (!amount || amount <= 0 || !rate) throw new Error("Conversion invalide");
    const received = Number((amount * rate).toFixed(["XOF", "XAF", "JPY", "NGN", "KES"].includes(to) ? 0 : 2));
    const txnId = makeId("txn");
    const userRef = doc(db, USERS, firebaseUser.uid);
    const txnRef = doc(db, TXNS, txnId);
    const notifRef = doc(db, NOTIFS, makeId("ntf"));
    let balances: Record<string, number> = {};
    const transaction = {
      txn_id: txnId,
      type: "convert",
      user_id: firebaseUser.uid,
      participants: [firebaseUser.uid],
      from_currency: from,
      to_currency: to,
      amount,
      received,
      rate,
      status: "completed",
      created_at: nowIso(),
    };
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const user = normalizeUser(snap.data());
      balances = { ...user.balances };
      if ((balances[from] || 0) < amount) throw new Error("Solde insuffisant");
      balances[from] = Number(((balances[from] || 0) - amount).toFixed(4));
      balances[to] = Number(((balances[to] || 0) + received).toFixed(4));
      tx.update(userRef, { balances, updated_at: nowIso() });
      tx.set(txnRef, transaction);
      tx.set(notifRef, {
        notif_id: notifRef.id,
        user_id: firebaseUser.uid,
        title: "Conversion reussie",
        body: `${amount} ${from} -> ${received} ${to}`,
        read: false,
        created_at: nowIso(),
      });
    });
    return { ok: true, transaction, balances };
  }

  if (pathname === "/transfer" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const sender = await currentProfile();
    const recipient = body.by === "qr" ? await findUserByQr(body.recipient) : await findUserByEmail(body.recipient);
    if (!recipient) throw new Error("Destinataire introuvable");
    if (recipient.user_id === firebaseUser.uid) throw new Error("Impossible de se transferer a soi-meme");
    if (recipient.is_blocked) throw new Error("Destinataire bloque");
    const amount = Number(body.amount);
    const currency = body.currency;
    if (!amount || amount <= 0) throw new Error("Montant invalide");
    const txnId = makeId("txn");
    const senderRef = doc(db, USERS, firebaseUser.uid);
    const recipientRef = doc(db, USERS, recipient.user_id);
    const txnRef = doc(db, TXNS, txnId);
    const senderNotifId = makeId("ntf");
    const recipientNotifId = makeId("ntf");
    const senderNotifRef = doc(db, NOTIFS, senderNotifId);
    const recipientNotifRef = doc(db, NOTIFS, recipientNotifId);
    let balances: Record<string, number> = {};
    const transaction = {
      txn_id: txnId,
      type: "transfer",
      sender_id: firebaseUser.uid,
      sender_email: sender.email,
      sender_name: sender.name,
      receiver_id: recipient.user_id,
      receiver_email: recipient.email,
      receiver_name: recipient.name,
      participants: [firebaseUser.uid, recipient.user_id],
      amount,
      currency,
      note: body.note || "",
      status: "completed",
      created_at: nowIso(),
    };
    await runTransaction(db, async (tx) => {
      const senderSnap = await tx.get(senderRef);
      const recipientSnap = await tx.get(recipientRef);
      const senderData = normalizeUser(senderSnap.data());
      const recipientData = normalizeUser(recipientSnap.data());
      balances = { ...senderData.balances };
      const recipientBalances = { ...recipientData.balances };
      if ((balances[currency] || 0) < amount) {
        throw new Error(`Solde insuffisant: tu veux envoyer ${amount} ${currency}, mais ton solde disponible est ${balances[currency] || 0} ${currency}.`);
      }
      balances[currency] = Number(((balances[currency] || 0) - amount).toFixed(4));
      recipientBalances[currency] = Number(((recipientBalances[currency] || 0) + amount).toFixed(4));
      tx.update(senderRef, { balances, updated_at: nowIso() });
      tx.update(recipientRef, { balances: recipientBalances, updated_at: nowIso() });
      tx.set(txnRef, transaction);
      tx.set(senderNotifRef, {
        notif_id: senderNotifId,
        user_id: firebaseUser.uid,
        type: "transfer",
        transfer_role: "sender",
        txn_id: txnId,
        title: "FX Pro - Transfert envoyé",
        body: `${amount} ${currency} envoyé à ${recipient.name || recipient.email}`,
        read: false,
        created_at: nowIso(),
      });
      tx.set(recipientNotifRef, {
        notif_id: recipientNotifId,
        user_id: recipient.user_id,
        type: "transfer",
        transfer_role: "receiver",
        txn_id: txnId,
        title: "FX Pro - Argent reçu",
        body: `${amount} ${currency} reçu de ${sender.name || sender.email}`,
        read: false,
        created_at: nowIso(),
      });
    });
    lockBonusIfNeeded(recipient.user_id).catch(() => undefined);
    return { ok: true, transaction, balances, notification_ids: { sender: senderNotifId, receiver: recipientNotifId } };
  }

  if (pathname === "/users/check") {
    const current = await currentProfile();
    const email = url.searchParams.get("email") || "";
    const found = await findUserByEmail(email);
    if (!found) return { exists: false };
    return {
      exists: true,
      self: found.user_id === current.user_id,
      blocked: found.is_blocked,
      name: found.name,
      email: found.email,
      picture: found.picture,
    };
  }

  if (pathname === "/qr/me") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await ensureUserDoc(firebaseUser);
    const snap = await getDoc(doc(db, USERS, firebaseUser.uid));
    return { qr_code: snap.data()?.qr_code, email: profile.email, name: profile.name };
  }

  if (pathname === "/qr/lookup") {
    const found = await findUserByQr(url.searchParams.get("code") || "");
    if (!found) throw new Error("Code QR introuvable");
    return { user_id: found.user_id, email: found.email, name: found.name };
  }

  if (pathname === "/shop/catalog") {
    const firebaseUser = await requireFirebaseUser();
    return getShopCatalog(url.searchParams.get("currency") || "XOF", url.searchParams.get("q") || "market", firebaseUser.uid);
  }

  if (pathname === "/shop/orders") {
    const firebaseUser = await requireFirebaseUser();
    return getUserShopOrders(firebaseUser.uid);
  }

  if (pathname === "/shop/seller/profile" && method === "GET") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await currentProfile();
    const sellerSnap = await getDoc(doc(db, SHOP_SELLERS, firebaseUser.uid));
    const seller = sellerProfilePayload(sellerSnap.data(), profile);
    const articlesSnap = await getDocs(query(collection(db, SHOP_SELLER_ARTICLES), where("user_id", "==", firebaseUser.uid)));
    const orders = await getSellerOrdersForUser(firebaseUser.uid);
    return { profile: seller, articles: sortByDateDesc(articlesSnap.docs.map((d) => d.data()).filter((item: any) => !item.deleted_at)), orders };
  }

  if (pathname === "/shop/seller/profile" && method === "PATCH") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await currentProfile();
    const current = sellerProfilePayload((await getDoc(doc(db, SHOP_SELLERS, firebaseUser.uid))).data(), profile);
    const patch = {
      seller_id: current.seller_id,
      user_id: firebaseUser.uid,
      store_name: String(body.store_name || current.store_name).trim().slice(0, 80),
      bio: String(body.bio || current.bio).trim().slice(0, 300),
      city: String(body.city || current.city || "").trim().slice(0, 80),
      support_phone: String(body.support_phone || current.support_phone || "").trim().slice(0, 40),
      pickup_zone: String(body.pickup_zone || current.pickup_zone || "").trim().slice(0, 120),
      status: profile.kyc_status === "verified" ? "active" : "kyc_required",
      kyc_status: profile.kyc_status || "pending",
      updated_at: nowIso(),
      created_at: current.created_at || nowIso(),
    };
    await setDoc(doc(db, SHOP_SELLERS, firebaseUser.uid), patch, { merge: true });
    return { profile: sellerProfilePayload(patch, profile) };
  }

  if (pathname === "/shop/seller/articles" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await currentProfile();
    if (profile.kyc_status !== "verified") throw new Error("KYC certifie obligatoire pour publier un article.");
    const seller = sellerProfilePayload((await getDoc(doc(db, SHOP_SELLERS, firebaseUser.uid))).data(), profile);
    const articleId = `seller_${firebaseUser.uid}_${makeId("art").slice(-8)}`;
    const article = cleanSellerArticleDirect(body, profile, seller, articleId);
    article.created_at = nowIso();
    await setDoc(doc(db, SHOP_SELLER_ARTICLES, articleId), article);
    return { ok: true, article };
  }

  if (pathname.startsWith("/shop/seller/articles/") && method === "PATCH") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await currentProfile();
    if (profile.kyc_status !== "verified") throw new Error("KYC certifie obligatoire pour modifier un article.");
    const articleId = decodeURIComponent(pathname.split("/").pop() || "");
    const articleRef = doc(db, SHOP_SELLER_ARTICLES, articleId);
    const existing = (await getDoc(articleRef)).data();
    if (!existing || existing.user_id !== firebaseUser.uid || existing.deleted_at) throw new Error("Article introuvable.");
    const seller = sellerProfilePayload((await getDoc(doc(db, SHOP_SELLERS, firebaseUser.uid))).data(), profile);
    const patch = cleanSellerArticleDirect(body, profile, seller, articleId);
    patch.created_at = existing.created_at || nowIso();
    await setDoc(articleRef, patch, { merge: true });
    return { ok: true, article: patch };
  }

  if (pathname.startsWith("/shop/seller/articles/") && method === "DELETE") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await currentProfile();
    if (profile.kyc_status !== "verified") throw new Error("KYC certifie obligatoire pour supprimer un article.");
    const articleId = decodeURIComponent(pathname.split("/").pop() || "");
    const articleRef = doc(db, SHOP_SELLER_ARTICLES, articleId);
    const existing = (await getDoc(articleRef)).data();
    if (!existing || existing.user_id !== firebaseUser.uid || existing.deleted_at) throw new Error("Article introuvable.");
    await setDoc(articleRef, { status: "deleted", deleted_at: nowIso(), updated_at: nowIso() }, { merge: true });
    return { ok: true };
  }

  if (pathname === "/shop/checkout" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await currentProfile();
    const orderCurrency = normalizeShopCurrency(body.currency || "XOF");
    const walletCurrency = normalizeShopCurrency(body.wallet_currency || orderCurrency);
    const lines = Array.isArray(body.items) ? (body.items as ShopCartLine[]) : [];
    const clientOrderId = String(body.client_order_id || "");
    const uniqueProductIds = new Set(lines.map((line) => String(line.product_id || "")));
    if (!lines.length || lines.length > 20 || uniqueProductIds.size !== lines.length) {
      await logShopRisk(firebaseUser.uid, "invalid_cart_shape", { count: lines.length, unique: uniqueProductIds.size });
      throw new Error("Panier invalide: doublon ou volume suspect detecte.");
    }
    if (clientOrderId && !/^shop_[a-z0-9]{8,32}$/i.test(clientOrderId)) {
      await logShopRisk(firebaseUser.uid, "invalid_client_order_id", { clientOrderId });
      throw new Error("Identifiant de commande invalide.");
    }
    if (clientOrderId) {
      const existing = await getDocs(
        query(collection(db, SHOP_ORDERS), where("user_id", "==", firebaseUser.uid), where("client_order_id", "==", clientOrderId), limit(1))
      );
      if (!existing.empty) {
        const order = existing.docs[0].data();
        return { ok: true, duplicate: true, order, transaction: order.transaction };
      }
    }
    const recentOrders = await getUserShopOrders(firebaseUser.uid).catch(() => ({ items: [] }));
    const lastOrder = recentOrders.items?.[0];
    if (lastOrder?.created_at && Date.now() - new Date(lastOrder.created_at).getTime() < 4500) {
      await logShopRisk(firebaseUser.uid, "rapid_checkout", { last_order_id: lastOrder.order_id });
      throw new Error("Commande trop rapide. Patiente quelques secondes avant de revalider.");
    }

    const ratesPayload = await getRates();
    const catalog = await getShopCatalog(orderCurrency, body.query || "market", firebaseUser.uid);
    const totals = calculateShopCart({
      products: catalog.products,
      lines,
      orderCurrency,
      walletCurrency,
      rates: ratesPayload.rates || FALLBACK_RATES,
    });
    const priceSnapshotHash = totals.price_snapshot_hash || hashShopCartSnapshot(totals.items, totals.total, orderCurrency);

    const orderId = makeId("ord");
    const txnId = makeId("txn");
    const notifId = makeId("ntf");
    const reference = `SHOP-${makeId("ref").slice(-8).toUpperCase()}`;
    const userRef = doc(db, USERS, firebaseUser.uid);
    const orderRef = doc(db, SHOP_ORDERS, orderId);
    const txnRef = doc(db, TXNS, txnId);
    const notifRef = doc(db, NOTIFS, notifId);
    let balances: Record<string, number> = {};
    const createdAt = nowIso();
    const transaction = {
      txn_id: txnId,
      type: "shop_purchase",
      user_id: firebaseUser.uid,
      participants: [firebaseUser.uid],
      amount: totals.debit_amount,
      currency: walletCurrency,
      order_total: totals.total,
      order_currency: orderCurrency,
      discount_total: totals.discount_total,
      price_snapshot_hash: priceSnapshotHash,
      shop_order_id: orderId,
      reference,
      items: totals.items,
      item_count: totals.items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
      pickup_status: "pickup_paused",
      pickup_message: catalog.pickup_message || SHOP_AGENCY_MESSAGE,
      status: "completed",
      created_at: createdAt,
    };
    const order = {
      order_id: orderId,
      user_id: firebaseUser.uid,
      client_order_id: clientOrderId || null,
      reference,
      status: "paid",
      payment_status: "paid",
      pickup_status: "pickup_paused",
      pickup_message: catalog.pickup_message || SHOP_AGENCY_MESSAGE,
      currency: orderCurrency,
      wallet_currency: walletCurrency,
      total: totals.total,
      debit_amount: totals.debit_amount,
      discount_total: totals.discount_total,
      price_snapshot_hash: priceSnapshotHash,
      items: totals.items,
      transaction,
      customer_name: profile.name,
      customer_email: profile.email,
      agency_message: catalog.pickup_message || SHOP_AGENCY_MESSAGE,
      note: String(body.note || "").slice(0, 180),
      created_at: createdAt,
      updated_at: createdAt,
    };
    const sellerOrderRecords = totals.items
      .filter((item: any) => item.source === "seller" && item.seller_id && item.seller_id !== firebaseUser.uid)
      .reduce((acc: Record<string, any[]>, item: any) => {
        acc[item.seller_id] = acc[item.seller_id] || [];
        acc[item.seller_id].push(item);
        return acc;
      }, {});

    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      const data = normalizeUser(userSnap.data());
      balances = { ...data.balances };
      const available = Number(balances[walletCurrency] || 0);
      if (available < totals.debit_amount) {
        throw new Error(
          `Solde insuffisant: disponible ${available} ${walletCurrency}, commande ${totals.debit_amount} ${walletCurrency}. Rechargez via depot ou une agence FX Pro partenaire.`
        );
      }
      balances[walletCurrency] = Number((available - totals.debit_amount).toFixed(4));
      tx.update(userRef, { balances, updated_at: nowIso() });
      tx.set(orderRef, order);
      tx.set(txnRef, transaction);
      tx.set(notifRef, {
        notif_id: notifId,
        user_id: firebaseUser.uid,
        type: "shop_purchase",
        txn_id: txnId,
        order_id: orderId,
        title: "Commande boutique confirmee",
        body: `${reference}: ${totals.items.length} article(s), paiement ${totals.debit_amount} ${walletCurrency}. Retrait agence momentanement indisponible, suivi FX Pro active.`,
        read: false,
        created_at: createdAt,
      });
      Object.entries(sellerOrderRecords).forEach(([sellerId, items]) => {
        const sellerOrderId = makeId("sord");
        const sellerNotifId = makeId("ntf");
        tx.set(doc(db, SHOP_SELLER_ORDERS, sellerOrderId), {
          seller_order_id: sellerOrderId,
          seller_id: sellerId,
          buyer_id: firebaseUser.uid,
          buyer_name: profile.name,
          buyer_email: profile.email,
          order_id: orderId,
          reference,
          status: "new",
          currency: orderCurrency,
          wallet_currency: walletCurrency,
          items,
          item_count: (items as any[]).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          created_at: createdAt,
          updated_at: createdAt,
        });
        tx.set(doc(db, NOTIFS, sellerNotifId), {
          notif_id: sellerNotifId,
          user_id: sellerId,
          type: "shop_seller_order",
          order_id: orderId,
          title: "Nouvelle commande vendeur",
          body: `${reference}: ${(items as any[]).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} article(s) vendeur a preparer.`,
          read: false,
          created_at: createdAt,
          url: "/shop",
        });
      });
    });
    return { ok: true, order, transaction, balances };
  }

  if (pathname === "/movies/catalog" && method === "GET") {
    const kind = ["all", "movie", "tv"].includes(url.searchParams.get("kind") || "") ? url.searchParams.get("kind") || "all" : "all";
    return buildMoviesCatalogDirect(
      auth.currentUser?.uid || "",
      kind,
      url.searchParams.get("q") || "",
      Number(url.searchParams.get("page") || 1),
      url.searchParams.get("genre") || "all",
      url.searchParams.get("sort") || "popular",
      Number(url.searchParams.get("page_size") || MOVIE_PAGE_SIZE_DEFAULT)
    );
  }

  if (pathname === "/movies/watch" && method === "GET") {
    const mediaType = String(url.searchParams.get("media_type") || "movie");
    const tmdbId = Number(url.searchParams.get("tmdb_id") || 0);
    if (!["movie", "tv"].includes(mediaType)) throw new Error("Type media invalide.");
    if (!tmdbId) throw new Error("Identifiant film invalide.");
    if (auth.currentUser?.uid) await announceServicesAvailableOnce(auth.currentUser.uid).catch(() => undefined);
    try {
      return await buildMovieWatchOptionsDirect(mediaType, tmdbId);
    } catch {
      const fallback = MOVIE_FALLBACK_ITEMS.find((item: any) => item.id === tmdbId && item.media_type === mediaType) || MOVIE_FALLBACK_ITEMS[0];
      return {
        tmdb_id: tmdbId,
        media_type: mediaType,
        details: fallback,
        seasons: mediaType === "tv" ? [{ season_number: 1, name: "Saison 1", episode_count: 8, poster_url: fallback.poster_url || "", overview: "", air_date: "" }] : [],
        episodes: mediaType === "tv" ? fallbackEpisodeList(1, 8) : [],
        watch_url: "",
        trailer_url: "",
        player: { embed_url: "", video_key: "", supports_vf: false, supports_vostfr: false },
        ...streamingProfileForTitle(mediaType, tmdbId, fallback, ""),
        provider_region: "",
        provider_names: [],
        has_vf: false,
      };
    }
  }

  if (pathname === "/movies/library" && method === "GET") {
    const firebaseUser = await requireFirebaseUser();
    return { items: await getMovieLibraryDirect(firebaseUser.uid) };
  }

  if (pathname === "/movies/library/toggle" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const mediaType = String(body.media_type || "movie");
    const listType = String(body.list_type || "watchlist");
    if (!["movie", "tv"].includes(mediaType)) throw new Error("Type media invalide.");
    if (!["favorite", "watchlist", "watched"].includes(listType)) throw new Error("Liste invalide.");
    const key = `${firebaseUser.uid}_${mediaType}_${Number(body.tmdb_id)}`;
    const ref = doc(db, MOVIE_LIBRARY, key);
    const existing = (await getDoc(ref)).data() || {};
    const patch = {
      ...existing,
      user_id: firebaseUser.uid,
      tmdb_id: Number(body.tmdb_id),
      media_type: mediaType,
      [listType]: Boolean(body.active),
      item: body.item || existing.item || {},
      created_at: existing.created_at || nowIso(),
      updated_at: nowIso(),
    };
    if (!patch.favorite && !patch.watchlist && !patch.watched) {
      await deleteDoc(ref).catch(() => undefined);
      return { ok: true, removed: true };
    }
    await setDoc(ref, patch, { merge: true });
    return { ok: true, item: patch };
  }

  if (pathname === "/games/catalog" && method === "GET") {
    return buildFreeGamesCatalogDirect(
      auth.currentUser?.uid || "",
      url.searchParams.get("q") || "",
      url.searchParams.get("genre") || "all",
      url.searchParams.get("platform") || "all",
      Number(url.searchParams.get("page") || 1),
      Number(url.searchParams.get("limit") || 18)
    );
  }

  if (pathname === "/games/steam/catalog" && method === "GET") {
    return buildSteamCatalogDirect(
      auth.currentUser?.uid || "",
      url.searchParams.get("q") || "",
      url.searchParams.get("genre") || "all",
      Number(url.searchParams.get("page") || 1),
      Number(url.searchParams.get("limit") || 20)
    );
  }

  if (pathname === "/games/steam/purchase" && method === "POST") {
    return purchaseSteamGameDirect(body);
  }

  if (pathname === "/admin/notifications/withdraw-paused" && method === "POST") {
    const profile = await currentProfile();
    requireAdminOwner(profile);
    const snap = await getDocs(collection(db, USERS));
    let sent = 0;
    let skipped = 0;
    let batch = writeBatch(db);
    let writes = 0;
    const commitBatch = async () => {
      if (!writes) return;
      await batch.commit();
      batch = writeBatch(db);
      writes = 0;
    };
    for (const item of snap.docs) {
      const data = item.data();
      if (String(data.email || "").toLowerCase() === ADMIN_EMAIL || data[WITHDRAW_PAUSED_NOTICE_FLAG]) {
        skipped += 1;
        continue;
      }
      const notifId = makeId("ntf");
      const createdAt = nowIso();
      batch.set(doc(db, USERS, item.id), { [WITHDRAW_PAUSED_NOTICE_FLAG]: createdAt, updated_at: createdAt }, { merge: true });
      batch.set(doc(db, NOTIFS, notifId), {
        notif_id: notifId,
        user_id: data.user_id || item.id,
        type: "withdraw_paused",
        title: WITHDRAW_PAUSED_NOTICE_TITLE,
        body: WITHDRAW_PAUSED_NOTICE_BODY,
        read: false,
        created_at: createdAt,
        url: "/notifications",
      });
      writes += 2;
      sent += 1;
      if (writes >= 450) await commitBatch();
    }
    await commitBatch();
    return { ok: true, sent, skipped, flag: WITHDRAW_PAUSED_NOTICE_FLAG };
  }

  if (pathname === "/admin/notifications/maintenance" && method === "POST") {
    const profile = await currentProfile();
    requireAdminOwner(profile);
    const snap = await getDocs(collection(db, USERS));
    let sent = 0;
    let skipped = 0;
    let batch = writeBatch(db);
    let writes = 0;
    const commitBatch = async () => {
      if (!writes) return;
      await batch.commit();
      batch = writeBatch(db);
      writes = 0;
    };
    for (const item of snap.docs) {
      const data = item.data();
      if (String(data.email || "").toLowerCase() === ADMIN_EMAIL || data[MAINTENANCE_NOTICE_FLAG]) {
        skipped += 1;
        continue;
      }
      const notifId = makeId("ntf");
      const createdAt = nowIso();
      batch.set(doc(db, USERS, item.id), { [MAINTENANCE_NOTICE_FLAG]: createdAt, updated_at: createdAt }, { merge: true });
      batch.set(doc(db, NOTIFS, notifId), {
        notif_id: notifId,
        user_id: data.user_id || item.id,
        type: "maintenance_update",
        title: MAINTENANCE_NOTICE_TITLE,
        body: MAINTENANCE_NOTICE_BODY,
        read: false,
        created_at: createdAt,
        url: "/notifications",
      });
      writes += 2;
      sent += 1;
      if (writes >= 450) await commitBatch();
    }
    await commitBatch();
    return { ok: true, sent, skipped, flag: MAINTENANCE_NOTICE_FLAG };
  }

  if (pathname === "/admin/notifications/custom" && method === "POST") {
    const profile = await currentProfile();
    requireAdminOwner(profile);
    const title = cleanSteamText(body?.title || "").slice(0, 90);
    const message = cleanSteamText(body?.body || "").slice(0, 600);
    if (title.length < 3 || message.length < 3) throw new Error("Titre et message requis.");
    const allUsers = Boolean(body?.all_users);
    const selectedIds = Array.isArray(body?.user_ids) ? body.user_ids.map((id: any) => String(id)).filter(Boolean) : [];
    if (!allUsers && !selectedIds.length) throw new Error("Choisis un utilisateur ou tous les utilisateurs.");
    const snap = await getDocs(collection(db, USERS));
    const targets = snap.docs
      .map((d) => normalizeUser(d.data()))
      .filter((u) => String(u.email || "").toLowerCase() !== ADMIN_EMAIL)
      .filter((u) => allUsers || selectedIds.includes(u.user_id))
      .slice(0, 1000);
    const batch = writeBatch(db);
    const createdAt = nowIso();
    targets.forEach((target) => {
      const notifId = makeId("ntf");
      batch.set(doc(db, NOTIFS, notifId), {
        notif_id: notifId,
        user_id: target.user_id,
        type: cleanSteamText(body?.type || "admin_message").slice(0, 40) || "admin_message",
        title,
        body: message,
        read: false,
        created_at: createdAt,
        url: "/notifications",
        sent_by: profile.user_id,
      });
    });
    if (targets.length) await batch.commit();
    return { ok: true, sent: targets.length, all_users: allUsers };
  }

  if (pathname === "/admin/shop/products" && method === "GET") {
    const profile = await currentProfile();
    requireAdminOwner(profile);
    const snap = await getDocs(collection(db, SHOP_PRODUCTS));
    return { items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }

  if (pathname.startsWith("/admin/shop/products/") && method === "PATCH") {
    const profile = await currentProfile();
    requireAdminOwner(profile);
    const id = decodeURIComponent(pathname.split("/").pop() || "");
    if (!id) throw new Error("Produit invalide.");
    const allowed = [
      "title",
      "brand",
      "description",
      "category",
      "image",
      "price_override_usd",
      "base_price",
      "discount_override",
      "promo_active",
      "promo_discount",
      "stock_override",
      "stock",
      "hidden",
      "visible",
      "tags",
    ];
    const patch = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    await setDoc(doc(db, SHOP_PRODUCTS, id), { product_id: id, ...patch, updated_at: nowIso(), updated_by: profile.user_id }, { merge: true });
    return { ok: true };
  }

  if (pathname === "/transactions") {
    const firebaseUser = await requireFirebaseUser();
    const q = query(collection(db, TXNS), where("participants", "array-contains", firebaseUser.uid));
    const snap = await getDocs(q);
    return { items: sortByDateDesc(snap.docs.map((d) => d.data())) };
  }

  if (pathname.startsWith("/transactions/")) {
    const id = pathname.split("/").pop() || "";
    const snap = await getDoc(doc(db, TXNS, id));
    if (!snap.exists()) throw new Error("Transaction introuvable");
    return snap.data();
  }

  if (pathname === "/notifications") {
    const firebaseUser = await requireFirebaseUser();
    const q = query(collection(db, NOTIFS), where("user_id", "==", firebaseUser.uid));
    const snap = await getDocs(q);
    return { items: sortByDateDesc(snap.docs.map((d) => d.data())) };
  }

  if (pathname === "/notifications/read-all" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const snap = await getDocs(query(collection(db, NOTIFS), where("user_id", "==", firebaseUser.uid)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
    return { ok: true };
  }

  if (pathname === "/cash/deposit" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await currentProfile();
    const amount = Number(body.amount);
    const currency = body.currency;
    if (!amount || amount <= 0) throw new Error("Montant invalide");
    if (!Object.prototype.hasOwnProperty.call(INITIAL_BALANCES, currency)) throw new Error("Devise non supportee");
    const txnId = makeId("txn");
    const notifId = makeId("ntf");
    const reference = makeReference("DEP");
    const transaction = {
      txn_id: txnId,
      type: "deposit",
      user_id: firebaseUser.uid,
      participants: [firebaseUser.uid],
      amount,
      currency,
      method: body.method || "manual",
      account_name: body.account_name || profile.name,
      account_ref: body.account_ref || "",
      note: body.note || "",
      reference,
      fees: 0,
      status: "pending",
      created_at: nowIso(),
    };
    await setDoc(doc(db, TXNS, txnId), transaction);
    await setDoc(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: firebaseUser.uid,
      type: "deposit",
      txn_id: txnId,
      title: "Dépôt en attente",
      body: `Référence ${reference}: ${amount} ${currency} en validation.`,
      read: false,
      created_at: nowIso(),
    });
    return { ok: true, transaction };
  }

  if (pathname === "/cash/withdraw" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const profile = await currentProfile();
    const amount = Number(body.amount);
    const currency = body.currency;
    if (!amount || amount <= 0) throw new Error("Montant invalide");
    if (!Object.prototype.hasOwnProperty.call(INITIAL_BALANCES, currency)) throw new Error("Devise non supportee");
    if (!body.method || !body.account_ref) throw new Error("Méthode et destination requises");
    const txnId = makeId("txn");
    const notifId = makeId("ntf");
    const reference = makeReference("WDR");
    const userRef = doc(db, USERS, firebaseUser.uid);
    const txnRef = doc(db, TXNS, txnId);
    const notifRef = doc(db, NOTIFS, notifId);
    let balances: Record<string, number> = {};
    const transaction = {
      txn_id: txnId,
      type: "withdraw",
      user_id: firebaseUser.uid,
      participants: [firebaseUser.uid],
      amount,
      currency,
      method: body.method,
      account_name: body.account_name || profile.name,
      account_ref: body.account_ref,
      note: body.note || "",
      reference,
      fees: 0,
      status: "pending",
      created_at: nowIso(),
    };
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const data = normalizeUser(snap.data());
      balances = { ...data.balances };
      if ((balances[currency] || 0) < amount) {
        throw new Error(`Solde insuffisant: disponible ${balances[currency] || 0} ${currency}.`);
      }
      balances[currency] = Number(((balances[currency] || 0) - amount).toFixed(4));
      tx.update(userRef, { balances, updated_at: nowIso() });
      tx.set(txnRef, transaction);
      tx.set(notifRef, {
        notif_id: notifId,
        user_id: firebaseUser.uid,
        type: "withdraw",
        txn_id: txnId,
        title: "Retrait en traitement",
        body: `Référence ${reference}: ${amount} ${currency} réservés pour retrait.`,
        read: false,
        created_at: nowIso(),
      });
    });
    return { ok: true, transaction, balances };
  }

  if (pathname === "/profile" && method === "PATCH") {
    const firebaseUser = await requireFirebaseUser();
    const patch = { ...body };
    if (Object.prototype.hasOwnProperty.call(patch, "picture")) {
      try {
        if (patch.picture === null || patch.picture === "") {
          await deleteProfilePicture(firebaseUser.uid);
          patch.picture = null;
        } else if (patch.picture) {
          patch.picture = await uploadProfilePicture(firebaseUser.uid, patch.picture);
        }
      } catch (error: any) {
        const code = error?.code || "";
        if (code.includes("storage/unauthorized")) {
          throw new Error("Upload photo bloque par Firebase Storage. Deploie storage.rules, ou choisis une photo plus legere.");
        }
        throw new Error(error?.message || "Upload photo impossible.");
      }
    }
    await updateDoc(doc(db, USERS, firebaseUser.uid), { ...patch, updated_at: nowIso() });
    return currentProfile();
  }

  if (pathname === "/profile/change-password" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    await updatePassword(firebaseUser, body.new_password);
    return { ok: true };
  }

  if (pathname === "/alerts" && method === "GET") {
    const firebaseUser = await requireFirebaseUser();
    const snap = await getDocs(query(collection(db, ALERTS), where("user_id", "==", firebaseUser.uid)));
    return { items: sortByDateDesc(snap.docs.map((d) => d.data())) };
  }

  if (pathname === "/alerts" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const alertId = makeId("alt");
    const item = { alert_id: alertId, user_id: firebaseUser.uid, ...body, active: true, created_at: nowIso() };
    await setDoc(doc(db, ALERTS, alertId), item);
    return { ok: true, item };
  }

  if (pathname.startsWith("/alerts/") && method === "DELETE") {
    await deleteDoc(doc(db, ALERTS, pathname.split("/").pop() || ""));
    return { ok: true };
  }

  if (pathname === "/vault" && method === "GET") {
    const firebaseUser = await requireFirebaseUser();
    const snap = await getDocs(query(collection(db, VAULTS), where("user_id", "==", firebaseUser.uid)));
    return { items: sortByDateDesc(snap.docs.map((d) => d.data())) };
  }

  if (pathname === "/vault" && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const vaultId = makeId("vlt");
    const txnId = makeId("txn");
    const notifId = makeId("ntf");
    const amount = Number(body.amount);
    const currency = body.currency;
    const userRef = doc(db, USERS, firebaseUser.uid);
    const vaultRef = doc(db, VAULTS, vaultId);
    const txnRef = doc(db, TXNS, txnId);
    const notifRef = doc(db, NOTIFS, notifId);
    const transaction = {
      txn_id: txnId,
      type: "vault_lock",
      user_id: firebaseUser.uid,
      participants: [firebaseUser.uid],
      amount,
      currency,
      status: "completed",
      vault_id: vaultId,
      created_at: nowIso(),
    };
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const user = normalizeUser(snap.data());
      const balances = { ...user.balances };
      if ((balances[currency] || 0) < amount) throw new Error("Solde insuffisant");
      balances[currency] = Number(((balances[currency] || 0) - amount).toFixed(4));
      tx.update(userRef, { balances, updated_at: nowIso() });
      tx.set(vaultRef, {
        vault_id: vaultId,
        user_id: firebaseUser.uid,
        amount,
        currency,
        unlock_at: body.unlock_at,
        label: body.label,
        status: "locked",
        created_at: nowIso(),
      });
      tx.set(txnRef, transaction);
      tx.set(notifRef, {
        notif_id: notifId,
        user_id: firebaseUser.uid,
        type: "vault_lock",
        txn_id: txnId,
        title: "Coffre verrouillé",
        body: `${amount} ${currency} verrouillés jusqu'au ${new Date(body.unlock_at).toLocaleDateString("fr-FR")}`,
        read: false,
        created_at: nowIso(),
      });
    });
    return { ok: true, transaction };
  }

  if (pathname.startsWith("/vault/") && pathname.endsWith("/withdraw") && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const vaultId = pathname.split("/")[2];
    const userRef = doc(db, USERS, firebaseUser.uid);
    const vaultRef = doc(db, VAULTS, vaultId);
    const txnId = makeId("txn");
    const notifId = makeId("ntf");
    const txnRef = doc(db, TXNS, txnId);
    const notifRef = doc(db, NOTIFS, notifId);
    let amountReturned = 0;
    let transaction: any = null;
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      const vaultSnap = await tx.get(vaultRef);
      if (!vaultSnap.exists()) throw new Error("Coffre introuvable");
      const vault = vaultSnap.data();
      if (vault.user_id !== firebaseUser.uid || vault.status === "withdrawn") throw new Error("Coffre invalide");
      const early = new Date(vault.unlock_at) > new Date();
      const penalty = early ? Number((vault.amount * 0.05).toFixed(4)) : 0;
      amountReturned = Number((vault.amount - penalty).toFixed(4));
      const user = normalizeUser(userSnap.data());
      const balances = { ...user.balances };
      balances[vault.currency] = Number(((balances[vault.currency] || 0) + amountReturned).toFixed(4));
      tx.update(userRef, { balances, updated_at: nowIso() });
      tx.update(vaultRef, { status: "withdrawn", withdrawn_at: nowIso(), penalty });
      transaction = {
        txn_id: txnId,
        type: "vault_withdraw",
        user_id: firebaseUser.uid,
        participants: [firebaseUser.uid],
        amount: amountReturned,
        currency: vault.currency,
        status: "completed",
        vault_id: vaultId,
        penalty,
        created_at: nowIso(),
      };
      tx.set(txnRef, transaction);
      tx.set(notifRef, {
        notif_id: notifId,
        user_id: firebaseUser.uid,
        type: "vault_withdraw",
        txn_id: txnId,
        title: penalty > 0 ? "Retrait coffre anticipé" : "Coffre retiré",
        body: penalty > 0 ? `+${amountReturned} ${vault.currency} après pénalité ${penalty}` : `+${amountReturned} ${vault.currency}`,
        read: false,
        created_at: nowIso(),
      });
    });
    return { ok: true, amount_returned: amountReturned, transaction };
  }

  if (pathname.startsWith("/admin/transactions/") && pathname.endsWith("/confirm-deposit") && method === "POST") {
    const admin = await currentProfile();
    requireAdminOwner(admin);
    const txnId = pathname.split("/")[3];
    const txnRef = doc(db, TXNS, txnId);
    const txnSnap = await getDoc(txnRef);
    if (!txnSnap.exists()) throw new Error("Depot introuvable");
    const deposit = txnSnap.data();
    if (deposit.type !== "deposit") throw new Error("Seuls les depots peuvent etre confirmes");
    if (deposit.status === "completed") return { ok: true, transaction: deposit };
    if (deposit.status !== "pending") throw new Error("Depot non confirmable");

    const userId = deposit.user_id;
    const userRef = doc(db, USERS, userId);
    const bonusRef = doc(db, BONUS, userId);
    const userSnap = await getDoc(userRef);
    const userRaw = userSnap.data() || {};
    const txns = await getBonusTransactions(userId);
    const confirmedAt = nowIso();
    const confirmedDeposit = { ...deposit, txn_id: txnId, status: "completed", confirmed_at: confirmedAt };
    const txnsForBonus = [...txns.filter((item) => item.txn_id !== txnId), confirmedDeposit];
    const firstReceivedDeposit = chooseFirstReceivedDeposit(txnsForBonus, userId) || confirmedDeposit;
    const bonusEvaluation = buildBonusEvaluation(
      userId,
      userRaw,
      txnsForBonus,
      firstReceivedDeposit,
      userRaw.bonus_country
    );
    let balances: Record<string, number> = {};
    let bonusCreated = false;
    await runTransaction(db, async (tx) => {
      const freshTxn = await tx.get(txnRef);
      const freshDeposit = freshTxn.data();
      if (!freshDeposit || freshDeposit.status !== "pending") throw new Error("Depot deja traite");
      const freshUser = await tx.get(userRef);
      const bonusSnap = await tx.get(bonusRef);
      const normalized = normalizeUser(freshUser.data());
      balances = { ...normalized.balances };
      balances[freshDeposit.currency] = Number(((balances[freshDeposit.currency] || 0) + Number(freshDeposit.amount)).toFixed(4));
      tx.update(userRef, { balances, updated_at: nowIso() });
      tx.update(txnRef, { status: "completed", confirmed_at: confirmedAt, updated_at: nowIso() });
      const notifId = makeId("ntf");
      tx.set(doc(db, NOTIFS, notifId), {
        notif_id: notifId,
        user_id: userId,
        type: "deposit",
        txn_id: txnId,
        title: "Depot confirme",
        body: `${freshDeposit.amount} ${freshDeposit.currency} credites. Reference ${freshDeposit.reference || txnId}.`,
        read: false,
        created_at: nowIso(),
      });
      if (!bonusSnap.data()?.first_deposit_locked) {
        tx.set(bonusRef, { ...bonusEvaluation, updated_at: nowIso() }, { merge: true });
        const eventId = makeId("bne");
        tx.set(doc(db, BONUS_EVENTS, eventId), {
          event_id: eventId,
          user_id: userId,
          bonus_id: bonusEvaluation.bonus_id,
          type: bonusEvaluation.eligible ? "first_received_deposit_eligible" : "first_received_deposit_refused",
          txn_id: firstReceivedDeposit.txn_id,
          created_at: nowIso(),
        });
        bonusCreated = true;
      }
    });
    if (bonusCreated) await notifyBonusState(userId, bonusEvaluation);
    return { ok: true, balances, bonus: bonusEvaluation };
  }

  if (pathname === "/admin/stats") {
    const admin = await currentProfile();
    requireAdminOwner(admin);
    const users = await getDocs(collection(db, USERS));
    const txns = await getDocs(collection(db, TXNS));
    const blocked = users.docs.filter((d) => normalizeUser(d.data()).is_blocked).length;
    const recent_transactions = sortByDateDesc(txns.docs.map((d) => d.data())).slice(0, 10);
    return { users: users.size, transactions: txns.size, blocked, volume: 0, recent_transactions };
  }

  if (pathname === "/admin/users") {
    const admin = await currentProfile();
    requireAdminOwner(admin);
    const search = (url.searchParams.get("search") || "").toLowerCase();
    const snap = await getDocs(collection(db, USERS));
    const users = snap.docs.map((d) => normalizeUser(d.data()));
    const items = users.filter((u) => !search || u.email.toLowerCase().includes(search) || u.name.toLowerCase().includes(search));
    return { items, users: items };
  }

  if (pathname.includes("/balance") && method === "PATCH") {
    const admin = await currentProfile();
    requireAdminOwner(admin);
    const uid = pathname.split("/")[3];
    const ref = doc(db, USERS, uid);
    const snap = await getDoc(ref);
    const user = normalizeUser(snap.data());
    const balances = { ...user.balances };
    const amount = Number(body.amount);
    balances[body.currency] = Number(((balances[body.currency] || 0) + amount).toFixed(4));
    await updateDoc(ref, { balances, updated_at: nowIso() });
    let bonus = null;
    if (amount > 0) {
      const txnId = makeId("txn");
      await setDoc(doc(db, TXNS, txnId), {
        txn_id: txnId,
        type: "admin_credit",
        user_id: uid,
        participants: [uid],
        amount,
        currency: body.currency,
        status: "completed",
        created_at: nowIso(),
      });
      bonus = await lockBonusIfNeeded(uid).then((snap) => snap.data()).catch(() => null);
    }
    return { ok: true, bonus };
  }

  if (pathname.includes("/block") && method === "PATCH") {
    const admin = await currentProfile();
    requireAdminOwner(admin);
    const uid = pathname.split("/")[3];
    const reason = cleanSteamText(body?.reason || (body?.is_blocked ? "Compte suspendu par l'administration FX Pro." : "Compte reactive par l'administration FX Pro.")).slice(0, 600);
    await updateDoc(doc(db, USERS, uid), { is_blocked: Boolean(body.is_blocked), block_reason: body?.is_blocked ? reason : "", blocked_at: body?.is_blocked ? nowIso() : null, blocked_by: body?.is_blocked ? admin.user_id : "", updated_at: nowIso() });
    const notifId = makeId("ntf");
    await setDoc(doc(db, NOTIFS, notifId), {
      notif_id: notifId,
      user_id: uid,
      type: body?.is_blocked ? "account_suspended" : "account_reactivated",
      title: body?.is_blocked ? "Compte suspendu" : "Compte reactive",
      body: reason,
      read: false,
      created_at: nowIso(),
      url: "/notifications",
      sent_by: admin.user_id,
    });
    return { ok: true };
  }

  if (pathname.startsWith("/admin/users/") && method === "DELETE") {
    const admin = await currentProfile();
    requireAdminOwner(admin);
    const uid = pathname.split("/")[3];
    await deleteDoc(doc(db, USERS, uid));
    return { ok: true };
  }

  if (pathname === "/rates/refresh" || pathname === "/rates/override") return { ok: true };

  throw new Error(`Firebase direct: endpoint non gere ${method} ${pathname}`);
}
