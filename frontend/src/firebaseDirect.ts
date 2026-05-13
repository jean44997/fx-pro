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
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";
import type { User } from "./auth";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const USERS = "fxpro_users";
const TXNS = "fxpro_transactions";
const NOTIFS = "fxpro_notifications";
const ALERTS = "fxpro_alerts";
const VAULTS = "fxpro_vaults";

const INITIAL_BALANCES: Record<string, number> = {
  EUR: 100,
  XOF: 50000,
  XAF: 50000,
  USD: 100,
  GBP: 50,
  NGN: 50000,
  MAD: 1000,
  CAD: 100,
  CHF: 100,
  JPY: 10000,
  CNY: 500,
  AUD: 100,
  INR: 5000,
  BRL: 500,
  ZAR: 1500,
  KES: 10000,
  GHS: 1000,
  SEK: 1000,
  AED: 350,
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

function parseBody(opts: RequestInit) {
  if (!opts.body || typeof opts.body !== "string") return {};
  try {
    return JSON.parse(opts.body);
  } catch {
    return {};
  }
}

function normalizeUser(data: any): User {
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
    favorite_pairs: data.favorite_pairs || [["EUR", "XOF"], ["EUR", "USD"]],
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
      favorite_pairs: [["EUR", "XOF"], ["EUR", "USD"]],
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

async function getRates() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/EUR");
    const body = await res.json();
    if (body?.rates?.EUR) {
      return { rates: { ...FALLBACK_RATES, ...body.rates, EUR: 1 }, updated_at: nowIso() };
    }
  } catch {}
  return { rates: FALLBACK_RATES, updated_at: nowIso() };
}

function historyForPair(pair: string, rate: number) {
  return Array.from({ length: 30 }, (_, i) => {
    const wobble = Math.sin(i / 3) * 0.006 + Math.cos(i / 5) * 0.004;
    return {
      t: new Date(Date.now() - (29 - i) * 86400000).toISOString(),
      v: Number((rate * (1 + wobble)).toFixed(6)),
    };
  });
}

function sortByDateDesc(items: any[]) {
  return items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export async function firebaseDirectRequest(path: string, opts: RequestInit = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const body = parseBody(opts);
  const url = new URL(path, "https://fxpro.local");
  const pathname = url.pathname;

  if (pathname === "/auth/register" && method === "POST") {
    const cred = await createUserWithEmailAndPassword(auth, body.email, body.password);
    await updateProfile(cred.user, { displayName: body.name }).catch(() => undefined);
    const profile = await ensureUserDoc(cred.user, { name: body.name, phone: body.phone, email: body.email });
    return tokenAndUser(cred.user, profile);
  }

  if (pathname === "/auth/login" && method === "POST") {
    const cred = await signInWithEmailAndPassword(auth, body.email, body.password);
    const profile = await ensureUserDoc(cred.user);
    return tokenAndUser(cred.user, profile);
  }

  if (pathname === "/auth/google/session" && method === "POST") {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const profile = await ensureUserDoc(cred.user);
    return tokenAndUser(cred.user, profile);
  }

  if (pathname === "/auth/me") return currentProfile();

  if (pathname === "/auth/logout" && method === "POST") {
    await signOut(auth);
    return { ok: true };
  }

  if (pathname === "/rates") return getRates();

  if (pathname === "/rates/history") {
    const pair = url.searchParams.get("pair") || "EUR_XOF";
    const [from, to] = pair.split("_");
    const rates = (await getRates()).rates;
    const rate = rates[from] && rates[to] ? rates[to] / rates[from] : 1;
    return { points: historyForPair(pair, rate) };
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
    const senderNotifRef = doc(db, NOTIFS, makeId("ntf"));
    const recipientNotifRef = doc(db, NOTIFS, makeId("ntf"));
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
      if ((balances[currency] || 0) < amount) throw new Error("Solde insuffisant");
      balances[currency] = Number(((balances[currency] || 0) - amount).toFixed(4));
      recipientBalances[currency] = Number(((recipientBalances[currency] || 0) + amount).toFixed(4));
      tx.update(senderRef, { balances, updated_at: nowIso() });
      tx.update(recipientRef, { balances: recipientBalances, updated_at: nowIso() });
      tx.set(txnRef, transaction);
      tx.set(senderNotifRef, {
        notif_id: senderNotifRef.id,
        user_id: firebaseUser.uid,
        title: "Transfert envoye",
        body: `-${amount} ${currency} -> ${recipient.email}`,
        read: false,
        created_at: nowIso(),
      });
      tx.set(recipientNotifRef, {
        notif_id: recipientNotifRef.id,
        user_id: recipient.user_id,
        title: "Transfert recu",
        body: `+${amount} ${currency} de ${sender.email}`,
        read: false,
        created_at: nowIso(),
      });
    });
    return { ok: true, transaction, balances };
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

  if (pathname === "/profile" && method === "PATCH") {
    const firebaseUser = await requireFirebaseUser();
    await updateDoc(doc(db, USERS, firebaseUser.uid), { ...body, updated_at: nowIso() });
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
    const amount = Number(body.amount);
    const currency = body.currency;
    const userRef = doc(db, USERS, firebaseUser.uid);
    const vaultRef = doc(db, VAULTS, vaultId);
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
        status: "active",
        created_at: nowIso(),
      });
    });
    return { ok: true };
  }

  if (pathname.startsWith("/vault/") && pathname.endsWith("/withdraw") && method === "POST") {
    const firebaseUser = await requireFirebaseUser();
    const vaultId = pathname.split("/")[2];
    const userRef = doc(db, USERS, firebaseUser.uid);
    const vaultRef = doc(db, VAULTS, vaultId);
    let amountReturned = 0;
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
    });
    return { ok: true, amount_returned: amountReturned };
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
    balances[body.currency] = Number(((balances[body.currency] || 0) + Number(body.amount)).toFixed(4));
    await updateDoc(ref, { balances, updated_at: nowIso() });
    return { ok: true };
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
