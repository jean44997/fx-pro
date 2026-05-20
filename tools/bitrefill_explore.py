#!/usr/bin/env python3
import json
import os
import sys
import time
from pathlib import Path

import requests


BASE_URL = os.environ.get("BITREFILL_API_BASE", "https://api.bitrefill.com/v2").rstrip("/")
API_KEY = os.environ.get("BITREFILL_API_KEY", "")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/bitrefill-discovery-output.json")

ENDPOINTS = [
    {"method": "GET", "path": "/ping"},
    {"method": "GET", "path": "/accounts/balance"},
    {"method": "GET", "path": "/products?limit=5"},
    {"method": "GET", "path": "/products?country=FR&category=games&limit=5"},
    {"method": "GET", "path": "/products/search?q=amazon&limit=5"},
    {"method": "GET", "path": "/products/esims?limit=5"},
    {"method": "GET", "path": "/invoices?limit=5"},
    {"method": "GET", "path": "/orders?limit=5"},
    {"method": "GET", "path": "/esims?limit=5"},
]


def request_endpoint(endpoint):
    started = time.time()
    res = requests.request(
        endpoint["method"],
        f"{BASE_URL}{endpoint['path']}",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        timeout=18,
    )
    try:
        body = res.json()
    except Exception:
        body = res.text[:2000]
    return {
        **endpoint,
        "url": f"{BASE_URL}{endpoint['path']}",
        "status": res.status_code,
        "duration_ms": round((time.time() - started) * 1000),
        "rate_headers": {
            k: v
            for k, v in res.headers.items()
            if "limit" in k.lower() or "quota" in k.lower()
        },
        "sample_response": body,
    }


def main():
    if not API_KEY:
        raise SystemExit("BITREFILL_API_KEY is not set. Refusing to run authenticated discovery.")
    results = []
    for endpoint in ENDPOINTS:
        try:
            results.append(request_endpoint(endpoint))
            time.sleep(0.35)
        except Exception as exc:
            results.append({**endpoint, "error": str(exc)})
    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "base_url": BASE_URL,
        "note": "Official documented endpoints only; no hidden endpoint brute-force.",
        "results": results,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
