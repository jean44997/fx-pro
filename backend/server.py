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
import re
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
APILAYER_SHOP_KEY = os.environ.get("APILAYER_SHOP_KEY") or os.environ.get("EXPO_PUBLIC_APILAYER_KEY", "")
SHOP_PICKUP_AVAILABLE = False
SHOP_PICKUP_MESSAGE = (
    "Le retrait en agence est momentanement indisponible pendant la mise a jour logistique. "
    "Les commandes restent securisees: un conseiller FX Pro confirmera la livraison ou la reprise du retrait directement avec l'utilisateur."
)
SHOP_AGENCY_MESSAGE = (
    SHOP_PICKUP_MESSAGE
)
MAX_SHOP_PRODUCTS = 260
SHOP_FALLBACK_PRODUCTS = [
    {"id": "fxp_earbuds_pro", "title": "Ecouteurs Bluetooth Pro", "brand": "FX Select", "description": "Audio clair, boitier compact, autonomie longue duree et retrait disponible en agence partenaire.", "category": "Tech", "image": "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 79.0, "rating": 4.8, "stock": 18, "tags": ["Audio", "Mobile", "Premium"], "source": "fallback"},
    {"id": "fxp_watch_core", "title": "Montre connectee Core", "brand": "FX Select", "description": "Suivi activite, notifications, autonomie solide et design discret pour usage quotidien.", "category": "Tech", "image": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 129.0, "rating": 4.7, "stock": 12, "tags": ["Wearable", "Sport", "Mobile"], "source": "fallback"},
    {"id": "fxp_power_bank", "title": "Batterie externe 20 000 mAh", "brand": "Voltline", "description": "Charge rapide multi-port, format voyage et securite thermique integree.", "category": "Accessoires", "image": "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 49.0, "rating": 4.6, "stock": 25, "tags": ["Voyage", "Charge", "Mobile"], "source": "fallback"},
    {"id": "fxp_travel_bag", "title": "Sac voyage business", "brand": "Nomad Pro", "description": "Compartiments securises, poche laptop et finition sobre pour deplacements rapides.", "category": "Voyage", "image": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 92.0, "rating": 4.8, "stock": 10, "tags": ["Business", "Travel", "Secure"], "source": "fallback"},
    {"id": "fxp_coffee_box", "title": "Coffret cafe premium", "brand": "Maison Noir", "description": "Selection aromatique, grains fraichement torrefies et presentation cadeau.", "category": "Epicerie", "image": "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 36.0, "rating": 4.7, "stock": 30, "tags": ["Cafe", "Gourmet", "Cadeau"], "source": "fallback"},
    {"id": "fxp_green_tea", "title": "Selection the vert bio", "brand": "Pure Leaf", "description": "Infusion douce, notes vegetales et pack ideal pour routines bien-etre.", "category": "Epicerie", "image": "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 24.0, "rating": 4.5, "stock": 44, "tags": ["Bio", "Bien-etre", "The"], "source": "fallback"},
    {"id": "fxp_gift_card", "title": "Carte cadeau digitale", "brand": "FX Pro", "description": "Bon d'achat interne utilisable sur selection agence, avec recu numerique instantane.", "category": "Digital", "image": "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 55.0, "rating": 4.9, "stock": 99, "tags": ["Digital", "Cadeau", "Instantane"], "source": "fallback"},
    {"id": "fxp_office_pack", "title": "Pack bureau mobile", "brand": "Workline", "description": "Support telephone, cable renforce, carnet premium et rangement compact.", "category": "Accessoires", "image": "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 64.0, "rating": 4.6, "stock": 16, "tags": ["Bureau", "Mobile", "Organisation"], "source": "fallback"},
    {"id": "fxp_chocolate_box", "title": "Coffret chocolat artisan", "brand": "Cocoa House", "description": "Assortiment premium, emballage soigne et retrait rapide dans les agences participantes.", "category": "Epicerie", "image": "https://images.unsplash.com/photo-1548907040-4baa42d10919?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 42.0, "rating": 4.8, "stock": 22, "tags": ["Gourmet", "Cadeau", "Premium"], "source": "fallback"},
    {"id": "fxp_smart_tracker", "title": "Tracker intelligent", "brand": "Locate+", "description": "Localisation d'objets, alerte sonore et format discret pour sac, cle ou bagage.", "category": "Tech", "image": "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 39.0, "rating": 4.4, "stock": 28, "tags": ["Securite", "Voyage", "Mobile"], "source": "fallback"},
    {"id": "fxp_skin_care", "title": "Routine soin essentielle", "brand": "Luma", "description": "Kit compact, texture legere et format adapte aux deplacements.", "category": "Bien-etre", "image": "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 58.0, "rating": 4.5, "stock": 20, "tags": ["Soin", "Voyage", "Premium"], "source": "fallback"},
    {"id": "fxp_home_speaker", "title": "Mini enceinte maison", "brand": "SoundNest", "description": "Son ample, Bluetooth stable et finition textile moderne.", "category": "Tech", "image": "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=900&q=80", "base_currency": "USD", "base_price": 88.0, "rating": 4.7, "stock": 14, "tags": ["Audio", "Maison", "Bluetooth"], "source": "fallback"},
]

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


class ShopCartLineIn(BaseModel):
    product_id: str
    quantity: int = 1


class ShopCheckoutIn(BaseModel):
    items: List[ShopCartLineIn]
    currency: str = "XOF"
    wallet_currency: Optional[str] = None
    query: Optional[str] = "premium snack"
    client_order_id: Optional[str] = None
    note: Optional[str] = None


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
        "favorite_pairs": [["EUR", "USD"], ["EUR", "XOF"]],
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
            "favorite_pairs": [["EUR", "USD"], ["EUR", "XOF"]],
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
        # Keep admin overrides stable, but refresh stale live/fallback rates.
        updated = doc.get("updated_at")
        if updated and updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        source = doc.get("source")
        stale = not updated or (now_utc() - updated) > timedelta(minutes=RATE_CACHE_MINUTES)
        should_refresh = source != "admin" and (source != "live" or stale)
        if should_refresh:
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


def normalize_shop_currency(currency: Optional[str]) -> str:
    code = (currency or "XOF").upper()
    return code if code in SUPPORTED_CURRENCIES else "XOF"


def round_shop_money(value: float, currency: str) -> float:
    return round(float(value or 0), 0 if currency in ["XOF", "XAF", "JPY", "NGN", "KES"] else 2)


def convert_shop_money(amount: float, from_currency: str, to_currency: str, rates: Dict[str, float]) -> float:
    source = normalize_shop_currency(from_currency)
    target = normalize_shop_currency(to_currency)
    if source == target:
        return round_shop_money(amount, target)
    source_rate = rates.get(source) or (1.0 if source == "EUR" else 0)
    target_rate = rates.get(target) or (1.0 if target == "EUR" else 0)
    if not source_rate or not target_rate:
        return round_shop_money(amount, target)
    return round_shop_money((float(amount) / source_rate) * target_rate, target)


def stable_shop_number(seed: str) -> float:
    digest = hashlib.sha256(seed.encode()).hexdigest()
    return int(digest[:10], 16) % 1000000 / 1000000


MARKET_PRICE_ANCHORS = [
    ("iphone 5s", 35.0), ("iphone 6", 55.0), ("iphone x", 130.0), ("iphone 13 pro", 330.0),
    ("samsung galaxy s7", 60.0), ("samsung galaxy s8", 90.0), ("samsung galaxy s10", 150.0),
    ("oppo a57", 75.0), ("oppo f19", 145.0), ("oppo k1", 85.0), ("realme c35", 85.0),
    ("realme x", 110.0), ("realme xt", 130.0), ("vivo s1", 95.0), ("vivo v9", 90.0), ("vivo x21", 125.0),
    ("gaming laptop", 620.0), ("laptop", 320.0), ("55-inch", 290.0), ("55 inch", 290.0),
    ("curved gaming monitor", 480.0), ("monitor", 120.0), ("1tb", 55.0), ("256gb ssd", 24.0),
    ("2tb", 45.0), ("4tb gaming drive", 80.0), ("wireless bluetooth headphones", 35.0),
    ("headphone", 35.0), ("bluetooth speaker", 25.0), ("dslr camera", 220.0), ("action camera", 75.0),
    ("smartwatch", 55.0), ("tablet", 95.0), ("usb drive", 8.0), ("treadmill", 360.0),
    ("dumbbell", 70.0), ("blood pressure monitor", 28.0), ("thermometer", 18.0),
    ("kawasaki", 4200.0), ("motogp", 6200.0), ("scooter motorcycle", 1400.0),
    ("sportbike motorcycle", 3600.0), ("generic motorcycle", 1600.0),
]


def market_adjusted_price_usd(raw_price: float, seed: str, title: str = "", category: str = "") -> float:
    price = max(0.5, float(raw_price or 0))
    label = f"{title} {category}".lower()
    anchor = next((value for needle, value in MARKET_PRICE_ANCHORS if needle in label), price)
    factor = 0.54 + stable_shop_number(seed) * 0.16
    if any(token in label for token in ["groceries", "grocery", "beauty", "skin", "fragrance", "personal", "health"]):
        factor = 0.62 + stable_shop_number(seed) * 0.12
    if any(token in label for token in ["smartphone", "mobile", "electronics", "gadgets"]):
        factor = 0.57 + stable_shop_number(seed) * 0.13
    if any(token in label for token in ["motorcycle", "sportbike", "scooter"]):
        factor = 0.50 + stable_shop_number(seed) * 0.12
    if any(token in label for token in ["furniture", "sofa", "bed", "table", "chair", "home", "kitchen"]):
        factor = 0.55 + stable_shop_number(seed) * 0.14
    if any(token in label for token in ["jewelery", "jewelry", "gold", "silver", "bracelet", "ring", "earring"]):
        factor = 0.48 + stable_shop_number(seed) * 0.12
    if price <= 2:
        factor = 0.82 + stable_shop_number(seed) * 0.08
    adjusted = anchor * factor
    if any(token in label for token in ["motorcycle", "sportbike", "scooter"]):
        adjusted = max(950, min(adjusted, 6500))
    elif any(token in label for token in ["iphone", "galaxy", "oppo", "realme", "vivo", "smartphone", "mobile phone"]):
        adjusted = max(18, min(adjusted, 420))
    elif any(token in label for token in ["laptop", "monitor", "tv", "camera", "ssd", "hard drive", "tablet", "electronics", "gadgets"]):
        adjusted = max(6, min(adjusted, 950))
    elif any(token in label for token in ["furniture", "sofa", "bed", "mattress", "refrigerator", "dining", "table", "chair"]):
        adjusted = max(12, min(adjusted, 1400))
    elif any(token in label for token in ["jewelery", "jewelry", "gold", "silver", "bracelet", "ring", "earring"]):
        adjusted = max(6, min(adjusted, 360))
    elif any(token in label for token in ["groceries", "grocery", "beauty", "skin", "fragrance", "personal", "health"]):
        adjusted = max(0.75, min(adjusted, 85))
    else:
        adjusted = max(0.75, min(adjusted, 900))
    return round_shop_money(adjusted, "USD")


def normalize_remote_shop_products(products: List[dict]) -> List[dict]:
    normalized = []
    for index, raw in enumerate(products or []):
        product_id = str(raw.get("id") or raw.get("productId") or raw.get("upc") or f"remote_{index}")
        title = str(raw.get("title") or raw.get("name") or raw.get("productName") or "").strip()
        if not title:
            continue
        image = str(raw.get("image") or raw.get("imageUrl") or raw.get("image_url") or "")
        if not image.startswith("http") and product_id:
            image = f"https://img.spoonacular.com/products/{product_id}-312x231.{raw.get('imageType') or 'jpg'}"
        brand = str(raw.get("brand") or raw.get("brandName") or raw.get("manufacturer") or "Catalogue APILayer").strip()
        category = str(raw.get("aisle") or raw.get("category") or "Catalogue").strip()
        price = float(raw.get("price") or 0) or round_shop_money(18 + stable_shop_number(product_id + title) * 132, "USD")
        if price > 600:
            price = price / 100
        price = market_adjusted_price_usd(price, "api:" + product_id, title, category)
        normalized.append({
            "id": f"api_{product_id}",
            "title": title,
            "brand": brand,
            "description": str(raw.get("description") or "Produit catalogue avec retrait possible via le reseau d'agences FX Pro."),
            "category": category,
            "image": image or SHOP_FALLBACK_PRODUCTS[0]["image"],
            "base_currency": "USD",
            "base_price": round_shop_money(price, "USD"),
            "rating": round_shop_money(4.25 + stable_shop_number(product_id) * 0.7, "USD"),
            "stock": 8 + int(stable_shop_number(product_id + ":stock") * 34),
            "tags": [category, brand],
            "source": "apilayer",
            "sku": str(raw.get("upc") or raw.get("sku") or f"API-{product_id}").upper(),
            "ref": f"API-{product_id}",
            "images": [image] if image else [],
            "availability": "In Stock",
        })
    return normalized[:24]


def normalize_dummyjson_shop_products(products: List[dict]) -> List[dict]:
    normalized = []
    for index, raw in enumerate(products or []):
        product_id = str(raw.get("id") or index + 1)
        title = str(raw.get("title") or "").strip()
        if not title:
            continue
        category = str(raw.get("category") or "Catalogue").strip()
        brand = str(raw.get("brand") or category or "FX Catalogue").strip()
        images = [str(url) for url in raw.get("images") or [] if str(url).startswith("http")]
        image = str(raw.get("thumbnail") or (images[0] if images else "") or SHOP_FALLBACK_PRODUCTS[index % len(SHOP_FALLBACK_PRODUCTS)]["image"])
        raw_price = float(raw.get("price") or 0)
        price = market_adjusted_price_usd(raw_price, f"dummy:{product_id}:{title}", title, category)
        meta = raw.get("meta") if isinstance(raw.get("meta"), dict) else {}
        normalized.append({
            "id": f"dummy_{product_id}",
            "title": title,
            "brand": brand,
            "description": str(raw.get("description") or "Article catalogue avec retrait possible via une agence FX Pro partenaire."),
            "category": category,
            "image": image,
            "base_currency": "USD",
            "base_price": round_shop_money(price, "USD"),
            "rating": round_shop_money(float(raw.get("rating") or 4.2), "USD"),
            "stock": max(0, int(raw.get("stock") or 0)),
            "tags": list(dict.fromkeys([*(raw.get("tags") or []), category, brand]))[:8],
            "source": "dummyjson",
            "sku": str(raw.get("sku") or f"DUMMY-{product_id}").upper(),
            "ref": f"DMY-{product_id}",
            "barcode": meta.get("barcode"),
            "qr_code": meta.get("qrCode"),
            "warranty": raw.get("warrantyInformation"),
            "shipping": raw.get("shippingInformation"),
            "availability": raw.get("availabilityStatus") or ("In Stock" if raw.get("stock") else "Out of Stock"),
            "return_policy": raw.get("returnPolicy"),
            "minimum_order_quantity": max(1, min(8, int(raw.get("minimumOrderQuantity") or 1))),
            "images": list(dict.fromkeys([image, *images]))[:6],
            "review_count": len(raw.get("reviews") or []),
        })
    return normalized[:150]


def normalize_free_shop_products(products: List[dict]) -> List[dict]:
    normalized = []
    for index, raw in enumerate(products or []):
        product_id = str(raw.get("id") or index + 1)
        title = str(raw.get("name") or raw.get("title") or "").strip()
        if not title:
            continue
        category = str(raw.get("category") or "Catalogue").strip()
        sub_category = str(raw.get("subCategory") or category).strip()
        image = str(raw.get("image") or SHOP_FALLBACK_PRODUCTS[index % len(SHOP_FALLBACK_PRODUCTS)]["image"])
        price = float(raw.get("priceCents") or 0) / 100
        price = market_adjusted_price_usd(price, f"free:{product_id}:{title}", title, category)
        rating = raw.get("rating") if isinstance(raw.get("rating"), dict) else {}
        normalized.append({
            "id": f"free_{product_id}",
            "title": title,
            "brand": sub_category or "Free Ecommerce API",
            "description": str(raw.get("description") or "Article catalogue avec retrait possible via une agence FX Pro."),
            "category": category,
            "image": image,
            "base_currency": "USD",
            "base_price": round_shop_money(price, "USD"),
            "rating": round_shop_money(float(rating.get("stars") or 4.4), "USD"),
            "stock": 15 + int(stable_shop_number(f"free:{product_id}:stock") * 85),
            "tags": list(dict.fromkeys([*(raw.get("keywords") or []), category, sub_category]))[:8],
            "source": "freeapi",
            "sku": f"FREE-{product_id.zfill(3)}",
            "ref": f"FREE-{product_id}",
            "images": [image],
            "review_count": int(rating.get("count") or 0),
            "availability": "In Stock",
            "shipping": "Retrait agence ou expedition partenaire",
            "return_policy": "Retour selon agence partenaire",
        })
    return normalized[:50]


def title_case_category(value: str) -> str:
    return " ".join(word[:1].upper() + word[1:] for word in str(value or "Catalogue").replace("-", " ").split())


def normalize_fakestore_shop_products(products: List[dict]) -> List[dict]:
    normalized = []
    for index, raw in enumerate(products or []):
        product_id = str(raw.get("id") or index + 1)
        title = str(raw.get("title") or "").strip()
        if not title:
            continue
        category = title_case_category(str(raw.get("category") or "Catalogue"))
        image = str(raw.get("image") or SHOP_FALLBACK_PRODUCTS[index % len(SHOP_FALLBACK_PRODUCTS)]["image"])
        rating = raw.get("rating") if isinstance(raw.get("rating"), dict) else {}
        normalized.append({
            "id": f"fake_{product_id}",
            "title": title,
            "brand": category,
            "description": str(raw.get("description") or "Article boutique avec prix verifie cote serveur et recu FX Pro apres paiement."),
            "category": category,
            "image": image,
            "base_currency": "USD",
            "base_price": market_adjusted_price_usd(float(raw.get("price") or 0), f"fakestore:{product_id}:{title}", title, category),
            "rating": round_shop_money(float(rating.get("rate") or 4.2), "USD"),
            "stock": 12 + int(stable_shop_number(f"fake:{product_id}:stock") * 58),
            "tags": list(dict.fromkeys([category, *title.split()[:4]]))[:8],
            "source": "fakestore",
            "sku": f"FAKE-{product_id.zfill(3)}",
            "ref": f"FKS-{product_id}",
            "images": [image],
            "review_count": int(rating.get("count") or 0),
            "availability": "In Stock",
            "shipping": "Livraison partenaire apres confirmation FX Pro",
            "return_policy": "Retour selon disponibilite partenaire",
        })
    return normalized[:20]


ESCUELA_BLOCKED_TITLES = {
    "cot - furniture", "samsung", "nokia", "new product", "t-shirt", "mobile phones",
    "test product smth to test", "n", "m",
}


def escuela_image_ok(url: str) -> bool:
    lower = str(url).lower()
    return lower.startswith("http") and not any(bad in lower for bad in ["placehold.co", "placeimg.com", "picsum.photos", "products.com"])


def escuela_category(raw: dict, title: str) -> str:
    source = str(((raw.get("category") or {}) if isinstance(raw.get("category"), dict) else {}).get("name") or raw.get("category") or "").strip()
    if source and "updated category name" not in source.lower():
        return title_case_category(source)
    label = title.lower()
    if any(token in label for token in ["cap", "jogger", "shorts", "t-shirt", "tee", "shirt"]):
        return "Fashion & Apparel"
    if any(token in label for token in ["controller", "headphone", "earbud", "toaster", "mouse", "laptop", "phone", "smartwatch"]):
        return "Electronics & Gadgets"
    if any(token in label for token in ["sofa", "dining", "table", "armchair", "workstation", "chair"]):
        return "Home & Kitchen"
    if any(token in label for token in ["sneaker", "heel", "sandal", "boot", "loafer", "shoe", "cleat"]):
        return "Footwear"
    return "Lifestyle"


def normalize_escuelajs_shop_products(products: List[dict]) -> List[dict]:
    normalized = []
    for index, raw in enumerate(products or []):
        product_id = str(raw.get("id") or index + 1)
        title = str(raw.get("title") or "").strip()
        title_key = title.lower()
        images = [str(url) for url in raw.get("images") or [] if escuela_image_ok(str(url))]
        description = str(raw.get("description") or "").strip()
        if not title or len(title) < 4 or title_key in ESCUELA_BLOCKED_TITLES or not images:
            continue
        if len(description) < 24 or description.lower() in {"a description", "string"}:
            continue
        category = escuela_category(raw, title)
        normalized.append({
            "id": f"escuela_{product_id}",
            "title": title,
            "brand": category,
            "description": description,
            "category": category,
            "image": images[0],
            "base_currency": "USD",
            "base_price": market_adjusted_price_usd(float(raw.get("price") or 0), f"escuelajs:{product_id}:{title}", title, category),
            "rating": round_shop_money(4.15 + stable_shop_number(f"escuela:{product_id}:rating") * 0.75, "USD"),
            "stock": 10 + int(stable_shop_number(f"escuela:{product_id}:stock") * 74),
            "tags": list(dict.fromkeys([category, str(((raw.get("category") or {}) if isinstance(raw.get("category"), dict) else {}).get("slug") or ""), *title.split()[:5]]))[:8],
            "source": "escuelajs",
            "sku": f"ESC-{product_id.zfill(3)}",
            "ref": f"ESC-{product_id}",
            "images": images[:5],
            "review_count": 18 + int(stable_shop_number(f"escuela:{product_id}:reviews") * 220),
            "availability": "In Stock",
            "shipping": "Livraison partenaire apres confirmation FX Pro",
            "return_policy": "Retour selon disponibilite partenaire",
        })
    return normalized[:80]


async def fetch_apilayer_shop_products(query: str = "premium snack") -> List[dict]:
    if not APILAYER_SHOP_KEY:
        return []
    attempts = [
        ("https://api.apilayer.com/spoonacular/food/products/search", {"query": query, "number": 18}, {"apikey": APILAYER_SHOP_KEY}),
        ("https://api.spoonacular.com/food/products/search", {"query": query, "number": 18, "apiKey": APILAYER_SHOP_KEY}, {}),
    ]
    for url, params, headers in attempts:
        try:
            async with httpx.AsyncClient(timeout=7) as h:
                r = await h.get(url, params=params, headers=headers)
            if r.status_code != 200:
                continue
            body = r.json()
            products = body.get("products") if isinstance(body, dict) else []
            if not products and isinstance(body, dict):
                products = body.get("results") or []
            normalized = normalize_remote_shop_products(products)
            if normalized:
                return normalized
        except Exception as exc:
            logger.warning("Shop catalog fetch failed: %s", exc)
    return []


async def fetch_dummyjson_shop_products(limit: int = 150) -> List[dict]:
    fields = ",".join([
        "id", "title", "description", "category", "price", "rating", "stock", "tags", "brand", "sku",
        "warrantyInformation", "shippingInformation", "availabilityStatus", "returnPolicy",
        "minimumOrderQuantity", "meta", "images", "thumbnail", "reviews",
    ])
    try:
        async with httpx.AsyncClient(timeout=7) as h:
            r = await h.get("https://dummyjson.com/products", params={"limit": limit, "select": fields})
        if r.status_code != 200:
            return []
        body = r.json()
        products = body.get("products") if isinstance(body, dict) else []
        return normalize_dummyjson_shop_products(products or [])
    except Exception as exc:
        logger.warning("DummyJSON shop fetch failed: %s", exc)
        return []


async def fetch_free_ecommerce_shop_products() -> List[dict]:
    try:
        async with httpx.AsyncClient(timeout=5) as h:
            r = await h.get("https://kolzsticks.github.io/Free-Ecommerce-Products-Api/main/products.json")
        if r.status_code != 200:
            return []
        body = r.json()
        return normalize_free_shop_products(body if isinstance(body, list) else [])
    except Exception as exc:
        logger.warning("Free Ecommerce shop fetch failed: %s", exc)
        return []


async def fetch_fakestore_shop_products() -> List[dict]:
    try:
        async with httpx.AsyncClient(timeout=5) as h:
            r = await h.get("https://fakestoreapi.com/products")
        if r.status_code != 200:
            return []
        body = r.json()
        return normalize_fakestore_shop_products(body if isinstance(body, list) else [])
    except Exception as exc:
        logger.warning("FakeStore shop fetch failed: %s", exc)
        return []


async def fetch_escuelajs_shop_products(limit: int = 80) -> List[dict]:
    try:
        async with httpx.AsyncClient(timeout=5) as h:
            r = await h.get("https://api.escuelajs.co/api/v1/products", params={"offset": 0, "limit": limit})
        if r.status_code != 200:
            return []
        body = r.json()
        return normalize_escuelajs_shop_products(body if isinstance(body, list) else [])
    except Exception as exc:
        logger.warning("Escuelajs shop fetch failed: %s", exc)
        return []


def dedupe_shop_products(products: List[dict]) -> List[dict]:
    seen = set()
    deduped = []
    for product in products:
        key = f"{str(product.get('title', '')).strip().lower()}:{str(product.get('category', '')).strip().lower()}"
        sku_key = f"sku:{str(product.get('sku', '')).lower()}" if product.get("sku") else ""
        if key in seen or (sku_key and sku_key in seen):
            continue
        seen.add(key)
        if sku_key:
            seen.add(sku_key)
        deduped.append(product)
    return deduped


async def get_shop_overrides() -> List[dict]:
    try:
      return await db.shop_products.find({}, {"_id": 0}).to_list(500)
    except Exception:
      return []


def apply_shop_overrides(products: List[dict], overrides: List[dict]) -> List[dict]:
    if not overrides:
        return products
    by_key = {}
    for override in overrides:
        key = str(override.get("product_id") or override.get("id") or override.get("sku") or "").strip()
        if key:
            by_key[key] = override
    merged = []
    for product in products:
        override = by_key.get(product["id"]) or by_key.get(str(product.get("sku") or ""))
        if not override:
            merged.append(product)
            continue
        if override.get("hidden") or override.get("visible") is False:
            continue
        patched = {**product}
        for key in ["title", "brand", "description", "category", "image"]:
            if override.get(key):
                patched[key] = override[key]
        price_override = override.get("price_override_usd", override.get("base_price"))
        if price_override is not None and float(price_override or 0) > 0:
            patched["base_price"] = round_shop_money(float(price_override), "USD")
        stock_override = override.get("stock_override", override.get("stock"))
        if stock_override is not None:
            patched["stock"] = max(0, int(stock_override or 0))
        if isinstance(override.get("tags"), list) and override["tags"]:
            patched["tags"] = override["tags"][:8]
        patched["admin_managed"] = True
        merged.append(patched)
    return merged


def shop_promotions(products: List[dict]) -> List[dict]:
    today_key = now_utc().date().isoformat()
    ranked = sorted(products, key=lambda p: stable_shop_number(f"{today_key}:{p['id']}"))
    ends_at = datetime.combine(now_utc().date(), datetime.max.time(), tzinfo=timezone.utc)
    discounts = [70, 55, 40, 30, 22, 15, 12, 10]
    labels = ["Flash -70%", "Selection -55%", "Bonus -40%", "Prix doux -30%", "Client -22%", "Decouverte -15%", "Panier -12%", "Mini pub -10%"]
    promos = []
    for index, product in enumerate(ranked[:8]):
        promos.append({
            "product_id": product["id"],
            "discount_percent": discounts[index],
            "label": labels[index],
            "ends_at": ends_at,
        })
    return promos


async def announce_shop_available(user_id: str) -> None:
    update_flag = "shop_update_pickup_paused_2026_05_17_at"
    user = await db.users.find_one({"user_id": user_id}, {"shop_announced_at": 1, update_flag: 1})
    if not user or user.get(update_flag):
        return
    created_at = now_utc()
    notif = {
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "type": "shop_available",
        "title": "Mise a jour Boutique FX Pro",
        "body": f"La boutique est disponible avec nouveaux articles, promos et paiement par solde. {SHOP_PICKUP_MESSAGE}",
        "read": False,
        "created_at": created_at,
    }
    await db.users.update_one({"user_id": user_id}, {"$set": {"shop_announced_at": user.get("shop_announced_at") or created_at, update_flag: created_at, "updated_at": created_at}})
    await db.notifications.insert_one(notif)
    await send_push_to_user(user_id, notif["title"], notif["body"], None, "shop_available", notif["notif_id"])


async def build_shop_catalog(currency: str = "XOF", query: str = "premium snack", user_id: Optional[str] = None) -> dict:
    rates_doc = await get_active_rates("EUR")
    rates = rates_doc.get("rates") or FALLBACK_RATES
    remote, dummy, free, fake, escuela, overrides = await asyncio.gather(
        fetch_apilayer_shop_products(query),
        fetch_dummyjson_shop_products(150),
        fetch_free_ecommerce_shop_products(),
        fetch_fakestore_shop_products(),
        fetch_escuelajs_shop_products(),
        get_shop_overrides(),
    )
    if user_id:
        await announce_shop_available(user_id)
    products = apply_shop_overrides(dedupe_shop_products(remote + free + fake + escuela + dummy + SHOP_FALLBACK_PRODUCTS), overrides)[:MAX_SHOP_PRODUCTS]
    product_ids = {p["id"] for p in products}
    admin_promos = []
    for override in overrides:
        product_id = str(override.get("product_id") or override.get("id") or "")
        if override.get("promo_active") and product_id in product_ids:
            discount = max(1, min(90, int(override.get("promo_discount", override.get("discount_override", 10)) or 10)))
            admin_promos.append({
                "product_id": product_id,
                "discount_percent": discount,
                "label": f"Admin -{discount}%",
                "ends_at": datetime.combine(now_utc().date(), datetime.max.time(), tzinfo=timezone.utc),
            })
    promotion_ids = {p["product_id"] for p in admin_promos}
    promotions = (admin_promos + [p for p in shop_promotions(products) if p["product_id"] not in promotion_ids])[:10]
    promo_map = {p["product_id"]: p for p in promotions}
    code = normalize_shop_currency(currency)
    priced = []
    for product in products:
        original = convert_shop_money(product["base_price"], product.get("base_currency", "USD"), code, rates)
        promo = promo_map.get(product["id"])
        price = round_shop_money(original * (1 - (promo["discount_percent"] / 100)), code) if promo else original
        priced.append({**product, "original_price": original, "price": price, "currency": code, "promotion": promo})
    source = "mixed" if (remote or dummy or free or fake or escuela) else "fallback"
    return {
        "products": priced,
        "promotions": promotions,
        "currency": code,
        "source": source,
        "updated_at": now_utc(),
        "agency_message": SHOP_AGENCY_MESSAGE,
        "pickup_available": SHOP_PICKUP_AVAILABLE,
        "pickup_message": SHOP_PICKUP_MESSAGE,
    }


def calculate_shop_cart(products: List[dict], lines: List[ShopCartLineIn], order_currency: str, wallet_currency: str, rates: Dict[str, float]) -> dict:
    product_map = {p["id"]: p for p in products}
    seen = set()
    items = []
    if len(lines) > 30:
        raise HTTPException(status_code=400, detail="Panier trop volumineux")
    for line in lines:
        if line.product_id in seen:
            raise HTTPException(status_code=400, detail="Produit en doublon detecte dans le panier")
        seen.add(line.product_id)
        product = product_map.get(line.product_id)
        if not product:
            continue
        qty = max(1, min(8, int(line.quantity or 1)))
        if qty > int(product.get("stock") or 0):
            raise HTTPException(status_code=400, detail=f"{product['title']}: stock insuffisant")
        if float(product.get("price") or 0) <= 0:
            raise HTTPException(status_code=400, detail=f"{product['title']}: prix invalide")
        savings = round_shop_money(max(0, (float(product["original_price"]) - float(product["price"])) * qty), order_currency)
        items.append({
            "product_id": product["id"],
            "title": product["title"],
            "brand": product["brand"],
            "image": product["image"],
            "category": product["category"],
            "sku": product.get("sku"),
            "ref": product.get("ref"),
            "quantity": qty,
            "unit_price": product["price"],
            "original_unit_price": product["original_price"],
            "discount_percent": (product.get("promotion") or {}).get("discount_percent", 0),
            "line_total": round_shop_money(product["price"] * qty, order_currency),
            "savings": savings,
        })
    if not items:
        raise HTTPException(status_code=400, detail="Panier vide ou produits indisponibles")
    total = round_shop_money(sum(item["line_total"] for item in items), order_currency)
    discount_total = round_shop_money(sum(item.get("savings") or 0 for item in items), order_currency)
    debit = convert_shop_money(total, order_currency, wallet_currency, rates)
    snapshot = hashlib.sha256(str([[i["product_id"], i["quantity"], i["unit_price"], i["discount_percent"]] for i in items]).encode()).hexdigest()[:12]
    if total <= 0 or debit <= 0:
        raise HTTPException(status_code=400, detail="Montant de commande invalide")
    return {
        "items": items,
        "total": total,
        "discount_total": discount_total,
        "currency": order_currency,
        "wallet_currency": wallet_currency,
        "debit_amount": debit,
        "price_snapshot_hash": f"sp_{snapshot}",
    }


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


# ============ Shop ============
@api.get("/shop/catalog")
async def shop_catalog(currency: str = "XOF", q: str = "premium snack", user: dict = Depends(get_current_user)):
    return await build_shop_catalog(currency, q, user["user_id"])


@api.get("/shop/orders")
async def shop_orders(user: dict = Depends(get_current_user)):
    items = await db.shop_orders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"items": items}


@api.get("/admin/shop/products")
async def admin_shop_products(_: dict = Depends(require_admin)):
    items = await db.shop_products.find({}, {"_id": 0}).to_list(500)
    return {"items": items}


@api.patch("/admin/shop/products/{product_id}")
async def admin_patch_shop_product(product_id: str, payload: Dict[str, Any], admin: dict = Depends(require_admin)):
    allowed = {
        "title", "brand", "description", "category", "image", "price_override_usd", "base_price",
        "discount_override", "promo_active", "promo_discount", "stock_override", "stock", "hidden",
        "visible", "tags",
    }
    patch = {k: v for k, v in payload.items() if k in allowed}
    patch.update({"product_id": product_id, "updated_at": now_utc(), "updated_by": admin["user_id"]})
    await db.shop_products.update_one({"product_id": product_id}, {"$set": patch}, upsert=True)
    return {"ok": True}


@api.post("/shop/checkout")
async def shop_checkout(data: ShopCheckoutIn, user: dict = Depends(get_current_user)):
    order_currency = normalize_shop_currency(data.currency)
    wallet_currency = normalize_shop_currency(data.wallet_currency or order_currency)
    if not data.items or len(data.items) > 20 or len({item.product_id for item in data.items}) != len(data.items):
        await db.risk_logs.insert_one({
            "event_id": f"risk_{uuid.uuid4().hex[:10]}",
            "user_id": user["user_id"],
            "type": "shop_checkout",
            "reason": "invalid_cart_shape",
            "created_at": now_utc(),
        })
        raise HTTPException(status_code=400, detail="Panier invalide: doublon ou volume suspect detecte")
    if data.client_order_id and not re.fullmatch(r"shop_[a-zA-Z0-9]{8,32}", data.client_order_id):
        await db.risk_logs.insert_one({
            "event_id": f"risk_{uuid.uuid4().hex[:10]}",
            "user_id": user["user_id"],
            "type": "shop_checkout",
            "reason": "invalid_client_order_id",
            "created_at": now_utc(),
        })
        raise HTTPException(status_code=400, detail="Identifiant de commande invalide")
    if data.client_order_id:
        existing = await db.shop_orders.find_one({"user_id": user["user_id"], "client_order_id": data.client_order_id}, {"_id": 0})
        if existing:
            return {"ok": True, "duplicate": True, "order": existing, "transaction": existing.get("transaction")}
    last_order = await db.shop_orders.find_one({"user_id": user["user_id"]}, {"_id": 0}, sort=[("created_at", -1)])
    last_created = last_order.get("created_at") if last_order else None
    if last_created and getattr(last_created, "tzinfo", None) is None:
        last_created = last_created.replace(tzinfo=timezone.utc)
    if last_created and (now_utc() - last_created).total_seconds() < 4.5:
        await db.risk_logs.insert_one({
            "event_id": f"risk_{uuid.uuid4().hex[:10]}",
            "user_id": user["user_id"],
            "type": "shop_checkout",
            "reason": "rapid_checkout",
            "last_order_id": last_order.get("order_id"),
            "created_at": now_utc(),
        })
        raise HTTPException(status_code=429, detail="Commande trop rapide. Patiente quelques secondes avant de revalider.")

    rates_doc = await get_active_rates("EUR")
    catalog = await build_shop_catalog(order_currency, data.query or "market", user["user_id"])
    totals = calculate_shop_cart(catalog["products"], data.items, order_currency, wallet_currency, rates_doc.get("rates") or FALLBACK_RATES)
    balance_key = f"balances.{wallet_currency}"
    updated_user = await db.users.find_one_and_update(
        {"user_id": user["user_id"], balance_key: {"$gte": totals["debit_amount"]}},
        {"$inc": {balance_key: -totals["debit_amount"]}, "$set": {"updated_at": now_utc()}},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if not updated_user:
        full = await find_user_full(user["user_id"])
        available = float((full.get("balances") or {}).get(wallet_currency, 0))
        raise HTTPException(
            status_code=400,
            detail=f"Solde insuffisant: disponible {available} {wallet_currency}, commande {totals['debit_amount']} {wallet_currency}. Rechargez via depot ou agence FX Pro partenaire.",
        )

    order_id = f"ord_{uuid.uuid4().hex[:12]}"
    txn_id = f"txn_{uuid.uuid4().hex[:12]}"
    reference = f"SHOP-{uuid.uuid4().hex[:8].upper()}"
    created_at = now_utc()
    txn = {
        "txn_id": txn_id,
        "type": "shop_purchase",
        "user_id": user["user_id"],
        "participants": [user["user_id"]],
        "amount": totals["debit_amount"],
        "currency": wallet_currency,
        "order_total": totals["total"],
        "order_currency": order_currency,
        "discount_total": totals["discount_total"],
        "price_snapshot_hash": totals["price_snapshot_hash"],
        "shop_order_id": order_id,
        "reference": reference,
        "items": totals["items"],
        "item_count": sum(int(item.get("quantity") or 0) for item in totals["items"]),
        "pickup_status": "pickup_paused",
        "pickup_message": catalog.get("pickup_message") or SHOP_AGENCY_MESSAGE,
        "status": "completed",
        "created_at": created_at,
    }
    order = {
        "order_id": order_id,
        "user_id": user["user_id"],
        "client_order_id": data.client_order_id,
        "reference": reference,
        "status": "paid",
        "payment_status": "paid",
        "pickup_status": "pickup_paused",
        "pickup_message": catalog.get("pickup_message") or SHOP_AGENCY_MESSAGE,
        "currency": order_currency,
        "wallet_currency": wallet_currency,
        "total": totals["total"],
        "debit_amount": totals["debit_amount"],
        "discount_total": totals["discount_total"],
        "price_snapshot_hash": totals["price_snapshot_hash"],
        "items": totals["items"],
        "transaction": txn,
        "customer_name": user.get("name"),
        "customer_email": user.get("email"),
        "agency_message": catalog.get("pickup_message") or SHOP_AGENCY_MESSAGE,
        "note": (data.note or "")[:180],
        "created_at": created_at,
        "updated_at": created_at,
    }
    notif = {
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "type": "shop_purchase",
        "txn_id": txn_id,
        "order_id": order_id,
        "title": "Commande boutique confirmee",
        "body": f"{reference}: paiement {totals['debit_amount']} {wallet_currency}. Retrait agence momentanement indisponible, suivi FX Pro active.",
        "read": False,
        "created_at": created_at,
    }
    await db.shop_orders.insert_one(order)
    await db.transactions.insert_one(txn)
    await db.notifications.insert_one(notif)
    await send_push_to_user(user["user_id"], notif["title"], notif["body"], txn_id, "shop_purchase", notif["notif_id"])
    order.pop("_id", None)
    txn.pop("_id", None)
    return {"ok": True, "order": order, "transaction": txn, "balances": updated_user.get("balances", {})}


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
    await db.shop_orders.create_index("created_at")
    await db.shop_orders.create_index([("user_id", 1), ("client_order_id", 1)])
    await db.shop_products.create_index("product_id", unique=True)
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
            "favorite_pairs": [["EUR", "USD"], ["EUR", "XOF"]],
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
            "favorite_pairs": [["EUR", "USD"], ["EUR", "XOF"]],
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
