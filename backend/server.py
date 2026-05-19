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
import secrets
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
TMDB_READ_TOKEN = os.environ.get("TMDB_READ_TOKEN", "").strip()
TMDB_API_KEY = os.environ.get("TMDB_API_KEY", "4300217e16dba490da871af16163cedb").strip()
TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"
SHOP_PICKUP_AVAILABLE = False
SHOP_PICKUP_MESSAGE = (
    "Le retrait en agence est momentanement indisponible pendant la mise a jour logistique. "
    "Les commandes restent securisees: un conseiller FX Pro confirmera la livraison ou la reprise du retrait directement avec l'utilisateur."
)
SHOP_AGENCY_MESSAGE = (
    SHOP_PICKUP_MESSAGE
)
WITHDRAW_PAUSED_NOTICE_FLAG = "withdraw_paused_notice_2026_05_18_at"
WITHDRAW_PAUSED_NOTICE_TITLE = "Retrait momentanement indisponible"
WITHDRAW_PAUSED_NOTICE_BODY = (
    "Le retrait est momentanement indisponible pendant une mise a jour de securite et de logistique. "
    "Votre solde reste protege, les depots, transferts, achats boutique et notifications continuent normalement. "
    "FX Pro vous previendra des la reprise."
)
SERVICES_LIMITED_NOTICE_FLAG = "services_limited_notice_2026_05_18_at"
SERVICES_LIMITED_NOTICE_TITLE = "Services momentanement indisponibles"
SERVICES_LIMITED_NOTICE_BODY = (
    "Certains services externes peuvent etre indisponibles pendant la mise a jour. "
    "Le solde, les recus, la boutique suivie, les jeux avec tickets et les notifications restent proteges."
)
SERVICES_AVAILABLE_FLAG = "services_available_notice_2026_05_19_at"
SERVICES_AVAILABLE_TITLE = "Services FX Pro disponibles"
SERVICES_AVAILABLE_BODY = (
    "La vente en ligne, le catalogue films et series, les jeux a tickets et les notifications vendeur sont disponibles. "
    "Ouvre la boutique, les films ou les jeux pour profiter des nouveaux services."
)
GAME_DAILY_TICKETS = 5
GAME_TICKET_NOTICE_PREFIX = "game_tickets_recharged_notice_"
GAME_GLOBAL_RECHARGE_FLAG = "game_global_recharge_2026_05_19_at"
GAME_CONFIG = {
    "scratch": {"name": "Carte Neon", "win_chance": 0.34, "min_prize": 80, "max_prize": 750},
    "vault": {"name": "Coffre Flash", "win_chance": 0.26, "min_prize": 150, "max_prize": 1400},
    "reflex": {"name": "Reflexe FX", "win_chance": 0.42, "min_prize": 40, "max_prize": 420},
    "hero_duel": {"name": "Duel Heros", "win_chance": 0.36, "min_prize": 120, "max_prize": 1100, "mode": "hero"},
    "power_match": {"name": "Power Match", "win_chance": 0.30, "min_prize": 220, "max_prize": 1800, "mode": "hero"},
    "speed_run": {"name": "Speed Run", "win_chance": 0.44, "min_prize": 60, "max_prize": 620, "mode": "hero"},
}
MAX_SHOP_PRODUCTS = 1400
MOVIE_PAGE_SIZE_DEFAULT = 24
MOVIE_GENRE_GROUPS = {
    "all": {"label": "Tout", "movie": [], "tv": []},
    "action": {"label": "Action", "movie": [28], "tv": [10759]},
    "adventure": {"label": "Aventure", "movie": [12], "tv": [10759]},
    "comedy": {"label": "Comedie", "movie": [35], "tv": [35]},
    "drama": {"label": "Drame", "movie": [18], "tv": [18]},
    "scifi": {"label": "Science-fiction", "movie": [878], "tv": [10765]},
    "animation": {"label": "Animation", "movie": [16], "tv": [16]},
    "crime": {"label": "Crime", "movie": [80], "tv": [80]},
    "documentary": {"label": "Documentaire", "movie": [99], "tv": [99]},
    "family": {"label": "Famille", "movie": [10751], "tv": [10751]},
    "horror": {"label": "Horreur", "movie": [27], "tv": [9648]},
}
MOVIE_SORT_OPTIONS = {
    "popular": "popularity.desc",
    "rating": "vote_average.desc",
    "recent": "primary_release_date.desc",
}
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

SUPERHERO_ROSTER = [
    {"id": 1, "name": "A-Bomb", "slug": "1-a-bomb", "publisher": "Marvel Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/1-a-bomb.jpg", "stats": {"intelligence": 38, "strength": 100, "speed": 17, "durability": 80, "power": 24, "combat": 64}},
    {"id": 2, "name": "Abe Sapien", "slug": "2-abe-sapien", "publisher": "Dark Horse Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/2-abe-sapien.jpg", "stats": {"intelligence": 88, "strength": 28, "speed": 35, "durability": 65, "power": 100, "combat": 85}},
    {"id": 4, "name": "Abomination", "slug": "4-abomination", "publisher": "Marvel Comics", "alignment": "bad", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/4-abomination.jpg", "stats": {"intelligence": 63, "strength": 80, "speed": 53, "durability": 90, "power": 62, "combat": 95}},
    {"id": 6, "name": "Absorbing Man", "slug": "6-absorbing-man", "publisher": "Marvel Comics", "alignment": "bad", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/6-absorbing-man.jpg", "stats": {"intelligence": 38, "strength": 80, "speed": 25, "durability": 100, "power": 98, "combat": 64}},
    {"id": 20, "name": "Amazo", "slug": "20-amazo", "publisher": "DC Comics", "alignment": "bad", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/20-amazo.jpg", "stats": {"intelligence": 63, "strength": 100, "speed": 83, "durability": 100, "power": 100, "combat": 100}},
    {"id": 30, "name": "Ant-Man", "slug": "30-ant-man", "publisher": "Giant-Man", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/30-ant-man.jpg", "stats": {"intelligence": 100, "strength": 18, "speed": 23, "durability": 28, "power": 32, "combat": 32}},
    {"id": 35, "name": "Apocalypse", "slug": "35-apocalypse", "publisher": "Marvel Comics", "alignment": "bad", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/35-apocalypse.jpg", "stats": {"intelligence": 100, "strength": 100, "speed": 33, "durability": 100, "power": 100, "combat": 60}},
    {"id": 38, "name": "Aquaman", "slug": "38-aquaman", "publisher": "DC Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/38-aquaman.jpg", "stats": {"intelligence": 81, "strength": 85, "speed": 79, "durability": 80, "power": 100, "combat": 80}},
    {"id": 60, "name": "Bane", "slug": "60-bane", "publisher": "DC Comics", "alignment": "bad", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/60-bane.jpg", "stats": {"intelligence": 88, "strength": 38, "speed": 23, "durability": 56, "power": 51, "combat": 95}},
    {"id": 70, "name": "Batman", "slug": "70-batman", "publisher": "DC Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/70-batman.jpg", "stats": {"intelligence": 100, "strength": 26, "speed": 27, "durability": 50, "power": 47, "combat": 100}},
    {"id": 75, "name": "Beast", "slug": "75-beast", "publisher": "Marvel Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/75-beast.jpg", "stats": {"intelligence": 94, "strength": 48, "speed": 38, "durability": 60, "power": 43, "combat": 85}},
    {"id": 95, "name": "Black Adam", "slug": "95-black-adam", "publisher": "DC Comics", "alignment": "bad", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/95-black-adam.jpg", "stats": {"intelligence": 88, "strength": 100, "speed": 92, "durability": 100, "power": 100, "combat": 56}},
    {"id": 106, "name": "Black Panther", "slug": "106-black-panther", "publisher": "Marvel Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/106-black-panther.jpg", "stats": {"intelligence": 88, "strength": 16, "speed": 30, "durability": 60, "power": 41, "combat": 100}},
    {"id": 149, "name": "Captain America", "slug": "149-captain-america", "publisher": "Marvel Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/149-captain-america.jpg", "stats": {"intelligence": 69, "strength": 19, "speed": 38, "durability": 55, "power": 60, "combat": 100}},
    {"id": 157, "name": "Captain Marvel", "slug": "157-captain-marvel", "publisher": "Binary", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/157-captain-marvel.jpg", "stats": {"intelligence": 84, "strength": 88, "speed": 71, "durability": 95, "power": 100, "combat": 90}},
    {"id": 213, "name": "Deadpool", "slug": "213-deadpool", "publisher": "Marvel Comics", "alignment": "neutral", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/213-deadpool.jpg", "stats": {"intelligence": 69, "strength": 32, "speed": 50, "durability": 100, "power": 100, "combat": 100}},
    {"id": 332, "name": "Hulk", "slug": "332-hulk", "publisher": "Marvel Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/332-hulk.jpg", "stats": {"intelligence": 88, "strength": 100, "speed": 63, "durability": 100, "power": 98, "combat": 85}},
    {"id": 346, "name": "Iron Man", "slug": "346-iron-man", "publisher": "Marvel Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/346-iron-man.jpg", "stats": {"intelligence": 100, "strength": 85, "speed": 58, "durability": 85, "power": 100, "combat": 64}},
    {"id": 370, "name": "Joker", "slug": "370-joker", "publisher": "DC Comics", "alignment": "bad", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/370-joker.jpg", "stats": {"intelligence": 100, "strength": 10, "speed": 12, "durability": 60, "power": 43, "combat": 70}},
    {"id": 620, "name": "Spider-Man", "slug": "620-spider-man", "publisher": "Marvel Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/620-spider-man.jpg", "stats": {"intelligence": 90, "strength": 55, "speed": 67, "durability": 75, "power": 74, "combat": 85}},
    {"id": 644, "name": "Superman", "slug": "644-superman", "publisher": "Superman Prime One-Million", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/644-superman.jpg", "stats": {"intelligence": 94, "strength": 100, "speed": 100, "durability": 100, "power": 100, "combat": 85}},
    {"id": 655, "name": "Thanos", "slug": "655-thanos", "publisher": "Marvel Comics", "alignment": "bad", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/655-thanos.jpg", "stats": {"intelligence": 100, "strength": 100, "speed": 33, "durability": 100, "power": 100, "combat": 80}},
    {"id": 717, "name": "Wolverine", "slug": "717-wolverine", "publisher": "Marvel Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/717-wolverine.jpg", "stats": {"intelligence": 63, "strength": 32, "speed": 50, "durability": 100, "power": 89, "combat": 100}},
    {"id": 720, "name": "Wonder Woman", "slug": "720-wonder-woman", "publisher": "DC Comics", "alignment": "good", "image": "https://cdn.jsdelivr.net/gh/akabab/superhero-api@0.3.0/api/images/md/720-wonder-woman.jpg", "stats": {"intelligence": 88, "strength": 100, "speed": 79, "durability": 100, "power": 100, "combat": 100}},
]

MOVIE_FALLBACK_ITEMS = [
    {"id": 550, "media_type": "movie", "title": "Fight Club", "overview": "Un employe insomniaque decouvre un cercle clandestin qui change sa vision du controle et de la consommation.", "poster_url": "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", "backdrop_url": "https://image.tmdb.org/t/p/w780/hZkgoQYus5vegHoetLkCJzb17zJ.jpg", "vote_average": 8.4, "release_date": "1999-10-15", "genre_ids": [18], "source": "fallback"},
    {"id": 1399, "media_type": "tv", "title": "Game of Thrones", "overview": "Des familles nobles luttent pour le pouvoir pendant qu'une menace ancienne grandit au-dela du mur.", "poster_url": "https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg", "backdrop_url": "https://image.tmdb.org/t/p/w780/suopoADq0k8YZr4dQXcU6pToj6s.jpg", "vote_average": 8.5, "release_date": "2011-04-17", "genre_ids": [10759, 18], "source": "fallback"},
    {"id": 157336, "media_type": "movie", "title": "Interstellar", "overview": "Une equipe traverse l'espace pour chercher un futur possible a l'humanite.", "poster_url": "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", "backdrop_url": "https://image.tmdb.org/t/p/w780/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg", "vote_average": 8.5, "release_date": "2014-11-05", "genre_ids": [12, 18, 878], "source": "fallback"},
    {"id": 66732, "media_type": "tv", "title": "Stranger Things", "overview": "Des enfants, une disparition et une force etrange bouleversent une petite ville.", "poster_url": "https://image.tmdb.org/t/p/w500/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg", "backdrop_url": "https://image.tmdb.org/t/p/w780/56v2KjBlU4XaOv9rVYEQypROD7P.jpg", "vote_average": 8.6, "release_date": "2016-07-15", "genre_ids": [18, 9648, 10765], "source": "fallback"},
]

FREE_GAME_FALLBACK_ITEMS = [
    {"id": 540, "title": "Overwatch", "thumbnail": "https://www.freetogame.com/g/540/thumbnail.jpg", "short_description": "A hero-focused first-person team shooter from Blizzard Entertainment.", "game_url": "https://www.freetogame.com/open/overwatch", "genre": "Shooter", "platform": "PC (Windows)", "publisher": "Activision Blizzard", "developer": "Blizzard Entertainment", "release_date": "2022-10-04", "freetogame_profile_url": "https://www.freetogame.com/overwatch"},
    {"id": 516, "title": "PUBG: BATTLEGROUNDS", "thumbnail": "https://www.freetogame.com/g/516/thumbnail.jpg", "short_description": "Get into the action in one of the longest running battle royale games PUBG Battlegrounds.", "game_url": "https://www.freetogame.com/open/pubg", "genre": "Shooter", "platform": "PC (Windows)", "publisher": "KRAFTON, Inc.", "developer": "KRAFTON, Inc.", "release_date": "2022-01-12", "freetogame_profile_url": "https://www.freetogame.com/pubg"},
    {"id": 523, "title": "Fall Guys", "thumbnail": "https://www.freetogame.com/g/523/thumbnail.jpg", "short_description": "Play the massively multiplayer party royale game featuring beans for free on many platforms.", "game_url": "https://www.freetogame.com/open/fall-guys", "genre": "Battle Royale", "platform": "PC (Windows)", "publisher": "Mediatonic", "developer": "Mediatonic", "release_date": "2020-08-04", "freetogame_profile_url": "https://www.freetogame.com/fall-guys"},
    {"id": 475, "title": "Genshin Impact", "thumbnail": "https://www.freetogame.com/g/475/thumbnail.jpg", "short_description": "An open-world action RPG adventure with exploration and elemental combat.", "game_url": "https://www.freetogame.com/open/genshin-impact", "genre": "Action RPG", "platform": "PC (Windows)", "publisher": "miHoYo", "developer": "miHoYo", "release_date": "2020-09-28", "freetogame_profile_url": "https://www.freetogame.com/genshin-impact"},
    {"id": 466, "title": "Valorant", "thumbnail": "https://www.freetogame.com/g/466/thumbnail.jpg", "short_description": "Test your mettle in Riot Games character-based tactical FPS shooter.", "game_url": "https://www.freetogame.com/open/valorant", "genre": "Shooter", "platform": "PC (Windows)", "publisher": "Riot Games", "developer": "Riot Games", "release_date": "2020-06-02", "freetogame_profile_url": "https://www.freetogame.com/valorant"},
    {"id": 452, "title": "Call of Duty: Warzone", "thumbnail": "https://www.freetogame.com/g/452/thumbnail.jpg", "short_description": "A standalone free-to-play battle royale and multiplayer action experience.", "game_url": "https://www.freetogame.com/open/call-of-duty-warzone", "genre": "Shooter", "platform": "PC (Windows)", "publisher": "Activision", "developer": "Infinity Ward", "release_date": "2020-03-10", "freetogame_profile_url": "https://www.freetogame.com/call-of-duty-warzone"},
    {"id": 57, "title": "Fortnite", "thumbnail": "https://www.freetogame.com/g/57/thumbnail.jpg", "short_description": "A free-to-play battle royale from Epic Games.", "game_url": "https://www.freetogame.com/open/fortnite-battle-royale", "genre": "Shooter", "platform": "PC (Windows)", "publisher": "Epic Games", "developer": "Epic Games", "release_date": "2017-09-26", "freetogame_profile_url": "https://www.freetogame.com/fortnite-battle-royale"},
    {"id": 345, "title": "Forge of Empires", "thumbnail": "https://www.freetogame.com/g/345/thumbnail.jpg", "short_description": "A browser-based online strategy game where you build your city through the ages.", "game_url": "https://www.freetogame.com/open/forge-of-empires", "genre": "Strategy", "platform": "Web Browser", "publisher": "InnoGames", "developer": "InnoGames", "release_date": "2012-04-17", "freetogame_profile_url": "https://www.freetogame.com/forge-of-empires"},
    {"id": 13, "title": "Guild Wars 2", "thumbnail": "https://www.freetogame.com/g/13/thumbnail.jpg", "short_description": "A free-to-play MMORPG with a huge world and cooperative adventures.", "game_url": "https://www.freetogame.com/open/guild-wars-2", "genre": "MMORPG", "platform": "PC (Windows)", "publisher": "NCsoft", "developer": "ArenaNet", "release_date": "2012-08-28", "freetogame_profile_url": "https://www.freetogame.com/guild-wars-2"},
    {"id": 3, "title": "Warframe", "thumbnail": "https://www.freetogame.com/g/3/thumbnail.jpg", "short_description": "A cooperative sci-fi action shooter with a huge evolving universe.", "game_url": "https://www.freetogame.com/open/warframe", "genre": "Shooter", "platform": "PC (Windows)", "publisher": "Digital Extremes", "developer": "Digital Extremes", "release_date": "2013-03-25", "freetogame_profile_url": "https://www.freetogame.com/warframe"},
    {"id": 229, "title": "Dota 2", "thumbnail": "https://www.freetogame.com/g/229/thumbnail.jpg", "short_description": "Valve's premiere competitive free-to-play MOBA.", "game_url": "https://www.freetogame.com/open/dota-2", "genre": "MOBA", "platform": "PC (Windows)", "publisher": "Valve", "developer": "Valve", "release_date": "2013-07-09", "freetogame_profile_url": "https://www.freetogame.com/dota-2"},
    {"id": 286, "title": "League of Legends", "thumbnail": "https://www.freetogame.com/g/286/thumbnail.jpg", "short_description": "One of the most played competitive MOBAs on PC.", "game_url": "https://www.freetogame.com/open/league-of-legends", "genre": "MOBA", "platform": "PC (Windows)", "publisher": "Riot Games", "developer": "Riot Games", "release_date": "2009-10-27", "freetogame_profile_url": "https://www.freetogame.com/league-of-legends"},
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


async def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None


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


async def notify_withdraw_paused_once(user_id: str) -> bool:
    created_at = now_utc()
    updated = await db.users.update_one(
        {"user_id": user_id, WITHDRAW_PAUSED_NOTICE_FLAG: {"$exists": False}},
        {"$set": {WITHDRAW_PAUSED_NOTICE_FLAG: created_at, "updated_at": created_at}},
    )
    if updated.modified_count <= 0:
        return False
    notif = {
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "type": "withdraw_paused",
        "title": WITHDRAW_PAUSED_NOTICE_TITLE,
        "body": WITHDRAW_PAUSED_NOTICE_BODY,
        "read": False,
        "created_at": created_at,
        "url": "/notifications",
    }
    await db.notifications.insert_one(notif)
    await send_push_to_user(user_id, notif["title"], notif["body"], None, "withdraw_paused", notif["notif_id"])
    return True


async def notify_services_limited_once(user_id: str) -> bool:
    created_at = now_utc()
    updated = await db.users.update_one(
        {"user_id": user_id, SERVICES_LIMITED_NOTICE_FLAG: {"$exists": False}},
        {"$set": {SERVICES_LIMITED_NOTICE_FLAG: created_at, "updated_at": created_at}},
    )
    if updated.modified_count <= 0:
        return False
    notif = {
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "type": "services_limited",
        "title": SERVICES_LIMITED_NOTICE_TITLE,
        "body": SERVICES_LIMITED_NOTICE_BODY,
        "read": False,
        "created_at": created_at,
        "url": "/notifications",
    }
    await db.notifications.insert_one(notif)
    await send_push_to_user(user_id, notif["title"], notif["body"], None, "services_limited", notif["notif_id"])
    return True


async def announce_services_available_once(user_id: str) -> bool:
    created_at = now_utc()
    updated = await db.users.update_one(
        {"user_id": user_id, SERVICES_AVAILABLE_FLAG: {"$exists": False}},
        {"$set": {SERVICES_AVAILABLE_FLAG: created_at, "updated_at": created_at}},
    )
    if updated.modified_count <= 0:
        return False
    notif = {
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "type": "services_available",
        "title": SERVICES_AVAILABLE_TITLE,
        "body": SERVICES_AVAILABLE_BODY,
        "read": False,
        "created_at": created_at,
        "url": "/notifications",
    }
    await db.notifications.insert_one(notif)
    await send_push_to_user(user_id, notif["title"], notif["body"], None, "services_available", notif["notif_id"])
    return True


def game_today_key() -> str:
    return now_utc().date().isoformat()


def game_notice_flag(day: Optional[str] = None) -> str:
    return f"{GAME_TICKET_NOTICE_PREFIX}{(day or game_today_key()).replace('-', '_')}"


async def ensure_game_tickets(user_id: str) -> dict:
    day = game_today_key()
    flag = game_notice_flag(day)
    user = await find_user_full(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    tickets = int(user.get("game_tickets") or 0)
    patch = {"game_ticket_day": day, "updated_at": now_utc()}
    recharged = False
    global_recharged = False
    if user.get("game_ticket_day") != day:
        tickets = GAME_DAILY_TICKETS
        patch["game_tickets"] = tickets
        recharged = True
    if not user.get(GAME_GLOBAL_RECHARGE_FLAG):
        tickets = max(tickets, GAME_DAILY_TICKETS)
        patch["game_tickets"] = tickets
        patch[GAME_GLOBAL_RECHARGE_FLAG] = now_utc()
        global_recharged = True
    if recharged and not user.get(flag):
        patch[flag] = now_utc()
        notif_id = f"ntf_{uuid.uuid4().hex[:10]}"
        await db.notifications.insert_one({
            "notif_id": notif_id,
            "user_id": user_id,
            "type": "game_tickets",
            "title": "Tickets jeux recharges",
            "body": f"{GAME_DAILY_TICKETS} tickets bonus sont disponibles pour les jeux du profil. Une seule recharge est notifiee par jour.",
            "read": False,
            "created_at": now_utc(),
            "url": "/games",
        })
        await send_push_to_user(user_id, "Tickets jeux recharges", f"{GAME_DAILY_TICKETS} tickets bonus sont disponibles.", None, "game_tickets", notif_id)
    elif global_recharged:
        notif_id = f"ntf_{uuid.uuid4().hex[:10]}"
        await db.notifications.insert_one({
            "notif_id": notif_id,
            "user_id": user_id,
            "type": "game_tickets",
            "title": "Recharge globale tickets",
            "body": f"{GAME_DAILY_TICKETS} tickets bonus ont ete recharges pour tous les comptes actifs.",
            "read": False,
            "created_at": now_utc(),
            "url": "/games",
        })
        await send_push_to_user(user_id, "Recharge globale tickets", f"{GAME_DAILY_TICKETS} tickets bonus ont ete ajoutes.", None, "game_tickets", notif_id)
    await db.users.update_one({"user_id": user_id}, {"$set": patch})
    fresh = await find_user_full(user_id) or {}
    return {
        "tickets": int(fresh.get("game_tickets") or tickets),
        "daily_tickets": GAME_DAILY_TICKETS,
        "day": day,
        "notice_sent": bool(fresh.get(flag) or patch.get(flag)),
        "stats": fresh.get("game_stats") or {},
        "currency": "XOF",
        "games": [{"id": key, **cfg} for key, cfg in GAME_CONFIG.items()],
        "heroes": SUPERHERO_ROSTER,
    }


def hero_power_score(hero: dict, mode: str = "hero_duel") -> int:
    stats = hero.get("stats") or {}
    if mode == "speed_run":
        weights = {"speed": 2.0, "combat": 1.3, "power": 1.0, "durability": 0.8, "strength": 0.6, "intelligence": 0.8}
    elif mode == "power_match":
        weights = {"power": 1.8, "strength": 1.5, "durability": 1.2, "combat": 1.0, "speed": 0.8, "intelligence": 0.9}
    else:
        weights = {"combat": 1.5, "intelligence": 1.25, "power": 1.2, "durability": 1.0, "strength": 0.9, "speed": 0.8}
    return int(sum(float(stats.get(key) or 0) * value for key, value in weights.items()))


def build_hero_round(user_id: str, game_id: str, seed: str, roll: float) -> dict:
    pool = SUPERHERO_ROSTER
    first_index = int(stable_random(seed + ":hero-a") * len(pool)) % len(pool)
    second_index = int(stable_random(seed + ":hero-b") * len(pool)) % len(pool)
    if first_index == second_index:
        second_index = (second_index + 7) % len(pool)
    player = pool[first_index]
    rival = pool[second_index]
    player_score = hero_power_score(player, game_id) + int(stable_random(seed + ":boost-a") * 60)
    rival_score = hero_power_score(rival, game_id) + int(stable_random(seed + ":boost-b") * 60)
    margin = player_score - rival_score
    return {
        "player": player,
        "rival": rival,
        "player_score": player_score,
        "rival_score": rival_score,
        "margin": margin,
        "rule": "ticket_required",
        "seed_hint": hashlib.sha256(f"{user_id}:{game_id}:{roll}".encode()).hexdigest()[:10],
    }


async def play_game(user: dict, game_id: str) -> dict:
    config = GAME_CONFIG.get(game_id)
    if not config:
        raise HTTPException(status_code=400, detail="Jeu indisponible")
    await ensure_game_tickets(user["user_id"])
    fresh = await find_user_full(user["user_id"]) or user
    tickets = int(fresh.get("game_tickets") or 0)
    if tickets <= 0:
        raise HTTPException(status_code=400, detail="Plus de tickets disponibles. Les tickets seront recharges automatiquement.")
    roll = secrets.randbelow(10000) / 10000
    hero_round = build_hero_round(user["user_id"], game_id, f"{user['user_id']}:{game_id}:{now_utc().isoformat()}:{roll}", roll) if config.get("mode") == "hero" else None
    hero_adjustment = 0.0
    if hero_round:
        hero_adjustment = clamp(hero_round["margin"], -180, 180) / 1600
    won = roll < clamp(float(config["win_chance"]) + hero_adjustment, 0.08, 0.72)
    seed = f"{user['user_id']}:{game_id}:{now_utc().isoformat()}:{roll}"
    prize = 0
    if won:
        spread = int(config["max_prize"]) - int(config["min_prize"])
        prize = int(config["min_prize"]) + int(stable_shop_number(seed) * max(1, spread))
        prize = int(round(prize / 10) * 10)
    txn_id = f"txn_{uuid.uuid4().hex[:12]}" if won else None
    event_id = f"game_{uuid.uuid4().hex[:12]}"
    balance_key = "balances.XOF"
    stats_key = f"game_stats.{game_id}"
    update = {
        "$inc": {"game_tickets": -1, f"{stats_key}.plays": 1},
        "$set": {"updated_at": now_utc(), "last_game_play_at": now_utc()},
    }
    if won:
        update["$inc"][balance_key] = prize
        update["$inc"][f"{stats_key}.wins"] = 1
        update["$inc"][f"{stats_key}.prizes"] = prize
    updated_user = await db.users.find_one_and_update(
        {"user_id": user["user_id"], "game_tickets": {"$gte": 1}},
        update,
        projection={"_id": 0, "password_hash": 0},
        return_document=ReturnDocument.AFTER,
    )
    if not updated_user:
        raise HTTPException(status_code=409, detail="Ticket deja utilise. Rechargez la page des jeux.")
    event = {
        "event_id": event_id,
        "user_id": user["user_id"],
        "game_id": game_id,
        "game_name": config["name"],
        "won": won,
        "prize": prize,
        "currency": "XOF",
        "txn_id": txn_id,
        "created_at": now_utc(),
    }
    if hero_round:
        event["details"] = hero_round
    await db.game_events.insert_one(event)
    if won and txn_id:
        txn = {
            "txn_id": txn_id,
            "type": "game_win",
            "user_id": user["user_id"],
            "participants": [user["user_id"]],
            "amount": prize,
            "currency": "XOF",
            "status": "completed",
            "reference": f"GAME-{event_id[-8:].upper()}",
            "game_id": game_id,
            "created_at": now_utc(),
        }
        notif_id = f"ntf_{uuid.uuid4().hex[:10]}"
        await db.transactions.insert_one(txn)
        await db.notifications.insert_one({
            "notif_id": notif_id,
            "user_id": user["user_id"],
            "type": "game_win",
            "txn_id": txn_id,
            "title": "Gain jeu credite",
            "body": f"+{prize} XOF credites depuis {config['name']}. Reference {txn['reference']}.",
            "read": False,
            "created_at": now_utc(),
            "url": f"/receipt/{txn_id}",
        })
        await send_push_to_user(user["user_id"], "Gain jeu credite", f"+{prize} XOF credites.", txn_id, "game_win", notif_id)
        event["transaction"] = txn
    return {
        "ok": True,
        "result": "win" if won else "loss",
        "won": won,
        "prize": prize,
        "currency": "XOF",
        "tickets": int(updated_user.get("game_tickets") or 0),
        "balances": updated_user.get("balances") or {},
        "event": event,
    }


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


class GamePlayIn(BaseModel):
    game_id: str = "scratch"


class SellerProfileIn(BaseModel):
    store_name: Optional[str] = None
    bio: Optional[str] = None
    city: Optional[str] = None
    support_phone: Optional[str] = None
    pickup_zone: Optional[str] = None


class SellerArticleIn(BaseModel):
    title: str
    description: str
    category: str = "Vendeur certifie"
    image: str
    price: float
    stock: int = 1
    tags: List[str] = Field(default_factory=list)


class MovieLibraryToggleIn(BaseModel):
    tmdb_id: int
    media_type: str = "movie"
    list_type: str = "watchlist"
    item: Optional[Dict[str, Any]] = None
    active: bool = True


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
    await notify_withdraw_paused_once(user["user_id"])
    await announce_services_available_once(user["user_id"])
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
    ("gaming laptop", 620.0), ("macbook air m4 13", 999.0), ("macbook air m4 15", 1199.0),
    ("macbook pro m4 pro", 1999.0), ("macbook pro 16", 2499.0), ("m4 max", 2499.0),
    ("imac 24", 1299.0), ("mac mini", 599.0), ("dell xps", 1180.0), ("hp spectre", 1180.0),
    ("thinkpad x1", 1180.0), ("surface laptop", 1180.0), ("galaxy book", 1180.0),
    ("lenovo legion", 1450.0), ("asus rog", 1450.0), ("msi stealth", 1450.0), ("predator helios", 1450.0),
    ("laptop", 320.0), ("55-inch", 290.0), ("55 inch", 290.0),
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


REAL_PRODUCT_IMAGE_POOLS = {
    "jewelry": [
        "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1522312346375-d1a52e2b99b3?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=900&q=80",
    ],
    "women_fashion": [
        "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80",
    ],
    "men_fashion": [
        "https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1520975682031-a51d3c6d7cb1?auto=format&fit=crop&w=900&q=80",
    ],
    "men_shoes": [
        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=900&q=80",
    ],
    "women_shoes": [
        "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=900&q=80",
    ],
    "electronics": [
        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80",
    ],
    "lifestyle": [
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=900&q=80",
    ],
}


GENERATED_MARKET_PACKS = [
    {
        "key": "jewelry", "count": 150, "category": "Bijoux 2025-2026",
        "brand_pool": ["Aurelia", "Maison Dore", "Luna Pearl", "Nova Bijoux", "Orline"],
        "noun_pool": ["Bague solitaire", "Collier maille fine", "Bracelet tennis", "Creoles polies", "Pendentif coeur", "Set bague et boucles"],
        "style_pool": ["vermeil 18k", "argent 925", "cristal premium", "perles nacrees", "acier dore"],
        "detail_pool": ["boite cadeau", "anti-ternissure", "taille ajustable", "edition soiree", "serti lumineux"],
        "image_pool": REAL_PRODUCT_IMAGE_POOLS["jewelry"], "min_price": 18.0, "max_price": 260.0,
        "tags": ["bijoux", "cadeau", "2026", "promotion"],
    },
    {
        "key": "women-fashion", "count": 200, "category": "Mode femme 2025-2026",
        "brand_pool": ["Nova Mode", "Lyla Studio", "Sheen Select", "Urban Muse", "Cote Femme"],
        "noun_pool": ["Robe satin", "Blazer coupe courte", "Top maille", "Jean wide leg", "Ensemble deux pieces", "Chemise oversize", "Jupe plisse"],
        "style_pool": ["minimal chic", "pastel ete", "business doux", "streetwear premium", "soiree elegante"],
        "detail_pool": ["tissu respirant", "coupe actuelle", "finition douce", "taille inclusive", "collection 2026"],
        "image_pool": REAL_PRODUCT_IMAGE_POOLS["women_fashion"], "min_price": 9.0, "max_price": 74.0,
        "tags": ["femme", "mode", "shein-style", "2026"],
    },
    {
        "key": "men-fashion", "count": 200, "category": "Mode homme 2025-2026",
        "brand_pool": ["Northline", "Atlas Wear", "Urban Gent", "Mode Homme FX", "Cobalt Studio"],
        "noun_pool": ["Chemise oxford", "Polo premium", "Jean slim confort", "Veste bomber", "Sweat molleton", "Pantalon cargo", "Blazer leger"],
        "style_pool": ["casual business", "street premium", "sport chic", "minimal noir", "weekend urbain"],
        "detail_pool": ["coutures renforcees", "coupe moderne", "matiere respirante", "facile a assortir", "collection 2026"],
        "image_pool": REAL_PRODUCT_IMAGE_POOLS["men_fashion"], "min_price": 12.0, "max_price": 92.0,
        "tags": ["homme", "mode", "2026", "promo"],
    },
    {
        "key": "men-shoes", "count": 100, "category": "Chaussures homme 2025-2026",
        "brand_pool": ["Stride Pro", "AeroStep", "Urban Sole", "FlexRun", "North Boot"],
        "noun_pool": ["Sneakers running", "Derbies cuir", "Baskets basses", "Boots urbaines", "Mocassins souples"],
        "style_pool": ["semelle confort", "cuir premium", "mesh respirant", "look sport luxe", "usage quotidien"],
        "detail_pool": ["anti-glisse", "legeres", "amorti renforce", "collection 2026", "finition durable"],
        "image_pool": REAL_PRODUCT_IMAGE_POOLS["men_shoes"], "min_price": 24.0, "max_price": 165.0,
        "tags": ["chaussures", "homme", "sneakers", "2026"],
    },
    {
        "key": "women-shoes", "count": 150, "category": "Chaussures femme 2025-2026",
        "brand_pool": ["Bella Step", "Luna Shoes", "Nova Heel", "Soft Walk", "Muse Sole"],
        "noun_pool": ["Sandales talon", "Sneakers pastel", "Escarpins vernis", "Bottines chic", "Mules confort", "Ballerines souples"],
        "style_pool": ["soiree", "bureau", "casual luxe", "ete 2026", "brillant discret"],
        "detail_pool": ["semelle stable", "confort long port", "finition elegante", "anti-glisse", "forme moderne"],
        "image_pool": REAL_PRODUCT_IMAGE_POOLS["women_shoes"], "min_price": 18.0, "max_price": 150.0,
        "tags": ["chaussures", "femme", "talons", "2026"],
    },
    {
        "key": "electronics", "count": 200, "category": "Electronique & ordinateurs 2025-2026",
        "brand_pool": ["Apple", "Dell", "HP", "Lenovo", "ASUS", "MSI", "Samsung", "Acer", "Microsoft"],
        "noun_pool": ["MacBook Air M4 13 16Go 256Go", "MacBook Air M4 15 16Go 512Go", "MacBook Pro M4 Pro 14 24Go 512Go", "MacBook Pro 16 M4 Max 36Go 1To", "iMac 24 M4", "Mac mini M4", "Dell XPS 13 2025", "HP Spectre x360 14", "ThinkPad X1 Carbon Gen 13", "Surface Laptop 7", "ASUS ROG Zephyrus G14", "Lenovo Legion Pro 7i", "MSI Stealth 16", "Acer Predator Helios Neo 16", "Galaxy Book4 Pro", "Moniteur OLED 27 240Hz", "SSD NVMe 2To", "Station dock USB-C Pro"],
        "style_pool": ["stock verifie", "haute performance", "pro createur", "gaming fluide", "bureau premium"],
        "detail_pool": ["garantie partenaire", "edition 2025-2026", "pret pour IA", "prix reduit", "configuration fiable"],
        "image_pool": REAL_PRODUCT_IMAGE_POOLS["electronics"], "min_price": 45.0, "max_price": 2499.0,
        "tags": ["ordinateur", "mac", "pc", "electronique", "2026"],
    },
    {
        "key": "lifestyle", "count": 100, "category": "Maison & lifestyle 2025-2026",
        "brand_pool": ["HomeLine", "Travel FX", "WorkNest", "Pure Casa", "Daily Plus"],
        "noun_pool": ["Valise cabine", "Lampe bureau LED", "Sac ordinateur", "Organiseur maison", "Set verres premium", "Diffuseur aromatique"],
        "style_pool": ["compact", "moderne", "durable", "minimal", "cadeau utile"],
        "detail_pool": ["usage quotidien", "finition propre", "gain de place", "collection 2026", "prix doux"],
        "image_pool": REAL_PRODUCT_IMAGE_POOLS["lifestyle"], "min_price": 8.0, "max_price": 230.0,
        "tags": ["maison", "lifestyle", "utile", "2026"],
    },
]

GENERATED_MARKET_PRODUCTS: Optional[List[dict]] = None


def generated_raw_price(pack: dict, index: int, title: str) -> float:
    label = title.lower()
    explicit = [
        ("macbook air m4 13", 999.0), ("macbook air m4 15", 1199.0), ("macbook pro m4 pro 14", 1999.0),
        ("macbook pro 16", 2499.0), ("imac 24", 1299.0), ("mac mini", 599.0), ("dell xps", 1199.0),
        ("spectre", 1199.0), ("thinkpad", 1199.0), ("surface laptop", 1199.0), ("galaxy book", 1199.0),
        ("rog", 1499.0), ("legion", 1499.0), ("msi", 1499.0), ("predator", 1499.0),
        ("oled 27", 649.0), ("ssd nvme", 129.0), ("station dock", 89.0),
    ]
    for needle, price in explicit:
        if needle in label:
            return price
    return float(pack["min_price"]) + stable_shop_number(f"{pack['key']}:{index}:{title}:price") * (float(pack["max_price"]) - float(pack["min_price"]))


def clean_shop_tags(values: List[Any]) -> List[str]:
    seen = []
    for value in values:
        raw_items = value if isinstance(value, list) else [value]
        for item in raw_items:
            label = str(item or "").strip()
            if label and label not in seen:
                seen.append(label)
    return seen[:8]


def build_generated_market_products() -> List[dict]:
    global GENERATED_MARKET_PRODUCTS
    if GENERATED_MARKET_PRODUCTS is not None:
        return GENERATED_MARKET_PRODUCTS
    products: List[dict] = []
    for pack in GENERATED_MARKET_PACKS:
        for index in range(int(pack["count"])):
            n = index + 1
            brand = pack["brand_pool"][index % len(pack["brand_pool"])]
            noun = pack["noun_pool"][(index * 3 + 1) % len(pack["noun_pool"])]
            style = pack["style_pool"][(index * 5 + 2) % len(pack["style_pool"])]
            detail = pack["detail_pool"][(index * 7 + 3) % len(pack["detail_pool"])]
            year = "2026" if index % 3 == 0 else "2025"
            title = f"{brand} {noun} {style} {year} - S{n:03d}"
            product_id = f"gen_{pack['key']}_{n:03d}"
            image = pack["image_pool"][index % len(pack["image_pool"])]
            price = market_adjusted_price_usd(generated_raw_price(pack, index, title), f"generated:{product_id}:{title}", title, pack["category"])
            clean_key = re.sub(r"[^A-Z0-9]", "", pack["key"].upper())[:6]
            products.append({
                "id": product_id,
                "title": title,
                "brand": brand,
                "description": f"{noun} {style}, selection {year} avec une image representative du rayon, une reference boutique unique et un prix reduit pour attirer les clients FX Pro.",
                "category": pack["category"],
                "image": image,
                "base_currency": "USD",
                "base_price": price,
                "rating": round_shop_money(4.35 + stable_shop_number(f"{product_id}:rating") * 0.58, "USD"),
                "stock": 6 + int(stable_shop_number(f"{product_id}:stock") * 88),
                "tags": clean_shop_tags([pack["tags"], noun, style, detail, year]),
                "source": "generated",
                "sku": f"FX-{clean_key}-{n:04d}",
                "ref": f"FXP-{year}-{pack['key'].upper()[:3]}-{n:04d}",
                "warranty": "Garantie partenaire 12 mois" if "electronique" in pack["category"].lower() else "Garantie boutique 30 jours",
                "shipping": "Livraison partenaire ou suivi FX Pro apres paiement",
                "availability": "In Stock",
                "return_policy": "Retour selon controle produit et disponibilite partenaire",
                "minimum_order_quantity": 1,
                "images": [image],
                "review_count": 24 + int(stable_shop_number(f"{product_id}:reviews") * 420),
            })
    GENERATED_MARKET_PRODUCTS = products
    return products


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


async def get_seller_catalog_products() -> List[dict]:
    items = await db.shop_seller_articles.find(
        {"status": "active", "deleted_at": {"$exists": False}},
        {"_id": 0},
    ).sort("updated_at", -1).limit(300).to_list(300)
    products = []
    for item in items:
        products.append({
            "id": item["article_id"],
            "title": item["title"],
            "brand": item.get("store_name") or "Vendeur certifie",
            "seller_store_name": item.get("store_name") or "Vendeur certifie",
            "description": item.get("description") or "Article publie par un vendeur KYC certifie FX Pro.",
            "category": item.get("category") or "Vendeurs certifies",
            "image": item.get("image") or SHOP_FALLBACK_PRODUCTS[0]["image"],
            "base_currency": "USD",
            "base_price": round_shop_money(float(item.get("base_price") or item.get("price") or 1), "USD"),
            "rating": round_shop_money(4.2 + stable_shop_number(item["article_id"]) * 0.7, "USD"),
            "stock": max(0, int(item.get("stock") or 0)),
            "tags": clean_shop_tags([item.get("tags") or [], "vendeur certifie", "kyc"]),
            "source": "seller",
            "sku": item.get("sku") or f"SELL-{item['article_id'][-8:].upper()}",
            "ref": item.get("reference") or f"SELL-{item['article_id'][-8:].upper()}",
            "seller_id": item.get("user_id"),
            "seller_verified": True,
            "warranty": item.get("warranty") or "Controle vendeur KYC FX Pro",
            "shipping": item.get("shipping") or "Livraison ou retrait coordonne par le vendeur certifie",
            "availability": "In Stock" if int(item.get("stock") or 0) > 0 else "Out of Stock",
            "return_policy": "Retour selon profil vendeur et mediation FX Pro",
            "minimum_order_quantity": 1,
            "images": [item.get("image") or SHOP_FALLBACK_PRODUCTS[0]["image"]],
            "review_count": 12 + int(stable_shop_number(item["article_id"] + ":reviews") * 120),
        })
    return products


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
    await notify_withdraw_paused_once(user_id)
    update_flag = "shop_update_pickup_paused_2026_05_18_at"
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
    remote, dummy, free, fake, escuela, seller_products, overrides = await asyncio.gather(
        fetch_apilayer_shop_products(query),
        fetch_dummyjson_shop_products(150),
        fetch_free_ecommerce_shop_products(),
        fetch_fakestore_shop_products(),
        fetch_escuelajs_shop_products(),
        get_seller_catalog_products(),
        get_shop_overrides(),
    )
    if user_id:
        await announce_shop_available(user_id)
        await announce_services_available_once(user_id)
    generated = build_generated_market_products()
    products = apply_shop_overrides(dedupe_shop_products(seller_products + remote + dummy + free + fake + escuela + SHOP_FALLBACK_PRODUCTS + generated), overrides)[:MAX_SHOP_PRODUCTS]
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
    source = "mixed" if (seller_products or remote or dummy or free or fake or escuela or generated) else "fallback"
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
            "source": product.get("source"),
            "seller_id": product.get("seller_id"),
            "seller_store_name": product.get("brand"),
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


def seller_public_profile(profile: Optional[dict], user: dict) -> dict:
    kyc_verified = user.get("kyc_status") == "verified"
    base = profile or {}
    return {
        "seller_id": base.get("seller_id") or f"seller_{user['user_id']}",
        "user_id": user["user_id"],
        "store_name": base.get("store_name") or f"Boutique de {user.get('name') or 'vendeur'}",
        "bio": base.get("bio") or "Vendeur FX Pro avec articles suivis et profil controle.",
        "city": base.get("city") or "",
        "support_phone": base.get("support_phone") or user.get("phone") or "",
        "pickup_zone": base.get("pickup_zone") or "Coordination apres commande",
        "status": "active" if kyc_verified else "kyc_required",
        "kyc_required": not kyc_verified,
        "kyc_status": user.get("kyc_status") or "pending",
        "benefits": [
            "Badge vendeur certifie KYC",
            "Gestion creer / modifier / supprimer",
            "Suivi commandes, recus et notifications vendeur",
            "Mise en avant dans le catalogue et les promotions",
            "Mediation client et historique vendeur",
            "Statut boutique avec ville, support et zone de livraison",
            "Commandes vendeur visibles depuis le profil",
        ],
        "updated_at": base.get("updated_at") or now_utc(),
    }


async def get_seller_orders_feed(user_id: str, limit: int = 40) -> List[dict]:
    return await db.shop_seller_orders.find({"seller_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)


async def require_verified_seller(user: dict) -> dict:
    if user.get("kyc_status") != "verified":
        raise HTTPException(status_code=403, detail="KYC certifie obligatoire pour vendre, modifier ou supprimer un article.")
    profile = await db.shop_sellers.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not profile:
        profile = seller_public_profile(None, user)
        profile.update({"created_at": now_utc(), "updated_at": now_utc()})
        await db.shop_sellers.update_one({"user_id": user["user_id"]}, {"$set": profile}, upsert=True)
    return profile


def clean_seller_article(data: SellerArticleIn, user: dict, profile: dict, article_id: Optional[str] = None) -> dict:
    title = data.title.strip()
    description = data.description.strip()
    image = data.image.strip()
    if len(title) < 3:
        raise HTTPException(status_code=400, detail="Nom d'article trop court")
    if len(description) < 12:
        raise HTTPException(status_code=400, detail="Description trop courte")
    if not image.startswith("http"):
        raise HTTPException(status_code=400, detail="Image produit HTTP/HTTPS requise")
    if data.price <= 0:
        raise HTTPException(status_code=400, detail="Prix invalide")
    if data.stock < 0:
        raise HTTPException(status_code=400, detail="Stock invalide")
    aid = article_id or f"seller_{user['user_id']}_{uuid.uuid4().hex[:8]}"
    return {
        "article_id": aid,
        "user_id": user["user_id"],
        "seller_id": profile.get("seller_id") or f"seller_{user['user_id']}",
        "store_name": profile.get("store_name") or f"Boutique de {user.get('name')}",
        "title": title[:120],
        "description": description[:500],
        "category": (data.category or "Vendeur certifie").strip()[:80],
        "image": image,
        "base_price": round_shop_money(float(data.price), "USD"),
        "price": round_shop_money(float(data.price), "USD"),
        "stock": max(0, min(999, int(data.stock))),
        "tags": clean_shop_tags([data.tags, "vendeur certifie", "kyc"]),
        "status": "active",
        "sku": f"SELL-{aid[-8:].upper()}",
        "reference": f"SELL-{aid[-8:].upper()}",
        "updated_at": now_utc(),
    }


async def fanout_seller_order_notifications(order: dict, buyer: dict) -> List[dict]:
    seller_groups: Dict[str, List[dict]] = {}
    for item in order.get("items") or []:
        seller_id = str(item.get("seller_id") or "").strip()
        if not seller_id or seller_id == buyer["user_id"] or item.get("source") != "seller":
            continue
        seller_groups.setdefault(seller_id, []).append(item)
    if not seller_groups:
        return []
    created_at = now_utc()
    records = []
    notifications = []
    for seller_id, items in seller_groups.items():
        record = {
            "seller_order_id": f"sord_{uuid.uuid4().hex[:12]}",
            "seller_id": seller_id,
            "buyer_id": buyer["user_id"],
            "buyer_name": buyer.get("name"),
            "buyer_email": buyer.get("email"),
            "order_id": order.get("order_id"),
            "reference": order.get("reference"),
            "status": "new",
            "currency": order.get("currency"),
            "wallet_currency": order.get("wallet_currency"),
            "items": items,
            "item_count": sum(int(item.get("quantity") or 0) for item in items),
            "created_at": created_at,
            "updated_at": created_at,
        }
        records.append(record)
        notifications.append({
            "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
            "user_id": seller_id,
            "type": "shop_seller_order",
            "order_id": order.get("order_id"),
            "title": "Nouvelle commande vendeur",
            "body": f"{order.get('reference')}: {record['item_count']} article(s) vendeur a preparer.",
            "read": False,
            "created_at": created_at,
            "url": "/shop",
        })
    await db.shop_seller_orders.insert_many(records)
    await db.notifications.insert_many(notifications)
    await asyncio.gather(*[
        send_push_to_user(item["user_id"], item["title"], item["body"], order.get("transaction", {}).get("txn_id"), "shop_seller_order", item["notif_id"])
        for item in notifications
    ])
    return records


def tmdb_headers() -> Dict[str, str]:
    headers = {"Accept": "application/json"}
    if TMDB_READ_TOKEN:
        headers["Authorization"] = f"Bearer {TMDB_READ_TOKEN}"
    return headers


def tmdb_auth_params(params: Optional[dict] = None) -> dict:
    out = dict(params or {})
    if not TMDB_READ_TOKEN and TMDB_API_KEY:
        out["api_key"] = TMDB_API_KEY
    return out


def tmdb_image(path: Optional[str], size: str = "w500") -> str:
    return f"{TMDB_IMAGE_BASE}/{size}{path}" if path else ""


def normalize_tmdb_item(raw: dict, media_type: Optional[str] = None) -> Optional[dict]:
    kind = media_type or raw.get("media_type") or ("tv" if raw.get("name") else "movie")
    if kind not in ["movie", "tv"]:
        return None
    title = raw.get("title") or raw.get("name") or raw.get("original_title") or raw.get("original_name")
    if not title:
        return None
    release_date = raw.get("release_date") or raw.get("first_air_date") or ""
    return {
        "id": int(raw.get("id") or 0),
        "media_type": kind,
        "title": title,
        "overview": raw.get("overview") or "Synopsis indisponible pour le moment.",
        "poster_url": tmdb_image(raw.get("poster_path"), "w500"),
        "backdrop_url": tmdb_image(raw.get("backdrop_path"), "w780"),
        "vote_average": round(float(raw.get("vote_average") or 0), 1),
        "vote_count": int(raw.get("vote_count") or 0),
        "release_date": release_date,
        "popularity": float(raw.get("popularity") or 0),
        "genre_ids": [int(genre) for genre in (raw.get("genre_ids") or []) if str(genre).isdigit()],
        "source": "tmdb",
    }


async def tmdb_get(path: str, params: Optional[dict] = None) -> dict:
    if not TMDB_READ_TOKEN and not TMDB_API_KEY:
        raise RuntimeError("TMDB credentials missing")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(f"{TMDB_API_BASE}{path}", headers=tmdb_headers(), params=tmdb_auth_params(params))
    if response.status_code >= 400:
        raise RuntimeError(f"TMDB status {response.status_code}")
    return response.json()


def movie_group_ids(group_key: str, media_type: str) -> List[int]:
    group = MOVIE_GENRE_GROUPS.get(group_key or "all") or MOVIE_GENRE_GROUPS["all"]
    return [int(value) for value in group.get(media_type, []) if int(value) > 0]


def movie_sort_value(sort_key: str, media_type: str) -> str:
    if sort_key == "recent" and media_type == "tv":
        return "first_air_date.desc"
    return MOVIE_SORT_OPTIONS.get(sort_key, MOVIE_SORT_OPTIONS["popular"])


def movie_group_payload() -> List[dict]:
    return [{"id": key, "label": value["label"]} for key, value in MOVIE_GENRE_GROUPS.items()]


async def notify_movie_service_issue(user_id: str) -> None:
    flag = "movies_service_notice_2026_05_18_at"
    created_at = now_utc()
    updated = await db.users.update_one(
        {"user_id": user_id, flag: {"$exists": False}},
        {"$set": {flag: created_at, "updated_at": created_at}},
    )
    if updated.modified_count <= 0:
        return
    notif = {
        "notif_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "type": "movies_service",
        "title": "Films et series en mode secours",
        "body": "Le service films utilise un catalogue de secours si TMDB est indisponible. Favoris et listes restent sauvegardes.",
        "read": False,
        "created_at": created_at,
        "url": "/movies",
    }
    await db.notifications.insert_one(notif)
    await send_push_to_user(user_id, notif["title"], notif["body"], None, "movies_service", notif["notif_id"])


def tmdb_provider_names(payload: dict) -> List[str]:
    providers = []
    for bucket in ["flatrate", "ads", "free", "rent", "buy"]:
        providers.extend(payload.get(bucket) or [])
    unique = []
    seen = set()
    for provider in providers:
        name = str(provider.get("provider_name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        unique.append(name)
    return unique[:8]


async def build_movie_watch_options(media_type: str, tmdb_id: int) -> dict:
    watch_payload, fr_videos_payload, default_videos_payload = await asyncio.gather(
        tmdb_get(f"/{media_type}/{tmdb_id}/watch/providers"),
        tmdb_get(f"/{media_type}/{tmdb_id}/videos", {"language": "fr-FR"}),
        tmdb_get(f"/{media_type}/{tmdb_id}/videos"),
    )
    results = watch_payload.get("results") or {}
    chosen_region = next((region for region in ["FR", "CA", "BE", "CH", "US", "GB"] if results.get(region)), "")
    provider_block = results.get(chosen_region) or {}
    provider_names = tmdb_provider_names(provider_block)
    videos = (fr_videos_payload.get("results") or []) + (default_videos_payload.get("results") or [])
    best_video = None
    for video in videos:
        if str(video.get("site") or "").lower() != "youtube":
            continue
        if str(video.get("type") or "").lower() not in ["trailer", "teaser", "featurette", "clip"]:
            continue
        best_video = video
        if str(video.get("iso_639_1") or "").lower() == "fr":
            break
    trailer_url = f"https://www.youtube.com/watch?v={best_video['key']}" if best_video and best_video.get("key") else ""
    return {
        "tmdb_id": tmdb_id,
        "media_type": media_type,
        "watch_url": provider_block.get("link") or trailer_url,
        "trailer_url": trailer_url,
        "provider_region": chosen_region or "",
        "provider_names": provider_names,
        "has_vf": chosen_region in ["FR", "CA", "BE", "CH"] or str((best_video or {}).get("iso_639_1") or "").lower() == "fr",
    }


async def build_movies_catalog(
    user_id: Optional[str] = None,
    kind: str = "all",
    query: str = "",
    page: int = 1,
    genre: str = "all",
    sort: str = "popular",
    page_size: int = MOVIE_PAGE_SIZE_DEFAULT,
) -> dict:
    page = max(1, min(80, int(page or 1)))
    page_size = max(12, min(48, int(page_size or MOVIE_PAGE_SIZE_DEFAULT)))
    language = "fr-FR"
    clean_sort = sort if sort in MOVIE_SORT_OPTIONS else "popular"
    clean_genre = genre if genre in MOVIE_GENRE_GROUPS else "all"
    try:
        if user_id:
            await announce_services_available_once(user_id)
        if query.strip():
            payload = await tmdb_get("/search/multi", {"query": query.strip(), "page": page, "language": language, "include_adult": "false"})
            items = [item for item in (normalize_tmdb_item(raw) for raw in payload.get("results", [])) if item]
            total_results = int(payload.get("total_results") or len(items))
            total_pages = int(payload.get("total_pages") or page)
        else:
            endpoints = []
            if kind in ["all", "movie"]:
                movie_params = {
                    "page": page,
                    "language": language,
                    "sort_by": movie_sort_value(clean_sort, "movie"),
                    "include_adult": "false",
                    "vote_count.gte": 20,
                }
                movie_genres = movie_group_ids(clean_genre, "movie")
                if movie_genres:
                    movie_params["with_genres"] = ",".join(str(value) for value in movie_genres)
                endpoints.append(("/discover/movie", "movie", movie_params))
            if kind in ["all", "tv"]:
                tv_params = {
                    "page": page,
                    "language": language,
                    "sort_by": movie_sort_value(clean_sort, "tv"),
                    "include_adult": "false",
                    "vote_count.gte": 20,
                }
                tv_genres = movie_group_ids(clean_genre, "tv")
                if tv_genres:
                    tv_params["with_genres"] = ",".join(str(value) for value in tv_genres)
                endpoints.append(("/discover/tv", "tv", tv_params))
            responses = await asyncio.gather(*[tmdb_get(path, params) for path, _, params in endpoints])
            items = []
            total_results = 0
            total_pages = 0
            for payload, (_, media_type, _) in zip(responses, endpoints):
                total_results += int(payload.get("total_results") or 0)
                total_pages = max(total_pages, int(payload.get("total_pages") or 0))
                items.extend([item for item in (normalize_tmdb_item(raw, media_type) for raw in payload.get("results", [])) if item])
        seen = set()
        unique = []
        for item in sorted(items, key=lambda i: (i.get("popularity") or 0, i.get("vote_average") or 0), reverse=True):
            key = f"{item['media_type']}:{item['id']}"
            if key in seen:
                continue
            seen.add(key)
            unique.append(item)
        library = await get_movie_library(user_id) if user_id else []
        marks = {f"{item['media_type']}:{item['tmdb_id']}": item for item in library}
        for item in unique:
            mark = marks.get(f"{item['media_type']}:{item['id']}")
            item["favorite"] = bool(mark and mark.get("favorite"))
            item["watchlist"] = bool(mark and mark.get("watchlist"))
            item["watched"] = bool(mark and mark.get("watched"))
        return {
            "items": unique[:page_size],
            "source": "tmdb",
            "page": page,
            "page_size": page_size,
            "has_more": page < max(1, total_pages),
            "total_results": max(len(unique), total_results),
            "kind": kind,
            "query": query,
            "genre": clean_genre,
            "sort": clean_sort,
            "groups": movie_group_payload(),
            "attribution": "This product uses the TMDB API but is not endorsed or certified by TMDB.",
        }
    except Exception as exc:
        logger.warning("TMDB catalog failed: %s", exc)
        if user_id:
            await notify_movie_service_issue(user_id)
        return {
            "items": MOVIE_FALLBACK_ITEMS,
            "source": "fallback",
            "page": page,
            "page_size": page_size,
            "has_more": False,
            "total_results": len(MOVIE_FALLBACK_ITEMS),
            "kind": kind,
            "query": query,
            "genre": clean_genre,
            "sort": clean_sort,
            "groups": movie_group_payload(),
            "attribution": "This product uses the TMDB API but is not endorsed or certified by TMDB.",
        }


def normalize_free_game_item(raw: dict) -> Optional[dict]:
    title = str(raw.get("title") or "").strip()
    if not title:
        return None
    thumbnail = str(raw.get("thumbnail") or "").strip()
    return {
        "id": int(raw.get("id") or 0),
        "title": title,
        "thumbnail": thumbnail if thumbnail.startswith("http") else "",
        "short_description": str(raw.get("short_description") or "").strip() or "Description indisponible pour le moment.",
        "game_url": str(raw.get("game_url") or raw.get("freetogame_profile_url") or "").strip(),
        "genre": str(raw.get("genre") or "Autre").strip() or "Autre",
        "platform": str(raw.get("platform") or "PC (Windows)").strip() or "PC (Windows)",
        "publisher": str(raw.get("publisher") or "FreeToGame").strip() or "FreeToGame",
        "developer": str(raw.get("developer") or "FreeToGame").strip() or "FreeToGame",
        "release_date": str(raw.get("release_date") or "").strip(),
        "freetogame_profile_url": str(raw.get("freetogame_profile_url") or raw.get("game_url") or "").strip(),
    }


async def build_free_games_catalog(
    user_id: Optional[str] = None,
    query: str = "",
    genre: str = "all",
    platform: str = "all",
    page: int = 1,
    limit: int = 18,
) -> dict:
    clean_query = query.strip().lower()
    clean_genre = genre.strip().lower() or "all"
    clean_platform = platform.strip().lower() or "all"
    page = max(1, int(page or 1))
    limit = max(9, min(36, int(limit or 18)))
    if user_id:
        await announce_services_available_once(user_id)
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.get("https://www.freetogame.com/api/games")
        response.raise_for_status()
        raw_items = response.json()
        source = "freetogame"
    except Exception as exc:
        logger.warning("FreeToGame catalog failed: %s", exc)
        raw_items = FREE_GAME_FALLBACK_ITEMS
        source = "fallback"
    items = [item for item in (normalize_free_game_item(raw) for raw in raw_items) if item]
    genres = sorted({item["genre"] for item in items if item.get("genre")})
    platforms = sorted({item["platform"] for item in items if item.get("platform")})
    filtered = []
    for item in items:
        if clean_query and clean_query not in " ".join([
            item["title"],
            item.get("genre", ""),
            item.get("platform", ""),
            item.get("publisher", ""),
            item.get("developer", ""),
            item.get("short_description", ""),
        ]).lower():
            continue
        if clean_genre != "all" and item.get("genre", "").lower() != clean_genre:
            continue
        if clean_platform != "all" and clean_platform not in item.get("platform", "").lower():
            continue
        filtered.append(item)
    filtered.sort(key=lambda item: (item.get("genre") or "", item.get("title") or ""))
    start = (page - 1) * limit
    end = start + limit
    return {
        "items": filtered[start:end],
        "genres": genres,
        "platforms": platforms,
        "page": page,
        "limit": limit,
        "total_results": len(filtered),
        "has_more": end < len(filtered),
        "source": source,
    }


async def get_movie_library(user_id: str) -> List[dict]:
    return await db.movie_library.find({"user_id": user_id}, {"_id": 0}).sort("updated_at", -1).limit(300).to_list(300)


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


@api.get("/games/status")
async def games_status(user: dict = Depends(get_current_user)):
    return await ensure_game_tickets(user["user_id"])


@api.post("/games/play")
async def games_play(data: GamePlayIn, user: dict = Depends(get_current_user)):
    return await play_game(user, data.game_id)


@api.get("/shop/orders")
async def shop_orders(user: dict = Depends(get_current_user)):
    items = await db.shop_orders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"items": items}


@api.get("/shop/seller/profile")
async def shop_seller_profile(user: dict = Depends(get_current_user)):
    profile = await db.shop_sellers.find_one({"user_id": user["user_id"]}, {"_id": 0})
    articles = await db.shop_seller_articles.find(
        {"user_id": user["user_id"], "deleted_at": {"$exists": False}},
        {"_id": 0},
    ).sort("updated_at", -1).limit(100).to_list(100)
    orders = await get_seller_orders_feed(user["user_id"])
    return {"profile": seller_public_profile(profile, user), "articles": articles, "orders": orders}


@api.patch("/shop/seller/profile")
async def patch_shop_seller_profile(data: SellerProfileIn, user: dict = Depends(get_current_user)):
    profile = seller_public_profile(await db.shop_sellers.find_one({"user_id": user["user_id"]}, {"_id": 0}), user)
    patch = {
        "seller_id": profile["seller_id"],
        "user_id": user["user_id"],
        "store_name": (data.store_name or profile["store_name"]).strip()[:80],
        "bio": (data.bio or profile["bio"]).strip()[:300],
        "city": (data.city or profile["city"]).strip()[:80],
        "support_phone": (data.support_phone or profile["support_phone"]).strip()[:40],
        "pickup_zone": (data.pickup_zone or profile["pickup_zone"]).strip()[:120],
        "status": "active" if user.get("kyc_status") == "verified" else "kyc_required",
        "kyc_status": user.get("kyc_status") or "pending",
        "updated_at": now_utc(),
        "created_at": profile.get("created_at") or now_utc(),
    }
    await db.shop_sellers.update_one({"user_id": user["user_id"]}, {"$set": patch}, upsert=True)
    return {"profile": seller_public_profile(patch, user)}


@api.post("/shop/seller/articles")
async def create_seller_article(data: SellerArticleIn, user: dict = Depends(get_current_user)):
    profile = await require_verified_seller(user)
    item = clean_seller_article(data, user, profile)
    item["created_at"] = now_utc()
    await db.shop_seller_articles.insert_one(item)
    return {"ok": True, "article": item}


@api.patch("/shop/seller/articles/{article_id}")
async def update_seller_article(article_id: str, data: SellerArticleIn, user: dict = Depends(get_current_user)):
    profile = await require_verified_seller(user)
    existing = await db.shop_seller_articles.find_one({"article_id": article_id, "user_id": user["user_id"]}, {"_id": 0})
    if not existing or existing.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Article introuvable")
    patch = clean_seller_article(data, user, profile, article_id)
    patch["created_at"] = existing.get("created_at") or now_utc()
    await db.shop_seller_articles.update_one({"article_id": article_id, "user_id": user["user_id"]}, {"$set": patch})
    return {"ok": True, "article": patch}


@api.delete("/shop/seller/articles/{article_id}")
async def delete_seller_article(article_id: str, user: dict = Depends(get_current_user)):
    await require_verified_seller(user)
    updated = await db.shop_seller_articles.update_one(
        {"article_id": article_id, "user_id": user["user_id"], "deleted_at": {"$exists": False}},
        {"$set": {"status": "deleted", "deleted_at": now_utc(), "updated_at": now_utc()}},
    )
    if updated.modified_count <= 0:
        raise HTTPException(status_code=404, detail="Article introuvable")
    return {"ok": True}


@api.get("/movies/catalog")
async def movies_catalog(kind: str = "all", q: str = "", page: int = 1, genre: str = "all", sort: str = "popular", page_size: int = MOVIE_PAGE_SIZE_DEFAULT, user: Optional[dict] = Depends(get_current_user_optional)):
    clean_kind = kind if kind in ["all", "movie", "tv"] else "all"
    return await build_movies_catalog((user or {}).get("user_id"), clean_kind, q, page, genre, sort, page_size)


@api.get("/movies/watch")
async def movies_watch(media_type: str, tmdb_id: int, user: Optional[dict] = Depends(get_current_user_optional)):
    if media_type not in ["movie", "tv"]:
        raise HTTPException(status_code=400, detail="Type media invalide")
    if user:
        await announce_services_available_once(user["user_id"])
    return await build_movie_watch_options(media_type, int(tmdb_id))


@api.get("/movies/library")
async def movies_library(user: dict = Depends(get_current_user)):
    return {"items": await get_movie_library(user["user_id"])}


@api.post("/movies/library/toggle")
async def toggle_movie_library(data: MovieLibraryToggleIn, user: dict = Depends(get_current_user)):
    if data.media_type not in ["movie", "tv"]:
        raise HTTPException(status_code=400, detail="Type media invalide")
    if data.list_type not in ["favorite", "watchlist", "watched"]:
        raise HTTPException(status_code=400, detail="Liste invalide")
    key = {"user_id": user["user_id"], "tmdb_id": int(data.tmdb_id), "media_type": data.media_type}
    existing = await db.movie_library.find_one(key, {"_id": 0}) or {}
    patch = {
        **existing,
        **key,
        data.list_type: bool(data.active),
        "item": data.item or existing.get("item") or {},
        "updated_at": now_utc(),
        "created_at": existing.get("created_at") or now_utc(),
    }
    if not (patch.get("favorite") or patch.get("watchlist") or patch.get("watched")):
        await db.movie_library.delete_one(key)
        return {"ok": True, "removed": True}
    await db.movie_library.update_one(key, {"$set": patch}, upsert=True)
    return {"ok": True, "item": patch}


@api.get("/games/catalog")
async def games_catalog(
    q: str = "",
    genre: str = "all",
    platform: str = "all",
    page: int = 1,
    limit: int = 18,
    user: Optional[dict] = Depends(get_current_user_optional),
):
    return await build_free_games_catalog((user or {}).get("user_id"), q, genre, platform, page, limit)


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
    seller_orders = await fanout_seller_order_notifications(order, user)
    await send_push_to_user(user["user_id"], notif["title"], notif["body"], txn_id, "shop_purchase", notif["notif_id"])
    order.pop("_id", None)
    txn.pop("_id", None)
    return {"ok": True, "order": order, "transaction": txn, "seller_orders": seller_orders, "balances": updated_user.get("balances", {})}


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


@api.post("/admin/notifications/withdraw-paused")
async def admin_notify_withdraw_paused(_: dict = Depends(require_admin)):
    sent = 0
    skipped = 0
    cursor = db.users.find({"role": {"$ne": "admin"}}, {"_id": 0, "user_id": 1, WITHDRAW_PAUSED_NOTICE_FLAG: 1})
    async for item in cursor:
        if item.get(WITHDRAW_PAUSED_NOTICE_FLAG):
            skipped += 1
            continue
        if await notify_withdraw_paused_once(item["user_id"]):
            sent += 1
        else:
            skipped += 1
    return {"ok": True, "sent": sent, "skipped": skipped, "flag": WITHDRAW_PAUSED_NOTICE_FLAG}


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
    await db.shop_sellers.create_index("user_id", unique=True)
    await db.shop_seller_articles.create_index("article_id", unique=True)
    await db.shop_seller_articles.create_index([("user_id", 1), ("updated_at", -1)])
    await db.shop_seller_articles.create_index([("status", 1), ("updated_at", -1)])
    await db.shop_seller_orders.create_index([("seller_id", 1), ("created_at", -1)])
    await db.movie_library.create_index([("user_id", 1), ("tmdb_id", 1), ("media_type", 1)], unique=True)
    await db.movie_library.create_index([("user_id", 1), ("updated_at", -1)])
    await db.bonus_program.create_index("user_id", unique=True)
    await db.bonus_events.create_index("created_at")
    await db.risk_logs.create_index("created_at")
    await db.game_events.create_index("created_at")
    await db.game_events.create_index("user_id")

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
