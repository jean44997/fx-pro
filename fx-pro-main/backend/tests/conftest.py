"""Shared pytest fixtures for FX Pro 2026 backend tests."""
import os
import pytest
import requests

BASE_URL = "https://fx-transactions-pro.preview.emergentagent.com"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@fxpro.com", "password": "Admin@2026"}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _ensure_demo_user(admin_token: str) -> str:
    """Ensure demo@fxpro.com exists with password Demo@2026.
    If login fails (password was changed in a previous test run), delete & re-register.
    Returns a fresh demo JWT token.
    """
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "demo@fxpro.com", "password": "Demo@2026"}, timeout=15)
    if r.status_code == 200:
        return r.json()["token"]
    # Find existing demo via admin and delete it
    hdr = {"Authorization": f"Bearer {admin_token}"}
    users = requests.get(f"{BASE_URL}/api/admin/users?search=demo@fxpro.com",
                        headers=hdr, timeout=15).json().get("items", [])
    for u in users:
        if u["email"] == "demo@fxpro.com":
            requests.delete(f"{BASE_URL}/api/admin/users/{u['user_id']}",
                           headers=hdr, timeout=15)
    # Re-register with the canonical credentials
    reg = requests.post(f"{BASE_URL}/api/auth/register",
                        json={"email": "demo@fxpro.com", "password": "Demo@2026",
                              "name": "Demo User"}, timeout=15)
    assert reg.status_code == 200, f"Re-register demo failed: {reg.text}"
    # Top-up to standard demo balances via admin
    uid = reg.json()["user"]["user_id"]
    requests.patch(f"{BASE_URL}/api/admin/users/{uid}/balance",
                   headers={**hdr, "Content-Type": "application/json"},
                   json={"currency": "EUR", "amount": 400.0}, timeout=15)
    requests.patch(f"{BASE_URL}/api/admin/users/{uid}/balance",
                   headers={**hdr, "Content-Type": "application/json"},
                   json={"currency": "XOF", "amount": 150000.0}, timeout=15)
    requests.patch(f"{BASE_URL}/api/admin/users/{uid}/balance",
                   headers={**hdr, "Content-Type": "application/json"},
                   json={"currency": "USD", "amount": 200.0}, timeout=15)
    return reg.json()["token"]


@pytest.fixture(scope="session")
def demo_token(admin_token):
    return _ensure_demo_user(admin_token)


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}
