"""FX Pro 2026 — Comprehensive backend API tests.
Covers: auth, rates, convert, transfer, QR, txns, notifications, alerts, favorites, profile, admin.
"""
import time
import uuid
import requests
import pytest

BASE = "https://fx-transactions-pro.preview.emergentagent.com"


# ============ App info / root ============
class TestRoot:
    def test_root_returns_app_info(self):
        r = requests.get(f"{BASE}/api/", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["app"] == "FX Pro 2026"
        assert "currencies" in body
        for c in ["EUR", "XOF", "XAF", "USD", "GBP", "NGN", "MAD", "CAD", "CHF", "JPY", "CNY",
                  "AUD", "INR", "BRL", "ZAR", "KES", "GHS", "SEK", "AED"]:
            assert c in body["currencies"]
        assert len(body["currencies"]) >= 19


# ============ Auth ============
class TestAuth:
    def test_register_new_user_starts_with_zero_balance(self):
        email = f"TEST_{uuid.uuid4().hex[:8]}@fxtest.com"
        r = requests.post(f"{BASE}/api/auth/register",
                          json={"email": email, "password": "testpass123", "name": "TEST User"},
                          timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and "user" in body
        bal = body["user"]["balances"]
        assert all(amount == 0.0 for amount in bal.values())
        # cleanup via admin
        admin = requests.post(f"{BASE}/api/auth/login",
                              json={"email": "admin@fxpro.com", "password": "Admin@2026"}).json()["token"]
        requests.delete(f"{BASE}/api/admin/users/{body['user']['user_id']}",
                        headers={"Authorization": f"Bearer {admin}"})

    def test_register_duplicate_email(self):
        r = requests.post(f"{BASE}/api/auth/register",
                          json={"email": "demo@fxpro.com", "password": "x" * 8, "name": "dup"},
                          timeout=15)
        assert r.status_code == 409

    def test_admin_login(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": "admin@fxpro.com", "password": "Admin@2026"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["role"] == "admin"
        assert "token" in body

    def test_demo_login(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": "demo@fxpro.com", "password": "Demo@2026"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["role"] == "user"
        assert "token" in body

    def test_login_invalid_password(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": "demo@fxpro.com", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_auth_me_with_bearer(self, demo_headers):
        r = requests.get(f"{BASE}/api/auth/me", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == "demo@fxpro.com"

    def test_auth_me_without_token(self):
        r = requests.get(f"{BASE}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_logout(self, demo_headers):
        r = requests.post(f"{BASE}/api/auth/logout", headers=demo_headers, timeout=15)
        assert r.status_code == 200


# ============ Rates ============
class TestRates:
    def test_get_rates(self):
        r = requests.get(f"{BASE}/api/rates", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["base"] == "EUR"
        for c in ["EUR", "XOF", "USD", "GBP", "NGN", "MAD", "CAD", "CHF", "JPY", "CNY",
                  "AUD", "INR", "BRL", "ZAR", "KES", "GHS", "SEK", "AED"]:
            assert c in body["rates"], f"Missing currency {c}"

    def test_rates_history(self):
        r = requests.get(f"{BASE}/api/rates/history?pair=EUR_XOF", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["pair"] == "EUR_XOF"
        assert len(body["points"]) >= 30

    def test_rates_history_invalid_pair(self):
        r = requests.get(f"{BASE}/api/rates/history?pair=EUR_ZZZ", timeout=15)
        assert r.status_code == 400

    def test_rates_refresh_admin_only(self, demo_headers):
        r = requests.post(f"{BASE}/api/rates/refresh", headers=demo_headers, timeout=15)
        assert r.status_code == 403

    def test_rates_refresh_admin(self, admin_headers):
        r = requests.post(f"{BASE}/api/rates/refresh", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "rates" in r.json()

    def test_rates_override_admin(self, admin_headers):
        custom = {"EUR": 1.0, "XOF": 660.0, "USD": 1.10}
        r = requests.put(f"{BASE}/api/rates/override",
                         headers=admin_headers,
                         json={"base": "EUR", "rates": custom}, timeout=15)
        assert r.status_code == 200
        # restore live
        requests.post(f"{BASE}/api/rates/refresh", headers=admin_headers, timeout=15)


# ============ Convert ============
class TestConvert:
    def test_convert_eur_to_xof(self, demo_headers):
        # ensure demo has EUR
        me = requests.get(f"{BASE}/api/auth/me", headers=demo_headers).json()
        before_eur = me["balances"]["EUR"]
        before_xof = me["balances"]["XOF"]
        r = requests.post(f"{BASE}/api/convert", headers=demo_headers,
                          json={"from_currency": "EUR", "to_currency": "XOF", "amount": 10.0}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["transaction"]["type"] == "convert"
        assert body["transaction"]["from_currency"] == "EUR"
        assert body["transaction"]["to_currency"] == "XOF"
        assert body["balances"]["EUR"] == round(before_eur - 10.0, 4)
        assert body["balances"]["XOF"] > before_xof

    def test_convert_insufficient_balance(self, demo_headers):
        r = requests.post(f"{BASE}/api/convert", headers=demo_headers,
                          json={"from_currency": "EUR", "to_currency": "XOF", "amount": 999999.0}, timeout=15)
        assert r.status_code == 400

    def test_convert_invalid_amount(self, demo_headers):
        r = requests.post(f"{BASE}/api/convert", headers=demo_headers,
                          json={"from_currency": "EUR", "to_currency": "XOF", "amount": -5.0}, timeout=15)
        assert r.status_code == 400

    def test_convert_same_currency(self, demo_headers):
        r = requests.post(f"{BASE}/api/convert", headers=demo_headers,
                          json={"from_currency": "EUR", "to_currency": "EUR", "amount": 1.0}, timeout=15)
        assert r.status_code == 400


# ============ Transfer P2P ============
class TestTransfer:
    def test_transfer_by_email(self, demo_headers, admin_headers):
        # Demo → Admin
        r = requests.post(f"{BASE}/api/transfer", headers=demo_headers,
                          json={"recipient": "admin@fxpro.com", "by": "email",
                                "amount": 5.0, "currency": "EUR", "note": "TEST transfer"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["transaction"]["type"] == "transfer"
        assert body["transaction"]["receiver_email"] == "admin@fxpro.com"
        assert body["transaction"]["amount"] == 5.0
        # Verify notifications for both
        sender_notif = requests.get(f"{BASE}/api/notifications", headers=demo_headers).json()["items"]
        receiver_notif = requests.get(f"{BASE}/api/notifications", headers=admin_headers).json()["items"]
        assert any("envoyé" in n["title"].lower() or "envoy" in n["title"].lower() for n in sender_notif)
        assert any("reçu" in n["title"].lower() or "reç" in n["title"].lower() for n in receiver_notif)

    def test_transfer_self_rejected(self, demo_headers):
        r = requests.post(f"{BASE}/api/transfer", headers=demo_headers,
                          json={"recipient": "demo@fxpro.com", "by": "email",
                                "amount": 1.0, "currency": "EUR"}, timeout=15)
        assert r.status_code == 400

    def test_transfer_insufficient(self, demo_headers):
        r = requests.post(f"{BASE}/api/transfer", headers=demo_headers,
                          json={"recipient": "admin@fxpro.com", "by": "email",
                                "amount": 999999.0, "currency": "EUR"}, timeout=15)
        assert r.status_code == 400

    def test_transfer_unknown_recipient(self, demo_headers):
        r = requests.post(f"{BASE}/api/transfer", headers=demo_headers,
                          json={"recipient": "doesnotexist@nope.com", "by": "email",
                                "amount": 1.0, "currency": "EUR"}, timeout=15)
        assert r.status_code == 404


# ============ QR ============
class TestQR:
    def test_qr_me(self, demo_headers):
        r = requests.get(f"{BASE}/api/qr/me", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["qr_code"].startswith("FXPRO:")
        assert body["email"] == "demo@fxpro.com"

    def test_qr_lookup_valid(self, demo_headers):
        qr = requests.get(f"{BASE}/api/qr/me", headers=demo_headers).json()["qr_code"]
        r = requests.get(f"{BASE}/api/qr/lookup?code={qr}", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == "demo@fxpro.com"

    def test_qr_lookup_invalid(self, demo_headers):
        r = requests.get(f"{BASE}/api/qr/lookup?code=FXPRO:fake:NOPE", headers=demo_headers, timeout=15)
        assert r.status_code == 404


# ============ Transactions ============
class TestTransactions:
    def test_list_transactions(self, demo_headers):
        r = requests.get(f"{BASE}/api/transactions", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_get_specific_transaction(self, demo_headers):
        # create a small convert
        c = requests.post(f"{BASE}/api/convert", headers=demo_headers,
                          json={"from_currency": "EUR", "to_currency": "USD", "amount": 1.0}, timeout=15)
        assert c.status_code == 200, c.text
        txn_id = c.json()["transaction"]["txn_id"]
        r = requests.get(f"{BASE}/api/transactions/{txn_id}", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["txn_id"] == txn_id


# ============ Notifications ============
class TestNotifications:
    def test_list_notifications(self, demo_headers):
        r = requests.get(f"{BASE}/api/notifications", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_mark_all_read(self, demo_headers):
        r = requests.post(f"{BASE}/api/notifications/read-all", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        items = requests.get(f"{BASE}/api/notifications", headers=demo_headers).json()["items"]
        assert all(n["read"] for n in items)


# ============ Alerts ============
class TestAlerts:
    def test_create_list_delete_alert(self, demo_headers):
        c = requests.post(f"{BASE}/api/alerts", headers=demo_headers,
                         json={"from_currency": "EUR", "to_currency": "XOF",
                               "target_rate": 660.0, "direction": "above"}, timeout=15)
        assert c.status_code == 200
        alert_id = c.json()["alert_id"]
        lst = requests.get(f"{BASE}/api/alerts", headers=demo_headers).json()
        assert any(a["alert_id"] == alert_id for a in lst["items"])
        d = requests.delete(f"{BASE}/api/alerts/{alert_id}", headers=demo_headers)
        assert d.status_code == 200


# ============ Favorites ============
class TestFavorites:
    def test_toggle_favorite(self, demo_headers):
        r = requests.post(f"{BASE}/api/favorites/toggle", headers=demo_headers,
                         json={"from_currency": "USD", "to_currency": "GBP"}, timeout=15)
        assert r.status_code == 200
        favs = r.json()["favorite_pairs"]
        assert ["USD", "GBP"] in favs
        # toggle off
        r2 = requests.post(f"{BASE}/api/favorites/toggle", headers=demo_headers,
                          json={"from_currency": "USD", "to_currency": "GBP"})
        assert ["USD", "GBP"] not in r2.json()["favorite_pairs"]


# ============ Profile ============
class TestProfile:
    def test_update_profile(self, demo_headers):
        r = requests.patch(f"{BASE}/api/profile", headers=demo_headers,
                          json={"name": "Demo User Updated", "kyc_status": "verified"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "Demo User Updated"
        # restore
        requests.patch(f"{BASE}/api/profile", headers=demo_headers,
                       json={"name": "Demo User"})


# ============ Admin ============
class TestAdmin:
    def test_stats_admin_only(self, demo_headers):
        r = requests.get(f"{BASE}/api/admin/stats", headers=demo_headers, timeout=15)
        assert r.status_code == 403

    def test_stats(self, admin_headers):
        r = requests.get(f"{BASE}/api/admin/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in ["users", "transactions", "blocked", "recent_transactions"]:
            assert k in body
        assert body["users"] >= 2

    def test_users_list(self, admin_headers):
        r = requests.get(f"{BASE}/api/admin/users", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        emails = [u["email"] for u in items]
        assert "admin@fxpro.com" in emails
        assert "demo@fxpro.com" in emails

    def test_users_search(self, admin_headers):
        r = requests.get(f"{BASE}/api/admin/users?search=demo", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert any("demo" in u["email"].lower() for u in items)

    def test_admin_balance_credit_and_debit(self, admin_headers):
        # find demo
        demo = next(u for u in requests.get(f"{BASE}/api/admin/users?search=demo", headers=admin_headers).json()["items"] if u["email"] == "demo@fxpro.com")
        before = demo["balances"]["USD"]
        # credit +50
        r = requests.patch(f"{BASE}/api/admin/users/{demo['user_id']}/balance",
                           headers=admin_headers,
                           json={"currency": "USD", "amount": 50.0}, timeout=15)
        assert r.status_code == 200
        assert r.json()["balances"]["USD"] == round(before + 50.0, 4)
        # debit -50
        r2 = requests.patch(f"{BASE}/api/admin/users/{demo['user_id']}/balance",
                           headers=admin_headers,
                           json={"currency": "USD", "amount": -50.0})
        assert r2.status_code == 200
        assert r2.json()["balances"]["USD"] == round(before, 4)

    def test_admin_balance_negative_rejected(self, admin_headers):
        demo = next(u for u in requests.get(f"{BASE}/api/admin/users?search=demo", headers=admin_headers).json()["items"] if u["email"] == "demo@fxpro.com")
        r = requests.patch(f"{BASE}/api/admin/users/{demo['user_id']}/balance",
                           headers=admin_headers,
                           json={"currency": "USD", "amount": -999999.0})
        assert r.status_code == 400

    def test_admin_block_and_unblock(self, admin_headers):
        # create temp user
        email = f"TEST_block_{uuid.uuid4().hex[:6]}@fxtest.com"
        reg = requests.post(f"{BASE}/api/auth/register",
                            json={"email": email, "password": "testpass123", "name": "TEST block"}).json()
        tok = reg["token"]
        uid = reg["user"]["user_id"]
        # block
        r = requests.patch(f"{BASE}/api/admin/users/{uid}/block",
                          headers=admin_headers, json={"is_blocked": True})
        assert r.status_code == 200
        # /me should now 403
        me = requests.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 403
        # cleanup delete
        requests.delete(f"{BASE}/api/admin/users/{uid}", headers=admin_headers)

    def test_admin_cannot_delete_self(self, admin_headers, admin_token):
        # find admin user
        me = requests.get(f"{BASE}/api/auth/me", headers=admin_headers).json()
        r = requests.delete(f"{BASE}/api/admin/users/{me['user_id']}", headers=admin_headers)
        assert r.status_code == 400

    def test_admin_delete_user(self, admin_headers):
        email = f"TEST_del_{uuid.uuid4().hex[:6]}@fxtest.com"
        reg = requests.post(f"{BASE}/api/auth/register",
                            json={"email": email, "password": "testpass123", "name": "TEST del"}).json()
        uid = reg["user"]["user_id"]
        r = requests.delete(f"{BASE}/api/admin/users/{uid}", headers=admin_headers)
        assert r.status_code == 200
        # verify gone
        u = requests.get(f"{BASE}/api/admin/users?search={email}", headers=admin_headers).json()["items"]
        assert not any(x["user_id"] == uid for x in u)
