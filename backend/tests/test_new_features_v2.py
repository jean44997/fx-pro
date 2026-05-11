"""FX Pro 2026 — Iteration 2 new feature tests.

Covers:
  - 19 currencies (incl. AUD, INR, BRL, ZAR, KES, GHS, SEK, AED)
  - GET /api/users/check (real-time recipient validation)
  - POST /api/profile/change-password
  - PATCH /api/profile with base64 picture
  - Vault (coffre): create, list, withdraw early (5% penalty), withdraw after unlock
  - Convert EUR→AUD (new currency)
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import os
import sys
from pathlib import Path

# Allow importing backend env
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE = "https://fx-transactions-pro.preview.emergentagent.com"
NEW_CURRENCIES = ["AUD", "INR", "BRL", "ZAR", "KES", "GHS", "SEK", "AED"]


# ============ Currencies / Rates ============
class TestNewCurrencies:
    def test_root_lists_19_currencies(self):
        r = requests.get(f"{BASE}/api/", timeout=15)
        assert r.status_code == 200
        body = r.json()
        for c in NEW_CURRENCIES:
            assert c in body["currencies"], f"Missing {c}"
        assert len(body["currencies"]) >= 19

    def test_rates_include_new_currencies(self):
        r = requests.get(f"{BASE}/api/rates", timeout=15)
        assert r.status_code == 200
        body = r.json()
        for c in NEW_CURRENCIES:
            assert c in body["rates"], f"Rate missing for {c}"
            assert body["rates"][c] > 0


# ============ Users check (real-time validation) ============
class TestUsersCheck:
    def test_check_existing_user(self, demo_headers):
        r = requests.get(f"{BASE}/api/users/check?email=admin@fxpro.com",
                         headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["exists"] is True
        assert body["email"] == "admin@fxpro.com"
        assert "name" in body

    def test_check_non_existing_user(self, demo_headers):
        r = requests.get(f"{BASE}/api/users/check?email=nobody_{uuid.uuid4().hex}@nope.com",
                         headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"exists": False}

    def test_check_self(self, demo_headers):
        r = requests.get(f"{BASE}/api/users/check?email=demo@fxpro.com",
                         headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["exists"] is True
        assert body.get("self") is True

    def test_check_requires_auth(self):
        r = requests.get(f"{BASE}/api/users/check?email=admin@fxpro.com", timeout=15)
        assert r.status_code == 401


# ============ Profile: change-password & picture ============
class TestChangePassword:
    """Uses a throw-away user so we don't impact demo creds for next tests."""

    def setup_method(self, method):
        self.email = f"TEST_pwd_{uuid.uuid4().hex[:8]}@fxtest.com"
        self.pw = "OldPass123"
        reg = requests.post(f"{BASE}/api/auth/register",
                            json={"email": self.email, "password": self.pw,
                                  "name": "TEST pwd"}, timeout=15)
        assert reg.status_code == 200
        self.token = reg.json()["token"]
        self.uid = reg.json()["user"]["user_id"]
        self.h = {"Authorization": f"Bearer {self.token}",
                  "Content-Type": "application/json"}

    def teardown_method(self, method):
        admin = requests.post(f"{BASE}/api/auth/login",
                              json={"email": "admin@fxpro.com",
                                    "password": "Admin@2026"}).json()["token"]
        requests.delete(f"{BASE}/api/admin/users/{self.uid}",
                        headers={"Authorization": f"Bearer {admin}"})

    def test_change_password_success_and_login_with_new(self):
        new_pw = "NewPass456"
        r = requests.post(f"{BASE}/api/profile/change-password", headers=self.h,
                          json={"old_password": self.pw, "new_password": new_pw}, timeout=15)
        assert r.status_code == 200, r.text
        # Login with new password
        lr = requests.post(f"{BASE}/api/auth/login",
                           json={"email": self.email, "password": new_pw}, timeout=15)
        assert lr.status_code == 200
        # Old password rejected
        lr_old = requests.post(f"{BASE}/api/auth/login",
                               json={"email": self.email, "password": self.pw}, timeout=15)
        assert lr_old.status_code == 401

    def test_change_password_wrong_old(self):
        r = requests.post(f"{BASE}/api/profile/change-password", headers=self.h,
                          json={"old_password": "wrong-old", "new_password": "AnotherPass1"}, timeout=15)
        assert r.status_code == 401

    def test_change_password_too_short(self):
        r = requests.post(f"{BASE}/api/profile/change-password", headers=self.h,
                          json={"old_password": self.pw, "new_password": "abc"}, timeout=15)
        assert r.status_code == 400


class TestProfilePicture:
    def test_update_picture_base64(self, demo_headers):
        # 1x1 transparent PNG base64 data URI
        b64 = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAA"
               "C0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
        r = requests.patch(f"{BASE}/api/profile", headers=demo_headers,
                           json={"picture": b64}, timeout=15)
        assert r.status_code == 200
        assert r.json()["picture"] == b64
        # GET /auth/me reflects picture
        me = requests.get(f"{BASE}/api/auth/me", headers=demo_headers, timeout=15)
        assert me.status_code == 200
        assert me.json()["picture"] == b64
        # cleanup
        requests.patch(f"{BASE}/api/profile", headers=demo_headers,
                       json={"picture": None})


# ============ Vault (Coffre) ============
class TestVault:
    def _ensure_demo_eur(self, admin_headers, min_eur: float = 200.0):
        users = requests.get(f"{BASE}/api/admin/users?search=demo@fxpro.com",
                             headers=admin_headers).json()["items"]
        demo = next(u for u in users if u["email"] == "demo@fxpro.com")
        cur = demo["balances"].get("EUR", 0)
        if cur < min_eur:
            requests.patch(f"{BASE}/api/admin/users/{demo['user_id']}/balance",
                           headers=admin_headers,
                           json={"currency": "EUR",
                                 "amount": round(min_eur - cur + 50, 2)}, timeout=15)
        return demo

    def test_vault_lock_50_eur_for_30_days(self, demo_headers, admin_headers):
        self._ensure_demo_eur(admin_headers, 100.0)
        me_before = requests.get(f"{BASE}/api/auth/me", headers=demo_headers).json()
        bal_before = me_before["balances"]["EUR"]
        unlock = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        r = requests.post(f"{BASE}/api/vault", headers=demo_headers,
                          json={"amount": 50.0, "currency": "EUR",
                                "unlock_at": unlock, "label": "Test 30d"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["vault"]["status"] == "locked"
        assert body["vault"]["amount"] == 50.0
        assert body["vault"]["currency"] == "EUR"
        assert body["balances"]["EUR"] == round(bal_before - 50.0, 4)
        # appears in list
        lst = requests.get(f"{BASE}/api/vault", headers=demo_headers, timeout=15).json()
        assert any(v["vault_id"] == body["vault"]["vault_id"] for v in lst["items"])
        # cleanup (withdraw to restore balance — incurs 5% penalty, acceptable for tests)
        requests.post(f"{BASE}/api/vault/{body['vault']['vault_id']}/withdraw",
                      headers=demo_headers, timeout=15)

    def test_vault_unlock_in_past_rejected(self, demo_headers):
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        r = requests.post(f"{BASE}/api/vault", headers=demo_headers,
                          json={"amount": 10.0, "currency": "EUR",
                                "unlock_at": past}, timeout=15)
        assert r.status_code == 400

    def test_vault_insufficient_balance(self, demo_headers):
        unlock = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
        r = requests.post(f"{BASE}/api/vault", headers=demo_headers,
                          json={"amount": 99999999.0, "currency": "EUR",
                                "unlock_at": unlock}, timeout=15)
        assert r.status_code == 400

    def test_vault_early_withdraw_5pct_penalty(self, demo_headers, admin_headers):
        self._ensure_demo_eur(admin_headers, 100.0)
        unlock = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
        cr = requests.post(f"{BASE}/api/vault", headers=demo_headers,
                           json={"amount": 100.0, "currency": "EUR",
                                 "unlock_at": unlock}, timeout=15)
        assert cr.status_code == 200, cr.text
        vid = cr.json()["vault"]["vault_id"]
        wr = requests.post(f"{BASE}/api/vault/{vid}/withdraw",
                           headers=demo_headers, timeout=15)
        assert wr.status_code == 200, wr.text
        body = wr.json()
        assert body["penalty"] == round(100.0 * 0.05, 4)
        assert body["amount_returned"] == round(100.0 - 5.0, 4)

    def test_vault_full_withdraw_after_unlock(self, demo_headers, admin_headers):
        """Create a vault then directly flip unlock_at to past via Mongo, then withdraw → full amount."""
        self._ensure_demo_eur(admin_headers, 100.0)
        unlock = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        cr = requests.post(f"{BASE}/api/vault", headers=demo_headers,
                           json={"amount": 60.0, "currency": "EUR",
                                 "unlock_at": unlock}, timeout=15)
        assert cr.status_code == 200, cr.text
        vid = cr.json()["vault"]["vault_id"]

        # Patch unlock_at to past via Mongo
        async def _flip():
            cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = cli[os.environ["DB_NAME"]]
            await db.vaults.update_one(
                {"vault_id": vid},
                {"$set": {"unlock_at": datetime.now(timezone.utc) - timedelta(minutes=5)}},
            )
            cli.close()
        asyncio.get_event_loop().run_until_complete(_flip())

        wr = requests.post(f"{BASE}/api/vault/{vid}/withdraw",
                           headers=demo_headers, timeout=15)
        assert wr.status_code == 200, wr.text
        body = wr.json()
        assert body["penalty"] == 0.0
        assert body["amount_returned"] == 60.0
        # status should be withdrawn
        lst = requests.get(f"{BASE}/api/vault", headers=demo_headers).json()["items"]
        v = next(x for x in lst if x["vault_id"] == vid)
        assert v["status"] == "withdrawn"

    def test_vault_double_withdraw_rejected(self, demo_headers, admin_headers):
        self._ensure_demo_eur(admin_headers, 50.0)
        unlock = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        cr = requests.post(f"{BASE}/api/vault", headers=demo_headers,
                           json={"amount": 20.0, "currency": "EUR",
                                 "unlock_at": unlock}, timeout=15)
        vid = cr.json()["vault"]["vault_id"]
        requests.post(f"{BASE}/api/vault/{vid}/withdraw", headers=demo_headers)
        r2 = requests.post(f"{BASE}/api/vault/{vid}/withdraw", headers=demo_headers)
        assert r2.status_code == 400


# ============ Convert with new currency ============
class TestConvertNewCurrencies:
    def test_convert_eur_to_aud(self, demo_headers, admin_headers):
        # ensure demo has EUR
        users = requests.get(f"{BASE}/api/admin/users?search=demo@fxpro.com",
                             headers=admin_headers).json()["items"]
        demo = next(u for u in users if u["email"] == "demo@fxpro.com")
        if demo["balances"].get("EUR", 0) < 10.0:
            requests.patch(f"{BASE}/api/admin/users/{demo['user_id']}/balance",
                           headers=admin_headers,
                           json={"currency": "EUR", "amount": 50.0})
        me = requests.get(f"{BASE}/api/auth/me", headers=demo_headers).json()
        before_aud = me["balances"].get("AUD", 0)
        r = requests.post(f"{BASE}/api/convert", headers=demo_headers,
                          json={"from_currency": "EUR", "to_currency": "AUD",
                                "amount": 5.0}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["transaction"]["from_currency"] == "EUR"
        assert body["transaction"]["to_currency"] == "AUD"
        assert body["balances"]["AUD"] > before_aud
