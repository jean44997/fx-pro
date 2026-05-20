#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const BASE_URL = (process.env.BITREFILL_API_BASE || "https://api.bitrefill.com/v2").replace(/\/+$/, "");
const API_KEY = process.env.BITREFILL_API_KEY || "";
const OUT = process.argv[2] || path.join("docs", "bitrefill-discovery-output.json");

const endpoints = [
  { method: "GET", path: "/ping" },
  { method: "GET", path: "/accounts/balance" },
  { method: "GET", path: "/products?limit=5" },
  { method: "GET", path: "/products?country=FR&category=games&limit=5" },
  { method: "GET", path: "/products/search?q=amazon&limit=5" },
  { method: "GET", path: "/products/esims?limit=5" },
  { method: "GET", path: "/invoices?limit=5" },
  { method: "GET", path: "/orders?limit=5" },
  { method: "GET", path: "/esims?limit=5" }
];

async function request(endpoint) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}${endpoint.path}`, {
    method: endpoint.method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {})
    }
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 2000);
  }
  return {
    ...endpoint,
    url: `${BASE_URL}${endpoint.path}`,
    status: res.status,
    duration_ms: Date.now() - started,
    rate_headers: Object.fromEntries([...res.headers.entries()].filter(([key]) => key.toLowerCase().includes("limit") || key.toLowerCase().includes("quota"))),
    sample_response: body
  };
}

async function main() {
  if (!API_KEY) {
    console.error("BITREFILL_API_KEY is not set. Refusing to run authenticated discovery.");
    process.exit(1);
  }
  const results = [];
  for (const endpoint of endpoints) {
    try {
      results.push(await request(endpoint));
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (error) {
      results.push({ ...endpoint, error: error.message });
    }
  }
  const payload = {
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    note: "Official documented endpoints only; no hidden endpoint brute-force.",
    results
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
