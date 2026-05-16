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
import hashlib
import math
from pymongo import ReturnDocument

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

RATE_CACHE_MINUTES = int(os.environ.get("FX_RATE_CACHE_MINUTES", "30"))
OPEN_ER_API_BASE = "https://open.er-api.com/v6/latest"
FRANKFURTER_RATES_API = "https://api.frankfurter.dev/v2/rates"
FALLBACK_RATES = {
    "EUR": 1.0, "XOF": 655.957, "XAF": 655.957, "USD": 1.08, "GBP": 0.86,
    "NGN": 1600.0, "MAD": 10.8, "CAD": 1.47, "CHF": 0.95, "JPY": 170.0,
    "CNY": 7.8, "AUD": 1.65, "INR": 90.0, "BRL": 5.9, "ZAR": 20.0,
    "KES": 140.0, "GHS": 13.0, "SEK": 11.4, "AED": 3.95,
}

BONUS_MIN_WINDOW_DAYS = 7
BONUS_MAX_WINDOW_DAYS = 30
DEFAULT_BONUS_COUNTRY = "CI"

BONUS_COUNTRIES = [
    {"code": "CI", "name": "Cote d'Ivoire", "currency": "XOF", "settlement": "7 a 30 jours", "compliance": "Mobile Money, carte, virement et validation KYC conseillee."},
    {"code": "SN", "name": "Senegal", "currency": "XOF", "settlement": "7 a 30 jours", "compliance": "Compte personnel requis, paiement trace uniquement."},
    {"code": "CM", "name": "Cameroun", "currency": "XAF", "settlement": "7 a 30 jours", "compliance": "Mobile Money et virement bancaire sous controle interne."},
    {"code": "GA", "name": "Gabon", "currency": "XAF", "settlement": "7 a 30 jours", "compliance": "Verification anti-abus avant attribution."},
    {"code": "FR", "name": "France", "currency": "EUR", "settlement": "7 a 30 jours", "compliance": "SEPA/carte, controle KYC renforce pour gros montants."},
    {"code": "US", "name": "Etats-Unis", "currency": "USD", "settlement": "7 a 30 jours", "compliance": "Carte ou virement, controle d'identite recommande."},
    {"code": "GB", "name": "Royaume-Uni", "currency": "GBP", "settlement": "7 a 30 jours", "compliance": "Compte bancaire au nom du titulaire requis."},
    {"code": "NG", "name": "Nigeria", "currency": "NGN", "settlement": "7 a 30 jours", "compliance": "Verification compte, appareil et historique d'activite."},
    {"code": "MA", "name": "Maroc", "currency": "MAD", "settlement": "7 a 30 jours", "compliance": "Validation interne avant bonus ou retrait sensible."},
    {"code": "ZA", "name": "Afrique du Sud", "currency": "ZAR", "settlement": "7 a 30 jours", "compliance": "Controle KYC et anti-fraude sur moyens de paiement."},
    {"code": "KE", "name": "Kenya", "currency": "KES", "settlement": "7 a 30 jours", "compliance": "Mobile wallet et historique compte analyses."},
    {"code": "GH", "name": "Ghana", "currency": "GHS", "settlement": "7 a 30 jours", "compliance": "Controle du premier depot recu confirme uniquement."},
]

XOF_BONUS_TIERS = [
    {"threshold": 10000, "bonus": 3000, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.30},
    {"threshold": 20000, "bonus": 8000, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.40},
    {"threshold": 30000, "bonus": 13000, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.50},
    {"threshold": 50000, "bonus": 22000, "label": "Elite 50K", "rarity": "Traitement renforce", "baseProbability": 0.62},
    {"threshold": 100000, "bonus": 50000, "label": "Gold 100K", "rarity": "Acces rare", "baseProbability": 0.75},
    {"threshold": 250000, "bonus": 140000, "label": "VIP 250K", "rarity": "Fenetre prioritaire", "baseProbability": 0.88},
]

BONUS_CATALOG = {
    "XOF": XOF_BONUS_TIERS,
    "XAF": XOF_BONUS_TIERS,
    "EUR": [
        {"threshold": 25, "bonus": 8, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.30},
        {"threshold": 50, "bonus": 20, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.40},
        {"threshold": 100, "bonus": 45, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.52},
        {"threshold": 250, "bonus": 125, "label": "Elite", "rarity": "Traitement renforce", "baseProbability": 0.66},
        {"threshold": 500, "bonus": 280, "label": "Gold", "rarity": "Acces rare", "baseProbability": 0.78},
        {"threshold": 1000, "bonus": 620, "label": "VIP", "rarity": "Fenetre prioritaire", "baseProbability": 0.90},
    ],
    "USD": [
        {"threshold": 25, "bonus": 7, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.30},
        {"threshold": 50, "bonus": 18, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.40},
        {"threshold": 100, "bonus": 42, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.52},
        {"threshold": 250, "bonus": 120, "label": "Elite", "rarity": "Traitement renforce", "baseProbability": 0.66},
        {"threshold": 500, "bonus": 260, "label": "Gold", "rarity": "Acces rare", "baseProbability": 0.78},
        {"threshold": 1000, "bonus": 600, "label": "VIP", "rarity": "Fenetre prioritaire", "baseProbability": 0.90},
    ],
    "GBP": [
        {"threshold": 20, "bonus": 6, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.30},
        {"threshold": 40, "bonus": 15, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.40},
        {"threshold": 85, "bonus": 35, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.52},
        {"threshold": 200, "bonus": 95, "label": "Elite", "rarity": "Traitement renforce", "baseProbability": 0.66},
        {"threshold": 400, "bonus": 210, "label": "Gold", "rarity": "Acces rare", "baseProbability": 0.78},
        {"threshold": 850, "bonus": 500, "label": "VIP", "rarity": "Fenetre prioritaire", "baseProbability": 0.90},
    ],
    "NGN": [
        {"threshold": 20000, "bonus": 6000, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.28},
        {"threshold": 50000, "bonus": 18000, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.39},
        {"threshold": 100000, "bonus": 45000, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.51},
        {"threshold": 250000, "bonus": 130000, "label": "Elite", "rarity": "Traitement renforce", "baseProbability": 0.64},
        {"threshold": 500000, "bonus": 280000, "label": "Gold", "rarity": "Acces rare", "baseProbability": 0.77},
        {"threshold": 1000000, "bonus": 650000, "label": "VIP", "rarity": "Fenetre prioritaire", "baseProbability": 0.88},
    ],
    "MAD": [
        {"threshold": 250, "bonus": 75, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.30},
        {"threshold": 500, "bonus": 200, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.40},
        {"threshold": 1000, "bonus": 450, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.52},
        {"threshold": 2500, "bonus": 1250, "label": "Elite", "rarity": "Traitement renforce", "baseProbability": 0.66},
        {"threshold": 5000, "bonus": 2800, "label": "Gold", "rarity": "Acces rare", "baseProbability": 0.78},
        {"threshold": 10000, "bonus": 6200, "label": "VIP", "rarity": "Fenetre prioritaire", "baseProbability": 0.90},
    ],
    "ZAR": [
        {"threshold": 500, "bonus": 150, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.30},
        {"threshold": 1000, "bonus": 400, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.40},
        {"threshold": 2000, "bonus": 900, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.52},
        {"threshold": 5000, "bonus": 2500, "label": "Elite", "rarity": "Traitement renforce", "baseProbability": 0.66},
        {"threshold": 10000, "bonus": 5600, "label": "Gold", "rarity": "Acces rare", "baseProbability": 0.78},
        {"threshold": 20000, "bonus": 12400, "label": "VIP", "rarity": "Fenetre prioritaire", "baseProbability": 0.90},
    ],
    "KES": [
        {"threshold": 3500, "bonus": 1000, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.30},
        {"threshold": 7000, "bonus": 2800, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.40},
        {"threshold": 14000, "bonus": 6200, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.52},
        {"threshold": 35000, "bonus": 17500, "label": "Elite", "rarity": "Traitement renforce", "baseProbability": 0.66},
        {"threshold": 70000, "bonus": 39000, "label": "Gold", "rarity": "Acces rare", "baseProbability": 0.78},
        {"threshold": 140000, "bonus": 86000, "label": "VIP", "rarity": "Fenetre prioritaire", "baseProbability": 0.90},
    ],
    "GHS": [
        {"threshold": 300, "bonus": 90, "label": "Starter", "rarity": "Acces limite", "baseProbability": 0.30},
        {"threshold": 650, "bonus": 250, "label": "Momentum", "rarity": "Priorite basse", "baseProbability": 0.40},
        {"threshold": 1300, "bonus": 580, "label": "Prime", "rarity": "Selection active", "baseProbability": 0.52},
        {"threshold": 3200, "bonus": 1600, "label": "Elite", "rarity": "Traitement renforce", "baseProbability": 0.66},
        {"threshold": 6500, "bonus": 3600, "label": "Gold", "rarity": "Acces rare", "baseProbability": 0.78},
        {"threshold": 13000, "bonus": 8000, "label": "VIP", "rarity": "Fenetre prioritaire", "baseProbability": 0.90},
    ],
}

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="FX Pro 2026")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("fxpro")


# ============ Helpers ============
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def clamp(value: float, min_value: float = 0, max_value: float = 100) -> float:
    return max(min_value, min(max_value, value))


def bonus_country(code: Optional[str] = None, currency: Optional[str] = None) -> dict:
    if code:
        for item in BONUS_COUNTRIES:
            if item["code"] == code:
                return item
    if currency:
        for item in BONUS_COUNTRIES:
            if item["currency"] == currency:
                return item
    return next(item for item in BONUS_COUNTRIES if item["code"] == DEFAULT_BONUS_COUNTRY)


def bonus_catalog(country_code: Optional[str] = None, currency: Optional[str] = None) -> List[dict]:
    country = bonus_country(country_code, currency)
    return BONUS_CATALOG.get(currency or country["currency"], BONUS_CATALOG["USD"])


def select_bonus_tier(amount: float, country_code: Optional[str], currency: str) -> Optional[dict]:
    tiers = bonus_catalog(country_code, currency)
    eligible = [tier for tier in tiers if amount >= tier["threshold"]]
    return eligible[-1] if eligible else None


def stable_random(seed: str) -> float:
    digest = hashlib.sha256(seed.encode()).hexdigest()
    return int(digest[:10], 16) % 1000000 / 1000000


def compute_trust_score(user: dict, txns: List[dict], risk_flags: List[str]) -> int:
    created_at = user.get("created_at") or now_utc()
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_days = max(0, (now_utc() - created_at).days)
    login_count = float(user.get("login_count", 1) or 1)
    volume = sum(abs(float(t.get("amount") or t.get("received") or 0)) for t in txns if t.get("status") in ["completed", "credited"])
    volume_score = clamp(math.log10(max(1, volume)) * 10, 0, 20)
    kyc = 18 if user.get("kyc_status") == "verified" else 8 if user.get("kyc_status") == "review" else 0
    penalty = min(32, len(risk_flags) * 8)
    score = 24 + clamp(age_days, 0, 365) / 10 + clamp(login_count, 0, 80) / 6 + clamp(len(txns), 0, 80) / 5 + volume_score + kyc - penalty
    return int(round(clamp(score)))


def loyalty_status(score: int, volume: float) -> str:
    if score >= 86 and volume >= 100000:
        return "VIP"
    if score >= 78:
        return "Platinum"
    if score >= 66:
        return "Gold"
    if score >= 52:
        return "Silver"
    return "Standard"


def payout_window_days(seed: str, status: str) -> int:
    ranges = {
        "Standard": (21, 30),
        "Silver": (16, 26),
        "Gold": (12, 22),
        "Platinum": (9, 18),
        "VIP": (7, 14),
    }
    min_days, max_days = ranges.get(status, (21, 30))
    roll = stable_random(seed + ":payout-window")
    value = int(min_days + roll * (max_days - min_days + 1))
    return max(BONUS_MIN_WINDOW_DAYS, min(BONUS_MAX_WINDOW_DAYS, value))


def build_bonus_risk_flags(user: dict, txns: List[dict]) -> List[str]:
    flags = []
    pending_deposits = len([t for t in txns if t.get("type") == "deposit" and t.get("status") == "pending"])
    refused_deposits = len([t for t in txns if t.get("type") == "deposit" and t.get("status") in ["failed", "cancelled", "refused"]])
    micro_deposits = len([t for t in txns if t.get("type") == "deposit" and 0 < float(t.get("amount", 0)) < 1000])
    withdrawals = len([t for t in txns if t.get("type") == "withdraw"])
    if pending_deposits >= 4:
        flags.append("pending_deposit_spam")
    if refused_deposits >= 2:
        flags.append("refused_deposit_pattern")
    if micro_deposits >= 3:
        flags.append("micro_deposit_testing")
    if withdrawals >= 5 and len(txns) < 12:
        flags.append("fast_withdrawal_pattern")
    if user.get("kyc_status") != "verified":
        flags.append("kyc_not_verified")
    if user.get("is_blocked"):
        flags.append("blocked_account")
    return flags


def normalize_received_deposit(txn: dict, user_id: str) -> Optional[dict]:
    if not txn or txn.get("status") != "completed":
        return None
    if txn.get("type") == "deposit" and txn.get("user_id") == user_id:
        item = {**txn, "bonus_source": "deposit_confirmed"}
        item["created_at"] = txn.get("confirmed_at") or txn.get("created_at")
        return item
    if txn.get("type") == "transfer" and txn.get("receiver_id") == user_id:
        return {
            **txn,
            "bonus_source": "transfer_received",
            "user_id": user_id,
            "confirmed_at": txn.get("created_at"),
        }
    if txn.get("type") == "admin_credit" and txn.get("user_id") == user_id:
        return {**txn, "bonus_source": "admin_credit_received", "confirmed_at": txn.get("created_at")}
    return None


def bonus_sort_timestamp(item: dict) -> float:
    value = item.get("created_at") or item.get("confirmed_at") or now_utc()
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.timestamp()


def first_received_deposit(txns: List[dict], user_id: str) -> Optional[dict]:
    candidates = [item for item in (normalize_received_deposit(txn, user_id) for txn in txns) if item]
    candidates.sort(key=bonus_sort_timestamp)
    return candidates[0] if candidates else None


def build_bonus_evaluation(user: dict, txns: List[dict], deposit: dict, country_code: Optional[str] = None) -> dict:
    amount = float(deposit.get("amount") or 0)
    currency = deposit.get("currency")
    country = bonus_country(country_code or user.get("bonus_country"), currency)
    tier = select_bonus_tier(amount, country["code"], currency)
    risk_flags = build_bonus_risk_flags(user, txns)
    volume = sum(abs(float(t.get("amount") or t.get("received") or 0)) for t in txns if t.get("status") in ["completed", "credited"])
    trust = compute_trust_score(user, txns, risk_flags)
    status = loyalty_status(trust, volume)
    seed = f"{user['user_id']}:{deposit['txn_id']}:{amount}:{currency}"
    approval_roll = round(stable_random(seed + ":approval"), 4)
    confirmed_at = deposit.get("confirmed_at") or deposit.get("created_at") or now_utc()
    if isinstance(confirmed_at, str):
        confirmed_at = datetime.fromisoformat(confirmed_at.replace("Z", "+00:00"))
    if confirmed_at.tzinfo is None:
        confirmed_at = confirmed_at.replace(tzinfo=timezone.utc)
    base = {
        "bonus_id": f"bonus_{user['user_id']}",
        "user_id": user["user_id"],
        "country": country["code"],
        "currency": currency,
        "loyalty_status": status,
        "trust_score": trust,
        "approval_roll": approval_roll,
        "first_deposit_locked": True,
        "first_deposit_txn_id": deposit["txn_id"],
        "first_deposit_amount": amount,
        "first_deposit_currency": currency,
        "first_deposit_confirmed_at": confirmed_at,
        "risk_flags": risk_flags,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    if not tier:
        base.update({
            "status": "refused",
            "eligible": False,
            "reason": "Premier depot recu confirme sous le minimum du catalogue bonus.",
            "probability": 0,
            "will_approve": False,
        })
        return base
    status_boost = {"Standard": 0, "Silver": 0.05, "Gold": 0.10, "Platinum": 0.15, "VIP": 0.20}.get(status, 0)
    probability = round(clamp(tier["baseProbability"] + trust / 1000 + status_boost, 0.08, 0.96), 4)
    days = payout_window_days(seed, status)
    credit_at = confirmed_at + timedelta(days=days)
    review_at = confirmed_at + timedelta(days=max(BONUS_MIN_WINDOW_DAYS, days - 1))
    base.update({
        "status": "analysis",
        "eligible": True,
        "reason": "Compte eligible: premier depot recu confirme verrouille et en analyse interne.",
        "probability": probability,
        "will_approve": approval_roll <= probability and len(risk_flags) < 3,
        "selected_threshold": tier["threshold"],
        "bonus_amount": tier["bonus"],
        "payout_window_days": days,
        "review_at": review_at,
        "estimated_credit_at": credit_at,
    })
    return base


def next_bonus_status(current: Optional[dict]) -> Optional[str]:
    if not current or current.get("status") in ["credited", "refused"]:
        return current.get("status") if current else None
    now = now_utc()
    review_at = current.get("review_at")
    credit_at = current.get("estimated_credit_at")
    if isinstance(review_at, str):
        review_at = datetime.fromisoformat(review_at.replace("Z", "+00:00"))
    if isinstance(credit_at, str):
        credit_at = datetime.fromisoformat(credit_at.replace("Z", "+00:00"))
    if review_at and review_at.tzinfo is None:
        review_at = review_at.replace(tzinfo=timezone.utc)
    if credit_at and credit_at.tzinfo is None:
        credit_at = credit_at.replace(tzinfo=timezone.utc)
    if current.get("status") == "analysis" and review_at and now >= review_at:
        return "approved" if current.get("will_approve") else "refused"
    if current.get("status") == "approved" and credit_at and now >= credit_at:
        return "credited"
    if current.get("status") == "analysis" and credit_at and now >= credit_at:
        return "credited" if current.get("will_approve") else "refused"
    return current.get("status")


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


class BonusCountryIn(BaseModel):
    country: str


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
        "bonus_country": DEFAULT_BONUS_COUNTRY,
        "trust_score": 24,
        "login_count": 1,
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
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"login_count": 1}, "$set": {"last_login_at": now_utc()}})
    user["login_count"] = int(user.get("login_count", 0)) + 1
    user["last_login_at"] = now_utc()
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
            "bonus_country": DEFAULT_BONUS_COUNTRY,
            "trust_score": 24,
            "login_count": 1,
            "created_at": now_utc(),
        })

    # Store session
    await db.users.update_one({"user_id": user_id}, {"$inc": {"login_count": 1}, "$set": {"last_login_at": now_utc()}})
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
def parse_rate_timestamp(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return now_utc()
    return now_utc()


async def fetch_live_rate_payload(base: str = "EUR") -> Dict[str, Any]:
    code = base.upper()
    try:
        async with httpx.AsyncClient(timeout=8) as h:
            r = await h.get(f"{OPEN_ER_API_BASE}/{code}")
        if r.status_code == 200:
            data = r.json()
            rates = data.get("rates", {})
            clean_rates = {c: float(rates[c]) for c in SUPPORTED_CURRENCIES if c in rates}
            if code in SUPPORTED_CURRENCIES:
                clean_rates[code] = 1.0
            if clean_rates:
                return {
                    "base": code,
                    "rates": clean_rates,
                    "updated_at": parse_rate_timestamp(data.get("time_last_update_unix")),
                    "source": "live",
                    "provider": data.get("provider") or "ExchangeRate-API",
                    "next_update_at": data.get("time_next_update_utc"),
                }
    except Exception as e:
        logger.warning(f"Live rates fetch failed: {e}")
    return {}


async def fetch_live_rates(base: str = "EUR") -> Dict[str, float]:
    payload = await fetch_live_rate_payload(base)
    return payload.get("rates", {})


async def get_active_rates(base: str = "EUR") -> Dict[str, Any]:
    base = base.upper()
    # Admin override has priority if exists & not stale older than override
    doc = await db.exchange_rates.find_one({"base": base}, {"_id": 0})
    if doc:
        # If older than the cache window and source=live, refresh.
        updated = doc.get("updated_at")
        if updated and updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        if doc.get("source") == "live" and updated and (now_utc() - updated) > timedelta(minutes=RATE_CACHE_MINUTES):
            live_payload = await fetch_live_rate_payload(base)
            if live_payload:
                doc.update(live_payload)
                await db.exchange_rates.update_one(
                    {"base": base},
                    {"$set": live_payload},
                    upsert=True,
                )
        return doc
    # First time: fetch live, then keep a labelled fallback if the provider is down.
    live_payload = await fetch_live_rate_payload(base)
    doc = live_payload or {
        "base": base.upper(),
        "rates": {c: FALLBACK_RATES[c] for c in SUPPORTED_CURRENCIES if c in FALLBACK_RATES},
        "updated_at": now_utc(),
        "source": "fallback",
        "provider": "FX Pro fallback",
        "next_update_at": None,
    }
    await db.exchange_rates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/rates")
async def rates(base: str = "EUR"):
    d = await get_active_rates(base)
    return {
        "base": d["base"],
        "rates": d["rates"],
        "source": d.get("source", "live"),
        "provider": d.get("provider", "ExchangeRate-API"),
        "updated_at": d["updated_at"],
        "next_update_at": d.get("next_update_at"),
    }


@api.post("/rates/refresh")
async def refresh_rates(_: dict = Depends(require_admin)):
    live_payload = await fetch_live_rate_payload("EUR")
    if not live_payload:
        raise HTTPException(status_code=502, detail="Live rates unavailable")
    await db.exchange_rates.update_one(
        {"base": "EUR"},
        {"$set": live_payload},
        upsert=True,
    )
    return {"ok": True, **live_payload}


@api.put("/rates/override")
async def override_rates(data: RateOverrideIn, _: dict = Depends(require_admin)):
    await db.exchange_rates.update_one(
        {"base": data.base},
        {"$set": {"rates": data.rates, "updated_at": now_utc(), "source": "admin"}},
        upsert=True,
    )
    return {"ok": True}


async def fetch_rate_history(from_c: str, to_c: str, days: int = 30) -> List[dict]:
    start = (now_utc() - timedelta(days=days)).date().isoformat()
    end = now_utc().date().isoformat()
    try:
        async with httpx.AsyncClient(timeout=5) as h:
            r = await h.get(
                FRANKFURTER_RATES_API,
                params={"from": start, "to": end, "base": from_c, "quotes": to_c},
            )
        if r.status_code != 200:
            return []
        data = r.json()
        rows: List[dict] = []
        if isinstance(data, list):
            for item in data:
                if item.get("quote") == to_c and item.get("rate") is not None:
                    rows.append({"t": item.get("date"), "v": round(float(item["rate"]), 6)})
        elif isinstance(data, dict) and isinstance(data.get("rates"), dict):
            for date_key, rate_map in data["rates"].items():
                if isinstance(rate_map, dict) and rate_map.get(to_c) is not None:
                    rows.append({"t": date_key, "v": round(float(rate_map[to_c]), 6)})
        return sorted([row for row in rows if row.get("t")], key=lambda row: row["t"])
    except Exception as e:
        logger.warning("Rate history fetch failed for %s/%s: %s", from_c, to_c, e)
        return []


def fallback_rate_history(pair: str, current: float) -> List[dict]:
    history = []
    for i in range(30):
        history.append({
            "t": (now_utc() - timedelta(days=29 - i)).isoformat(),
            "v": round(current, 6),
        })
    history.append({"t": now_utc().isoformat(), "v": round(current, 6)})
    return history


@api.get("/rates/history")
async def rates_history(pair: str = "EUR_XOF"):
    """Return real reference history when available, with a labelled fallback."""
    parts = pair.upper().split("_")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid pair")
    from_c, to_c = parts
    d = await get_active_rates("EUR")
    rates = d["rates"]
    if from_c not in rates or to_c not in rates:
        raise HTTPException(status_code=400, detail="Invalid pair")
    current = rates[to_c] / rates[from_c]
    history = await fetch_rate_history(from_c, to_c)
    if len(history) >= 2:
        current = history[-1]["v"]
        return {"pair": pair, "current": current, "points": history[-31:], "source": "frankfurter"}
    return {"pair": pair, "current": current, "points": fallback_rate_history(pair, current), "source": "latest-live"}


# ============ Bonus program ============
def bonus_history(doc: Optional[dict]) -> List[dict]:
    if not doc or not doc.get("first_deposit_locked"):
        return []
    items = [{
        "label": "Premier depot verrouille",
        "status": "done",
        "date": doc.get("first_deposit_confirmed_at"),
        "body": f"{doc.get('first_deposit_amount')} {doc.get('first_deposit_currency')}",
    }]
    if doc.get("status") in ["analysis", "approved", "credited"]:
        items.append({"label": "Analyse interne", "status": "active" if doc.get("status") == "analysis" else "done", "date": doc.get("review_at"), "body": doc.get("reason")})
    if doc.get("status") in ["approved", "credited"]:
        items.append({"label": "Bonus approuve", "status": "active" if doc.get("status") == "approved" else "done", "date": doc.get("reviewed_at") or doc.get("review_at"), "body": f"{doc.get('bonus_amount', 0)} {doc.get('currency')}"})
    if doc.get("status") == "credited":
        items.append({"label": "Bonus credite", "status": "done", "date": doc.get("credited_at"), "body": f"{doc.get('bonus_amount', 0)} {doc.get('currency')}"})
    if doc.get("status") == "refused":
        items.append({"label": "Bonus refuse", "status": "blocked", "date": doc.get("reviewed_at") or doc.get("updated_at"), "body": doc.get("reason")})
    return items


async def user_transactions(user_id: str) -> List[dict]:
    return await db.transactions.find({
        "$or": [
            {"user_id": user_id},
            {"sender_id": user_id},
            {"receiver_id": user_id},
            {"participants": user_id},
        ]
    }, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)


async def notify_bonus(user_id: str, bonus: dict):
    notif_id = f"ntf_{uuid.uuid4().hex[:10]}"
    eligible = bonus.get("eligible") and bonus.get("status") != "refused"
    title = "Bonus eligible" if eligible else "Bonus non eligible"
    body = (
        f"Premier depot recu confirme. Bonus potentiel {bonus.get('bonus_amount', 0)} {bonus.get('currency')} en analyse pendant {bonus.get('payout_window_days', 30)} jours."
        if eligible else bonus.get("reason", "Le premier depot recu confirme ne respecte pas les conditions.")
    )
    await db.notifications.insert_one({
        "notif_id": notif_id,
        "user_id": user_id,
        "type": "bonus",
        "bonus_id": bonus.get("bonus_id"),
        "title": title,
        "body": body,
        "read": False,
        "created_at": now_utc(),
    })
    await send_push_to_user(user_id, title, body, type_="bonus", notif_id=notif_id)


async def lock_bonus_if_needed(user: dict):
    user_id = user["user_id"]
    current = await db.bonus_program.find_one({"user_id": user_id}, {"_id": 0})
    if current and current.get("first_deposit_locked"):
        return current

    txns = await user_transactions(user_id)
    first_deposit = first_received_deposit(txns, user_id)
    if not first_deposit:
        country = bonus_country(user.get("bonus_country"))
        pending = {
            "bonus_id": f"bonus_{user_id}",
            "user_id": user_id,
            "country": country["code"],
            "currency": country["currency"],
            "status": "pending",
            "eligible": False,
            "reason": "En attente du premier depot recu confirme.",
            "first_deposit_locked": False,
            "risk_flags": build_bonus_risk_flags(user, txns),
            "created_at": current.get("created_at") if current else now_utc(),
            "updated_at": now_utc(),
        }
        await db.bonus_program.update_one({"user_id": user_id}, {"$set": pending}, upsert=True)
        return pending

    evaluation = build_bonus_evaluation(user, txns, first_deposit, user.get("bonus_country"))
    updated = await db.bonus_program.find_one_and_update(
        {
            "user_id": user_id,
            "$or": [
                {"first_deposit_locked": {"$exists": False}},
                {"first_deposit_locked": False},
            ],
        },
        {"$set": evaluation, "$setOnInsert": {"bonus_id": evaluation["bonus_id"], "user_id": user_id}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
        projection={"_id": 0},
    )
    await db.bonus_events.insert_one({
        "event_id": f"bne_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "bonus_id": evaluation["bonus_id"],
        "type": "first_received_deposit_eligible" if evaluation.get("eligible") else "first_received_deposit_refused",
        "txn_id": first_deposit["txn_id"],
        "created_at": now_utc(),
    })
    await db.risk_logs.insert_one({
        "event_id": f"rsk_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "type": "bonus_first_received_deposit_scan",
        "flags": evaluation.get("risk_flags", []),
        "trust_score": evaluation.get("trust_score", 0),
        "created_at": now_utc(),
    })
    await notify_bonus(user_id, evaluation)
    return updated


async def advance_bonus_if_needed(user_id: str):
    current = await db.bonus_program.find_one({"user_id": user_id}, {"_id": 0})
    next_status = next_bonus_status(current)
    if not current or not next_status or next_status == current.get("status"):
        return current

    patch = {"status": next_status, "updated_at": now_utc()}
    if next_status in ["approved", "refused"]:
        patch["reviewed_at"] = now_utc()
    if next_status == "refused":
        patch["reason"] = current.get("reason") or "Bonus refuse apres analyse de securite."

    if next_status == "credited" and not current.get("credited_at"):
        amount = float(current.get("bonus_amount") or 0)
        currency = current.get("currency")
        txn_id = f"txn_{uuid.uuid4().hex[:12]}"
        patch["credited_at"] = now_utc()
        patch["bonus_txn_id"] = txn_id
        await db.users.update_one({"user_id": user_id}, {"$inc": {f"balances.{currency}": amount}})
        txn = {
            "txn_id": txn_id,
            "type": "bonus_credit",
            "user_id": user_id,
            "participants": [user_id],
            "amount": amount,
            "currency": currency,
            "status": "completed",
            "bonus_id": current.get("bonus_id"),
            "reference": f"BON-{txn_id[-8:].upper()}",
            "created_at": now_utc(),
        }
        await db.transactions.insert_one(txn)
        notif_id = f"ntf_{uuid.uuid4().hex[:10]}"
        title = "Bonus credite"
        body = f"+{amount} {currency} credites sur votre portefeuille FX Pro."
        await db.notifications.insert_one({
            "notif_id": notif_id,
            "user_id": user_id,
            "type": "bonus",
            "txn_id": txn_id,
            "bonus_id": current.get("bonus_id"),
            "title": title,
            "body": body,
            "read": False,
            "created_at": now_utc(),
        })
        await send_push_to_user(user_id, title, body, txn_id=txn_id, type_="bonus", notif_id=notif_id)
    elif next_status in ["approved", "refused"]:
        title = "Bonus approuve" if next_status == "approved" else "Bonus refuse"
        body = (
            f"{current.get('bonus_amount', 0)} {current.get('currency')} reserves. Credit estime: {current.get('estimated_credit_at')}."
            if next_status == "approved" else patch.get("reason")
        )
        notif_id = f"ntf_{uuid.uuid4().hex[:10]}"
        await db.notifications.insert_one({
            "notif_id": notif_id,
            "user_id": user_id,
            "type": "bonus",
            "bonus_id": current.get("bonus_id"),
            "title": title,
            "body": body,
            "read": False,
            "created_at": now_utc(),
        })
        await send_push_to_user(user_id, title, body, type_="bonus", notif_id=notif_id)

    await db.bonus_program.update_one({"user_id": user_id}, {"$set": patch})
    return await db.bonus_program.find_one({"user_id": user_id}, {"_id": 0})


@api.get("/bonus")
async def bonus_state(user: dict = Depends(get_current_user)):
    bonus = await lock_bonus_if_needed(user)
    bonus = await advance_bonus_if_needed(user["user_id"]) or bonus
    country = bonus_country(bonus.get("country") or user.get("bonus_country"), bonus.get("currency"))
    currency = bonus.get("currency") or country["currency"]
    catalog = bonus_catalog(country["code"], currency)
    return {
        "countries": BONUS_COUNTRIES,
        "country": country,
        "catalog": catalog,
        "minimum_deposit": catalog[0]["threshold"] if catalog else 0,
        "status": bonus,
        "history": bonus_history(bonus),
        "rules": [
            "Uniquement le premier depot recu et confirme est analyse.",
            "Les depots en attente, annules, refuses ou les tentatives ne comptent pas.",
            "Une fois le premier depot recu verrouille, il ne peut plus etre remplace.",
            "Le bonus est analyse entre 7 et 30 jours selon le statut et le score de confiance.",
            "Un controle anti-abus peut refuser le bonus meme si le seuil financier est atteint.",
        ],
    }


@api.patch("/bonus/country")
async def bonus_set_country(data: BonusCountryIn, user: dict = Depends(get_current_user)):
    country = bonus_country(data.country)
    current = await db.bonus_program.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if current and current.get("first_deposit_locked") and current.get("country") != country["code"]:
        raise HTTPException(status_code=400, detail="Pays bonus deja verrouille par le premier depot recu confirme")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"bonus_country": country["code"], "updated_at": now_utc()}})
    await db.bonus_program.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "bonus_id": f"bonus_{user['user_id']}",
            "user_id": user["user_id"],
            "country": country["code"],
            "currency": country["currency"],
            "status": current.get("status") if current else "pending",
            "eligible": bool(current.get("eligible")) if current else False,
            "first_deposit_locked": bool(current.get("first_deposit_locked")) if current else False,
            "reason": current.get("reason") if current else "En attente du premier depot recu confirme.",
            "updated_at": now_utc(),
            "created_at": current.get("created_at") if current else now_utc(),
        }},
        upsert=True,
    )
    fresh = await find_user_by_id(user["user_id"])
    return await bonus_state(fresh)


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
    try:
        await lock_bonus_if_needed(recipient)
    except Exception as exc:
        logger.warning("Bonus lock after received transfer failed for %s: %s", recipient["user_id"], exc)
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
    allowed = {"name", "phone", "picture", "kyc_status", "kyc_level", "kyc_verified_at", "trust_score"}
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
@api.post("/admin/transactions/{txn_id}/confirm-deposit")
async def admin_confirm_deposit(txn_id: str, _: dict = Depends(require_admin)):
    deposit = await db.transactions.find_one({"txn_id": txn_id}, {"_id": 0})
    if not deposit:
        raise HTTPException(status_code=404, detail="Depot introuvable")
    if deposit.get("type") != "deposit":
        raise HTTPException(status_code=400, detail="Seuls les depots peuvent etre confirmes")
    if deposit.get("status") == "completed":
        return {"ok": True, "transaction": deposit}
    if deposit.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Depot non confirmable")

    user_id = deposit["user_id"]
    target = await find_user_full(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    balances = target.get("balances", {})
    balances[deposit["currency"]] = round(balances.get(deposit["currency"], 0) + float(deposit["amount"]), 4)
    confirmed_at = now_utc()
    await db.users.update_one({"user_id": user_id}, {"$set": {"balances": balances, "updated_at": confirmed_at}})
    await db.transactions.update_one({"txn_id": txn_id}, {"$set": {"status": "completed", "confirmed_at": confirmed_at, "updated_at": confirmed_at}})
    notif_id = f"ntf_{uuid.uuid4().hex[:10]}"
    title = "Depot confirme"
    body = f"{deposit['amount']} {deposit['currency']} credites. Reference {deposit.get('reference') or txn_id}."
    await db.notifications.insert_one({
        "notif_id": notif_id,
        "user_id": user_id,
        "type": "deposit",
        "txn_id": txn_id,
        "title": title,
        "body": body,
        "read": False,
        "created_at": now_utc(),
    })
    await send_push_to_user(user_id, title, body, txn_id=txn_id, type_="deposit", notif_id=notif_id)

    current_bonus = await db.bonus_program.find_one({"user_id": user_id}, {"_id": 0})
    bonus = None
    if not current_bonus or not current_bonus.get("first_deposit_locked"):
        txns = await user_transactions(user_id)
        confirmed_deposit = {**deposit, "status": "completed", "confirmed_at": confirmed_at}
        txns_for_bonus = [txn for txn in txns if txn.get("txn_id") != txn_id] + [confirmed_deposit]
        first_received = first_received_deposit(txns_for_bonus, user_id) or confirmed_deposit
        bonus = build_bonus_evaluation(target, txns_for_bonus, first_received, target.get("bonus_country"))
        await db.bonus_program.update_one({"user_id": user_id}, {"$set": bonus}, upsert=True)
        await db.bonus_events.insert_one({
            "event_id": f"bne_{uuid.uuid4().hex[:10]}",
            "user_id": user_id,
            "bonus_id": bonus["bonus_id"],
            "type": "first_received_deposit_eligible" if bonus.get("eligible") else "first_received_deposit_refused",
            "txn_id": first_received["txn_id"],
            "created_at": now_utc(),
        })
        await notify_bonus(user_id, bonus)

    return {"ok": True, "balances": balances, "bonus": bonus}


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
    bonus = None
    if data.amount > 0:
        u["balances"] = balances
        try:
            bonus = await lock_bonus_if_needed(u)
        except Exception as exc:
            logger.warning("Bonus lock after admin credit failed for %s: %s", user_id, exc)
    return {"ok": True, "balances": balances, "bonus": bonus}


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
    await db.bonus_program.create_index("user_id", unique=True)
    await db.bonus_events.create_index("created_at")
    await db.risk_logs.create_index("created_at")

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
            "bonus_country": DEFAULT_BONUS_COUNTRY,
            "trust_score": 90,
            "login_count": 5,
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
            "bonus_country": DEFAULT_BONUS_COUNTRY,
            "trust_score": 72,
            "login_count": 3,
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
