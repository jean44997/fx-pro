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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const USERS = "fxpro_users";
const TXNS = "fxpro_transactions";
const NOTIFS = "fxpro_notifications";
const ALERTS = "fxpro_alerts";
const VAULTS = "fxpro_vaults";
const BONUS = "fxpro_bonus";
const BONUS_EVENTS = "fxpro_bonus_events";
const RISK_LOGS = "fxpro_risk_logs";
const DEFAULT_FAVORITE_PAIR_KEYS = ["EUR_USD", "EUR_XOF"];
const MAX_INLINE_PROFILE_PICTURE_CHARS = 700000;

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
  return {
    user_id: data.user_id,
    email: data.email,
    name: data.name || data.email,
    phone: data.phone || "",
    role: data.role || "user",
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
  if (!snap.exists()) {
    const user = {
      user_id: firebaseUser.uid,
      email: firebaseUser.email || extra.email || "",
      email_lower: (firebaseUser.email || extra.email || "").toLowerCase(),
      name: extra.name || firebaseUser.displayName || firebaseUser.email || "Utilisateur",
      phone: extra.phone || "",
      role: "user",
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

async function fetchJsonWithTimeout(url: string, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
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
      return tokenAndUser(cred.user, profile);
    } catch (error: any) {
      throw new Error(firebaseAuthMessage(error));
    }
  }

  if (pathname === "/auth/me") return currentProfile();

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
    if (admin.role !== "admin") throw new Error("Admin uniquement");
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
    const users = await getDocs(collection(db, USERS));
    const txns = await getDocs(collection(db, TXNS));
    return { users: users.size, transactions: txns.size, volume: 0 };
  }

  if (pathname === "/admin/users") {
    const search = (url.searchParams.get("search") || "").toLowerCase();
    const snap = await getDocs(collection(db, USERS));
    const users = snap.docs.map((d) => normalizeUser(d.data()));
    return { users: users.filter((u) => !search || u.email.toLowerCase().includes(search) || u.name.toLowerCase().includes(search)) };
  }

  if (pathname.includes("/balance") && method === "PATCH") {
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
    const uid = pathname.split("/")[3];
    await updateDoc(doc(db, USERS, uid), { is_blocked: Boolean(body.is_blocked), updated_at: nowIso() });
    return { ok: true };
  }

  if (pathname.startsWith("/admin/users/") && method === "DELETE") {
    const uid = pathname.split("/")[3];
    await deleteDoc(doc(db, USERS, uid));
    return { ok: true };
  }

  if (pathname === "/rates/refresh" || pathname === "/rates/override") return { ok: true };

  throw new Error(`Firebase direct: endpoint non gere ${method} ${pathname}`);
}
