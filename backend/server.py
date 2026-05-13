"""FX Pro 2026 — Currency conversion + P2P transfers + Admin
FastAPI backend with JWT auth, Emergent Google Auth, live rates, wallets.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from pathlib import Path
from datetime import datetime, timezone, timedelta
import os
import uuid
import logging
import asyncio
import bcrypt
import jwt
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "fxpro-secret-change-me-2026")
JWT_ALG = "HS256"
JWT_TTL_DAYS = 7

SUPPORTED_CURRENCIES = [
    "EUR", "XOF", "XAF", "USD", "GBP", "NGN", "MAD", "CAD", "CHF", "JPY", "CNY",
    "AUD", "INR", "BRL", "ZAR", "KES", "GHS", "SEK", "AED",
]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="FX Pro 2026")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("fxpro")


# ============ Helpers ============
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_jwt(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(now_utc().timestamp()),
        "exp": int((now_utc() + timedelta(days=JWT_TTL_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_jwt(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        return None


async def find_user_by_id(user_id: str) -> Optional[dict]:
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})


async def find_user_full(user_id: str) -> Optional[dict]:
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = authorization.replace("Bearer ", "").strip()

    # Try JWT first
    payload = decode_jwt(token)
    if payload:
        user = await find_user_by_id(payload["sub"])
        if user:
            if user.get("is_blocked"):
                raise HTTPException(status_code=403, detail="Account blocked")
            return user

    # Try Google session token
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if sess:
        exp = sess.get("expires_at")
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp and exp > now_utc():
            user = await find_user_by_id(sess["user_id"])
            if user:
                if user.get("is_blocked"):
                    raise HTTPException(status_code=403, detail="Account blocked")
                return user

    raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


async def send_push_to_user(
    user_id: str,
    title: str,
    body: str,
    txn_id: Optional[str] = None,
    type_: str = "notification",
    notif_id: Optional[str] = None,
):
    full = await find_user_full(user_id)
    token = (full or {}).get("push_token")
    if not token or not (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")):
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                json={
                    "to": token,
                    "title": title,
                    "body": body,
                    "data": {
                        "txn_id": txn_id or "",
                        "type": type_,
                        "url": "/notifications",
                        "notif_id": notif_id or "",
                    },
                    "sound": "default",
                    "priority": "high",
                    "badge": 1,
                    "channelId": "default",
                },
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
    except Exception as exc:
        logger.warning("Expo push failed for %s: %s", user_id, exc)


# ============ Models ============
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionIn(BaseModel):
    session_id: str


class ConvertIn(BaseModel):
    from_currency: str
    to_currency: str
    amount: float


class TransferIn(BaseModel):
    recipient: str  # email or qr_code
    by: str = "email"  # "email" | "qr"
    amount: float
    currency: str
    note: Optional[str] = None


class AdminBalanceIn(BaseModel):
    currency: str
    amount: float  # positive = credit, negative = debit


class AdminBlockIn(BaseModel):
    is_blocked: bool


class RateAlertIn(BaseModel):
    from_currency: str
    to_currency: str
    target_rate: float
    direction: str = "above"  # "above" | "below"


class PushTokenIn(BaseModel):
    token: str


class RateOverrideIn(BaseModel):
    base: str = "EUR"
    rates: Dict[str, float]


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


class VaultCreateIn(BaseModel):
    amount: float
    currency: str
    unlock_at: datetime
    label: Optional[str] = None


class CashOperationIn(BaseModel):
    amount: float
    currency: str
    method: str
    account_name: Optional[str] = None
    account_ref: Optional[str] = None
    note: Optional[str] = None


class UserSearchIn(BaseModel):
    query: str


# ============ Auth ============
@api.post("/auth/register")
async def register(data: RegisterIn):
    if data.password and len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password too short")
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    balances = {c: 0.0 for c in SUPPORTED_CURRENCIES}
    doc = {
        "user_id": user_id,
        "email": data.email.lower(),
        "name": data.name,
        "phone": data.phone or "",
        "password_hash": hash_password(data.password),
        "role": "user",
        "balances": balances,
        "is_blocked": False,
        "kyc_status": "pending",
        "picture": None,
        "auth_provider": "jwt",
        "push_token": None,
        "favorite_pairs": [["EUR", "XOF"], ["EUR", "USD"]],
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    token = make_jwt(user_id, "user")
    user = await find_user_by_id(user_id)
    return {"token": token, "user": user}


@api.post("/auth/login")
async def login(data: LoginIn):
    user = await db.users.find_one({"email": data.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Account blocked")
    token = make_jwt(user["user_id"], user.get("role", "user"))
    user.pop("password_hash", None)
    return {"token": token, "user": user}


@api.post("/auth/google/session")
async def google_session(data: GoogleSessionIn):
    """Exchange Emergent session_id for our app token + user."""
    async with httpx.AsyncClient(timeout=10) as h:
        r = await h.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": data.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    info = r.json()
    email = info.get("email", "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="No email from provider")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        if existing.get("is_blocked"):
            raise HTTPException(status_code=403, detail="Account blocked")
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        balances = {c: 0.0 for c in SUPPORTED_CURRENCIES}
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": info.get("name", email),
            "phone": "",
            "password_hash": None,
            "role": "user",
            "balances": balances,
            "is_blocked": False,
            "kyc_status": "pending",
            "picture": info.get("picture"),
            "auth_provider": "google",
            "push_token": None,
            "favorite_pairs": [["EUR", "XOF"], ["EUR", "USD"]],
            "created_at": now_utc(),
        })

    # Store session
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": info["session_token"],
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })
    user = await find_user_by_id(user_id)
    return {"token": info["session_token"], "user": user}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ============ Rates ============
async def fetch_live_rates(base: str = "EUR") -> Dict[str, float]:
    try:
        async with httpx.AsyncClient(timeout=8) as h:
            r = await h.get(f"https://open.er-api.com/v6/latest/{base}")
        if r.status_code == 200:
            data = r.json()
            rates = data.get("rates", {})
            return {c: float(rates[c]) for c in SUPPORTED_CURRENCIES if c in rates}
    except Exception as e:
        logger.warning(f"Live rates fetch failed: {e}")
    return {}


async def get_active_rates(base: str = "EUR") -> Dict[str, Any]:
    # Admin override has priority if exists & not stale older than override
    doc = await db.exchange_rates.find_one({"base": base}, {"_id": 0})
    if doc:
        # If older than 30 min and source=live, refresh
        updated = doc.get("updated_at")
        if updated and updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        if doc.get("source") == "live" and updated and (now_utc() - updated) > timedelta(minutes=30):
            live = await fetch_live_rates(base)
            if live:
                doc["rates"] = live
                doc["updated_at"] = now_utc()
                await db.exchange_rates.update_one(
                    {"base": base},
                    {"$set": {"rates": live, "updated_at": now_utc(), "source": "live"}},
                    upsert=True,
                )
        return doc
    # First time — fetch live
    live = await fetch_live_rates(base)
    if not live:
        # Fallback static
        live = {
            "EUR": 1.0, "XOF": 655.957, "XAF": 655.957, "USD": 1.08, "GBP": 0.85,
            "NGN": 1620.0, "MAD": 10.85, "CAD": 1.46, "CHF": 0.95, "JPY": 162.5, "CNY": 7.78
        }
    doc = {"base": base, "rates": live, "updated_at": now_utc(), "source": "live"}
    await db.exchange_rates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/rates")
async def rates(base: str = "EUR"):
    d = await get_active_rates(base)
    return {"base": d["base"], "rates": d["rates"], "source": d.get("source", "live"), "updated_at": d["updated_at"]}


@api.post("/rates/refresh")
async def refresh_rates(_: dict = Depends(require_admin)):
    live = await fetch_live_rates("EUR")
    if not live:
        raise HTTPException(status_code=502, detail="Live rates unavailable")
    await db.exchange_rates.update_one(
        {"base": "EUR"},
        {"$set": {"rates": live, "updated_at": now_utc(), "source": "live"}},
        upsert=True,
    )
    return {"ok": True, "rates": live}


@api.put("/rates/override")
async def override_rates(data: RateOverrideIn, _: dict = Depends(require_admin)):
    await db.exchange_rates.update_one(
        {"base": data.base},
        {"$set": {"rates": data.rates, "updated_at": now_utc(), "source": "admin"}},
        upsert=True,
    )
    return {"ok": True}


@api.get("/rates/history")
async def rates_history(pair: str = "EUR_XOF"):
    """Return synthetic 7-day history for chart (deterministic per pair)."""
    from_c, to_c = pair.split("_")
    d = await get_active_rates("EUR")
    rates = d["rates"]
    if from_c not in rates or to_c not in rates:
        raise HTTPException(status_code=400, detail="Invalid pair")
    current = rates[to_c] / rates[from_c]
    import math, hashlib
    seed = int(hashlib.md5(pair.encode()).hexdigest()[:8], 16)
    history = []
    for i in range(30):
        # gentle oscillation
        delta = math.sin((seed + i) * 0.7) * 0.02 + math.cos((seed + i) * 0.3) * 0.01
        value = current * (1 + delta)
        history.append({
            "t": (now_utc() - timedelta(days=29 - i)).isoformat(),
            "v": round(value, 6),
        })
    history.append({"t": now_utc().isoformat(), "v": round(current, 6)})
    return {"pair": pair, "current": current, "points": history}


# ============ Convert (in-wallet) ============
@api.post("/convert")
async def convert(data: ConvertIn, user: dict = Depends(get_current_user)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if data.from_currency not in SUPPORTED_CURRENCIES or data.to_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    if data.from_currency == data.to_currency:
        raise HTTPException(status_code=400, detail="Same currency")

    d = await get_active_rates("EUR")
    rates = d["rates"]
    if data.from_currency not in rates or data.to_currency not in rates:
        raise HTTPException(status_code=400, detail="Rate unavailable")
    rate = rates[data.to_currency] / rates[data.from_currency]
    received = round(data.amount * rate, 4)

    full = await find_user_full(user["user_id"])
    balances = full.get("balances", {})
    if balances.get(data.from_currency, 0) < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    balances[data.from_currency] = round(balances.get(data.from_currency, 0) - data.amount, 4)
    balances[data.to_currency] = round(balances.get(data.to_currency, 0) + received, 4)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"balances": balances}})

    txn_id = f"txn_{uuid.uuid4().hex[:12]}"
    receipt = {
        "txn_id": txn_id,
        "type": "convert",
        "user_id": user["user_id"],
        "from_currency": data.from_currency,
        "to_currency": data.to_currency,
        "amount": data.amount,
        "received": received,
        "rate": rate,
        "status": "completed",
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(receipt)
    receipt.pop("_id", None)
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "title": "Conversion réussie",
        "body": f"{data.amount} {data.from_currency} → {received} {data.to_currency}",
        "read": False,
        "created_at": now_utc(),
    })
    return {"ok": True, "transaction": receipt, "balances": balances}


# ============ Transfer P2P ============
@api.post("/transfer")
async def transfer(data: TransferIn, user: dict = Depends(get_current_user)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if data.currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Unsupported currency")

    recipient = None
    if data.by == "qr":
        recipient = await db.users.find_one({"qr_code": data.recipient}, {"_id": 0})
    else:
        recipient = await db.users.find_one({"email": data.recipient.lower()}, {"_id": 0})

    if not recipient:
        raise HTTPException(status_code=404, detail="Destinataire introuvable")
    if recipient["user_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="Impossible de se transférer à soi-même")
    if recipient.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Destinataire bloqué")

    sender = await find_user_full(user["user_id"])
    s_bal = sender.get("balances", {})
    if s_bal.get(data.currency, 0) < data.amount:
        raise HTTPException(status_code=400, detail="Solde insuffisant")

    r_bal = recipient.get("balances", {})
    s_bal[data.currency] = round(s_bal.get(data.currency, 0) - data.amount, 4)
    r_bal[data.currency] = round(r_bal.get(data.currency, 0) + data.amount, 4)
    await db.users.update_one({"user_id": sender["user_id"]}, {"$set": {"balances": s_bal}})
    await db.users.update_one({"user_id": recipient["user_id"]}, {"$set": {"balances": r_bal}})

    txn_id = f"txn_{uuid.uuid4().hex[:12]}"
    txn = {
        "txn_id": txn_id,
        "type": "transfer",
        "sender_id": sender["user_id"],
        "sender_email": sender["email"],
        "sender_name": sender.get("name"),
        "receiver_id": recipient["user_id"],
        "receiver_email": recipient["email"],
        "receiver_name": recipient.get("name"),
        "amount": data.amount,
        "currency": data.currency,
        "note": data.note or "",
        "status": "completed",
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    txn.pop("_id", None)
    sender_notif = {"notif_id": f"ntf_{uuid.uuid4().hex[:10]}", "user_id": sender["user_id"],
                    "type": "transfer", "transfer_role": "sender", "txn_id": txn_id,
                    "title": "FX Pro - Transfert envoye",
                    "body": f"{data.amount} {data.currency} envoye a {recipient.get('name') or recipient['email']}",
                    "read": False, "created_at": now_utc()}
    receiver_notif = {"notif_id": f"ntf_{uuid.uuid4().hex[:10]}", "user_id": recipient["user_id"],
                      "type": "transfer", "transfer_role": "receiver", "txn_id": txn_id,
                      "title": "FX Pro - Argent recu",
                      "body": f"{data.amount} {data.currency} recu de {sender.get('name') or sender['email']}",
                      "read": False, "created_at": now_utc()}
    await db.notifications.insert_many([sender_notif, receiver_notif])
    await asyncio.gather(
        send_push_to_user(sender["user_id"], sender_notif["title"], sender_notif["body"], txn_id, "transfer", sender_notif["notif_id"]),
        send_push_to_user(recipient["user_id"], receiver_notif["title"], receiver_notif["body"], txn_id, "transfer", receiver_notif["notif_id"]),
    )
    return {
        "ok": True,
        "transaction": txn,
        "balances": s_bal,
        "notification_ids": {"sender": sender_notif["notif_id"], "receiver": receiver_notif["notif_id"]},
    }


# ============ QR codes ============
@api.get("/qr/me")
async def my_qr(user: dict = Depends(get_current_user)):
    full = await find_user_full(user["user_id"])
    qr = full.get("qr_code")
    if not qr:
        qr = f"FXPRO:{user['user_id']}:{uuid.uuid4().hex[:8].upper()}"
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"qr_code": qr}})
    return {"qr_code": qr, "email": user["email"], "name": user.get("name")}


@api.get("/qr/lookup")
async def qr_lookup(code: str, _: dict = Depends(get_current_user)):
    u = await db.users.find_one({"qr_code": code}, {"_id": 0, "password_hash": 0, "balances": 0})
    if not u:
        raise HTTPException(status_code=404, detail="QR invalide")
    return {"user_id": u["user_id"], "email": u["email"], "name": u.get("name"), "picture": u.get("picture")}


# ============ Transactions / Receipts ============
@api.get("/transactions")
async def list_transactions(user: dict = Depends(get_current_user), limit: int = 50):
    cur = db.transactions.find({
        "$or": [
            {"user_id": user["user_id"]},
            {"sender_id": user["user_id"]},
            {"receiver_id": user["user_id"]},
        ]
    }, {"_id": 0}).sort("created_at", -1).limit(limit)
    items = await cur.to_list(limit)
    return {"items": items}


@api.get("/transactions/{txn_id}")
async def get_txn(txn_id: str, user: dict = Depends(get_current_user)):
    t = await db.transactions.find_one({"txn_id": txn_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    allowed = user["user_id"] in [t.get("user_id"), t.get("sender_id"), t.get("receiver_id")] or user["role"] == "admin"
    if not allowed:
        raise HTTPException(status_code=403, detail="Forbidden")
    return t


# ============ Notifications ============
@api.get("/notifications")
async def list_notifs(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return {"items": items}


@api.post("/notifications/read-all")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/push-token")
async def register_push(data: PushTokenIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"push_token": data.token}})
    return {"ok": True}


# ============ Deposit / Withdraw ============
@api.post("/cash/deposit")
async def cash_deposit(data: CashOperationIn, user: dict = Depends(get_current_user)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    if data.currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Devise non supportee")
    if not data.method:
        raise HTTPException(status_code=400, detail="Methode de depot requise")

    txn_id = f"txn_{uuid.uuid4().hex[:12]}"
    reference = f"DEP-{uuid.uuid4().hex[:8].upper()}"
    txn = {
        "txn_id": txn_id,
        "type": "deposit",
        "user_id": user["user_id"],
        "participants": [user["user_id"]],
        "amount": data.amount,
        "currency": data.currency,
        "method": data.method,
        "account_name": data.account_name or user.get("name"),
        "account_ref": data.account_ref or "",
        "note": data.note or "",
        "reference": reference,
        "fees": 0.0,
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "type": "deposit",
        "txn_id": txn_id,
        "title": "Depot en attente",
        "body": f"Reference {reference}: {data.amount} {data.currency} en validation.",
        "read": False,
        "created_at": now_utc(),
    })
    txn.pop("_id", None)
    return {"ok": True, "transaction": txn}


@api.post("/cash/withdraw")
async def cash_withdraw(data: CashOperationIn, user: dict = Depends(get_current_user)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    if data.currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Devise non supportee")
    if not data.method or not data.account_ref:
        raise HTTPException(status_code=400, detail="Methode et destination requises")

    full = await find_user_full(user["user_id"])
    balances = full.get("balances", {})
    if balances.get(data.currency, 0) < data.amount:
        raise HTTPException(status_code=400, detail="Solde insuffisant")

    balances[data.currency] = round(balances.get(data.currency, 0) - data.amount, 4)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"balances": balances}})

    txn_id = f"txn_{uuid.uuid4().hex[:12]}"
    reference = f"WDR-{uuid.uuid4().hex[:8].upper()}"
    txn = {
        "txn_id": txn_id,
        "type": "withdraw",
        "user_id": user["user_id"],
        "participants": [user["user_id"]],
        "amount": data.amount,
        "currency": data.currency,
        "method": data.method,
        "account_name": data.account_name or user.get("name"),
        "account_ref": data.account_ref,
        "note": data.note or "",
        "reference": reference,
        "fees": 0.0,
        "status": "pending",
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "type": "withdraw",
        "txn_id": txn_id,
        "title": "Retrait en traitement",
        "body": f"Reference {reference}: {data.amount} {data.currency} reserves pour retrait.",
        "read": False,
        "created_at": now_utc(),
    })
    txn.pop("_id", None)
    return {"ok": True, "transaction": txn, "balances": balances}


# ============ Rate Alerts ============
@api.get("/alerts")
async def list_alerts(user: dict = Depends(get_current_user)):
    items = await db.rate_alerts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"items": items}


@api.post("/alerts")
async def add_alert(data: RateAlertIn, user: dict = Depends(get_current_user)):
    alert = {
        "alert_id": f"al_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "from_currency": data.from_currency,
        "to_currency": data.to_currency,
        "target_rate": data.target_rate,
        "direction": data.direction,
        "active": True,
        "created_at": now_utc(),
    }
    await db.rate_alerts.insert_one(alert)
    alert.pop("_id", None)
    return alert


@api.delete("/alerts/{alert_id}")
async def del_alert(alert_id: str, user: dict = Depends(get_current_user)):
    await db.rate_alerts.delete_one({"alert_id": alert_id, "user_id": user["user_id"]})
    return {"ok": True}


# ============ Favorite pairs ============
@api.post("/favorites/toggle")
async def toggle_favorite(payload: Dict[str, str], user: dict = Depends(get_current_user)):
    from_c, to_c = payload.get("from_currency"), payload.get("to_currency")
    full = await find_user_full(user["user_id"])
    favs = full.get("favorite_pairs", [])
    pair = [from_c, to_c]
    if pair in favs:
        favs.remove(pair)
    else:
        favs.append(pair)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"favorite_pairs": favs}})
    return {"favorite_pairs": favs}


# ============ Profile ============
@api.patch("/profile")
async def update_profile(payload: Dict[str, Any], user: dict = Depends(get_current_user)):
    allowed = {"name", "phone", "picture", "kyc_status"}
    upd = {k: v for k, v in payload.items() if k in allowed}
    if upd:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
    return await find_user_by_id(user["user_id"])


@api.post("/profile/change-password")
async def change_password(data: ChangePasswordIn, user: dict = Depends(get_current_user)):
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nouveau mot de passe trop court (min 6 caractères)")
    full = await find_user_full(user["user_id"])
    if not full.get("password_hash"):
        raise HTTPException(status_code=400, detail="Compte Google — pas de mot de passe à changer")
    if not verify_password(data.old_password, full["password_hash"]):
        raise HTTPException(status_code=401, detail="Ancien mot de passe incorrect")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(data.new_password)}},
    )
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "title": "Mot de passe changé",
        "body": "Votre mot de passe a été modifié avec succès.",
        "read": False,
        "created_at": now_utc(),
    })
    return {"ok": True}


@api.get("/users/check")
async def check_user(email: str, user: dict = Depends(get_current_user)):
    """Validate destinataire en temps réel par email."""
    u = await db.users.find_one(
        {"email": email.lower().strip()},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "picture": 1, "is_blocked": 1},
    )
    if not u:
        return {"exists": False}
    if u.get("is_blocked"):
        return {"exists": True, "blocked": True}
    if u["user_id"] == user["user_id"]:
        return {"exists": True, "self": True, "name": u.get("name"), "email": u.get("email")}
    return {
        "exists": True,
        "name": u.get("name"),
        "email": u.get("email"),
        "picture": u.get("picture"),
    }


# ============ Vault (Coffre) ============
@api.post("/vault")
async def vault_create(data: VaultCreateIn, user: dict = Depends(get_current_user)):
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    if data.currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Devise non supportée")
    unlock_at = data.unlock_at
    if unlock_at.tzinfo is None:
        unlock_at = unlock_at.replace(tzinfo=timezone.utc)
    if unlock_at <= now_utc():
        raise HTTPException(status_code=400, detail="Date de déverrouillage doit être future")
    full = await find_user_full(user["user_id"])
    balances = full.get("balances", {})
    if balances.get(data.currency, 0) < data.amount:
        raise HTTPException(status_code=400, detail="Solde insuffisant")
    balances[data.currency] = round(balances.get(data.currency, 0) - data.amount, 4)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"balances": balances}})

    vault_id = f"vault_{uuid.uuid4().hex[:10]}"
    doc = {
        "vault_id": vault_id,
        "user_id": user["user_id"],
        "amount": data.amount,
        "currency": data.currency,
        "label": data.label or "Coffre",
        "locked_at": now_utc(),
        "unlock_at": unlock_at,
        "status": "locked",
        "created_at": now_utc(),
    }
    await db.vaults.insert_one(doc)
    doc.pop("_id", None)
    txn = {
        "txn_id": f"txn_{uuid.uuid4().hex[:12]}",
        "type": "vault_lock",
        "user_id": user["user_id"],
        "participants": [user["user_id"]],
        "amount": data.amount,
        "currency": data.currency,
        "status": "completed",
        "vault_id": vault_id,
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "title": "Coffre verrouillé 🔒",
        "body": f"{data.amount} {data.currency} verrouillés jusqu'au {unlock_at.strftime('%d/%m/%Y')}",
        "read": False,
        "created_at": now_utc(),
    })
    txn.pop("_id", None)
    return {"ok": True, "vault": doc, "balances": balances, "transaction": txn}


@api.get("/vault")
async def vault_list(user: dict = Depends(get_current_user)):
    items = await db.vaults.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    # auto-mark ready
    now = now_utc()
    for v in items:
        ua = v.get("unlock_at")
        if ua and ua.tzinfo is None:
            ua = ua.replace(tzinfo=timezone.utc)
        if v["status"] == "locked" and ua and ua <= now:
            v["status"] = "ready"
    return {"items": items}


@api.post("/vault/{vault_id}/withdraw")
async def vault_withdraw(vault_id: str, user: dict = Depends(get_current_user)):
    v = await db.vaults.find_one({"vault_id": vault_id, "user_id": user["user_id"]}, {"_id": 0})
    if not v:
        raise HTTPException(status_code=404, detail="Coffre introuvable")
    if v["status"] == "withdrawn":
        raise HTTPException(status_code=400, detail="Déjà retiré")
    ua = v["unlock_at"]
    if ua.tzinfo is None:
        ua = ua.replace(tzinfo=timezone.utc)
    penalty = 0.0
    amount_back = v["amount"]
    if ua > now_utc():
        # Early withdrawal: 5% penalty
        penalty = round(v["amount"] * 0.05, 4)
        amount_back = round(v["amount"] - penalty, 4)
    full = await find_user_full(user["user_id"])
    balances = full.get("balances", {})
    balances[v["currency"]] = round(balances.get(v["currency"], 0) + amount_back, 4)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"balances": balances}})
    await db.vaults.update_one(
        {"vault_id": vault_id},
        {"$set": {"status": "withdrawn", "withdrawn_at": now_utc(), "penalty": penalty, "returned": amount_back}},
    )
    txn = {
        "txn_id": f"txn_{uuid.uuid4().hex[:12]}",
        "type": "vault_withdraw",
        "user_id": user["user_id"],
        "participants": [user["user_id"]],
        "amount": amount_back,
        "currency": v["currency"],
        "status": "completed",
        "vault_id": vault_id,
        "penalty": penalty,
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "title": penalty > 0 and "Retrait anticipé 🔓" or "Coffre déverrouillé 🔓",
        "body": penalty > 0
            and f"+{amount_back} {v['currency']} (pénalité {penalty})"
            or f"+{amount_back} {v['currency']}",
        "read": False,
        "created_at": now_utc(),
    })
    txn.pop("_id", None)
    return {"ok": True, "amount_returned": amount_back, "penalty": penalty, "balances": balances, "transaction": txn}


# ============ Admin ============
@api.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    users_count = await db.users.count_documents({})
    txn_count = await db.transactions.count_documents({})
    blocked = await db.users.count_documents({"is_blocked": True})
    last_txns = await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    return {
        "users": users_count,
        "transactions": txn_count,
        "blocked": blocked,
        "recent_transactions": last_txns,
    }


@api.get("/admin/users")
async def admin_users(_: dict = Depends(require_admin), search: str = ""):
    q = {}
    if search:
        q = {"$or": [
            {"email": {"$regex": search, "$options": "i"}},
            {"name": {"$regex": search, "$options": "i"}},
        ]}
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"items": users}


@api.patch("/admin/users/{user_id}/balance")
async def admin_balance(user_id: str, data: AdminBalanceIn, _: dict = Depends(require_admin)):
    if data.currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    u = await find_user_full(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    balances = u.get("balances", {})
    new_val = round(balances.get(data.currency, 0) + data.amount, 4)
    if new_val < 0:
        raise HTTPException(status_code=400, detail="Balance ne peut être négatif")
    balances[data.currency] = new_val
    await db.users.update_one({"user_id": user_id}, {"$set": {"balances": balances}})
    # Log
    txn_id = f"txn_{uuid.uuid4().hex[:12]}"
    txn = {
        "txn_id": txn_id,
        "type": "admin_credit" if data.amount > 0 else "admin_debit",
        "user_id": user_id,
        "amount": abs(data.amount),
        "currency": data.currency,
        "status": "completed",
        "created_at": now_utc(),
    }
    await db.transactions.insert_one(txn)
    await db.notifications.insert_one({
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "title": "Solde mis à jour par l'admin",
        "body": f"{'+' if data.amount > 0 else ''}{data.amount} {data.currency}",
        "read": False,
        "created_at": now_utc(),
    })
    return {"ok": True, "balances": balances}


@api.patch("/admin/users/{user_id}/block")
async def admin_block(user_id: str, data: AdminBlockIn, _: dict = Depends(require_admin)):
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_blocked": data.is_blocked}})
    return {"ok": True}


@api.delete("/admin/users/{user_id}")
async def admin_delete(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete self")
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}


# ============ Seeding ============
@app.on_event("startup")
async def startup_seed():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.transactions.create_index("created_at")

    # Seed admin
    admin = await db.users.find_one({"email": "admin@fxpro.com"})
    if not admin:
        balances = {c: 0.0 for c in SUPPORTED_CURRENCIES}
        balances["EUR"] = 10000.0
        balances["XOF"] = 5000000.0
        balances["USD"] = 10000.0
        await db.users.insert_one({
            "user_id": "user_admin000001",
            "email": "admin@fxpro.com",
            "name": "Admin FX Pro",
            "phone": "",
            "password_hash": hash_password("Admin@2026"),
            "role": "admin",
            "balances": balances,
            "is_blocked": False,
            "kyc_status": "verified",
            "picture": None,
            "auth_provider": "jwt",
            "push_token": None,
            "favorite_pairs": [["EUR", "XOF"]],
            "qr_code": "FXPRO:user_admin000001:ADMINQR1",
            "created_at": now_utc(),
        })
        logger.info("Seeded admin user admin@fxpro.com / Admin@2026")

    # Seed a demo user
    demo = await db.users.find_one({"email": "demo@fxpro.com"})
    if not demo:
        balances = {c: 0.0 for c in SUPPORTED_CURRENCIES}
        balances["EUR"] = 500.0
        balances["XOF"] = 200000.0
        balances["USD"] = 200.0
        await db.users.insert_one({
            "user_id": "user_demo00000001",
            "email": "demo@fxpro.com",
            "name": "Demo User",
            "phone": "",
            "password_hash": hash_password("Demo@2026"),
            "role": "user",
            "balances": balances,
            "is_blocked": False,
            "kyc_status": "verified",
            "picture": None,
            "auth_provider": "jwt",
            "push_token": None,
            "favorite_pairs": [["EUR", "XOF"], ["EUR", "USD"]],
            "qr_code": "FXPRO:user_demo00000001:DEMOQR99",
            "created_at": now_utc(),
        })
        logger.info("Seeded demo user demo@fxpro.com / Demo@2026")

    # Prime rates
    try:
        await get_active_rates("EUR")
    except Exception as e:
        logger.warning(f"Rate prime failed: {e}")


@api.get("/")
async def root():
    return {"app": "FX Pro 2026", "version": "1.0.0", "currencies": SUPPORTED_CURRENCIES}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
