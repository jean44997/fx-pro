# Bitrefill API Integration

This project integrates Bitrefill through the backend only. Never commit API keys. Use:

```bash
BITREFILL_API_KEY=...
BITREFILL_API_BASE=https://api.bitrefill.com/v2
BITREFILL_LIVE_PURCHASES=false
FX_ADMIN_PASSWORD=...
```

`BITREFILL_LIVE_PURCHASES=false` is intentional by default. The app debits FX Pro wallet balance and creates a local reservation/notification. Set it to `true` only when the Bitrefill account balance, compliance, refunds, and webhook handling are ready.

`FX_ADMIN_PASSWORD` controls the password for the only admin email (`fxpro@gmail.com`) without exposing the password in the repository.

## Official API Tree

- `GET /ping`
- `GET /accounts/balance`
- `POST /accounts/deposit`
- `GET /products`
- `GET /products/search`
- `GET /products/{id}`
- `GET /products/esims`
- `GET /products/esims/{id}`
- `POST /invoices`
- `GET /invoices`
- `GET /invoices/{id}`
- `POST /invoices/{id}/pay`
- `GET /orders`
- `GET /orders/{id}`
- `POST /esims`
- `GET /esims`
- `GET /esims/{id}`

The docs also mention MCP servers at `https://api.bitrefill.com/mcp`, but app purchase flows should use the documented REST endpoints above.

## Headers

Personal API:

```http
Authorization: Bearer ${BITREFILL_API_KEY}
Accept: application/json
Content-Type: application/json
```

Business/Affiliate API:

```http
Authorization: Basic base64(${BITREFILL_API_ID}:${BITREFILL_API_SECRET})
Accept: application/json
Content-Type: application/json
```

## Product Catalog

```bash
curl -H "Authorization: Bearer $BITREFILL_API_KEY" \
  "https://api.bitrefill.com/v2/products?country=FR&category=games&limit=50"
```

```js
const res = await fetch("https://api.bitrefill.com/v2/products?country=FR&category=games&limit=50", {
  headers: { Authorization: `Bearer ${process.env.BITREFILL_API_KEY}` }
});
const json = await res.json();
```

Important query params:

- `start`: pagination offset.
- `limit`: maximum 50.
- `country`: ISO country code, comma-separated. `XI` means international.
- `category`: one or more categories.
- `include_test_products`: useful in development for Business accounts.

Images:

```text
https://cdn.bitrefill.com/primg/w500h300/{product.id}.webp
https://cdn.bitrefill.com/primg/w300h180i1/{product.id}.webp
```

## Purchase Flow

1. Cache products.
2. Show packages/range to the user.
3. Debit FX Pro wallet.
4. If live mode is enabled, create a Bitrefill invoice.
5. Pay with Bitrefill balance.
6. Store the order/invoice reference.
7. Notify the user.
8. Poll `GET /orders/{id}` or handle webhooks to deliver redemption data.

Create invoice:

```bash
curl -X POST "https://api.bitrefill.com/v2/invoices" \
  -H "Authorization: Bearer $BITREFILL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "products": [{"product_id": "amazon_france-fr", "package_id": "amazon_france-fr<&>50", "quantity": 1}],
    "payment_method": "balance",
    "auto_pay": false,
    "email": "client@example.com"
  }'
```

```js
await fetch("https://api.bitrefill.com/v2/invoices", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.BITREFILL_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    products: [{ product_id: "amazon_france-fr", package_id: "amazon_france-fr<&>50", quantity: 1 }],
    payment_method: "balance",
    auto_pay: false,
    email: "client@example.com"
  })
});
```

## Rate Limits

- `GET /products`: 60/minute, plus 1000 product requests/hour.
- `GET /products/search`: 60/minute, plus 1000 product requests/hour.
- `GET /accounts/balance`: 60/10 minutes.
- `GET /invoices`: 20/minute.
- `GET /orders`: 20/minute.
- `POST /invoices`: 60/10 minutes.
- `POST /invoices/{id}/pay`: 60/10 minutes.

Cache product data for at least 15-60 minutes in production.

## Errors

Common API errors:

- `unsupported_payment_method`
- `missing_param`
- `parse_error`
- `not_found`
- `out_of_stock`
- `invalid_param`
- `invalid_value`
- `invalid_package_id`
- `too_many_items`
- `create_invoice_failed`
- `balance_too_low`
- HTTP `429`

## Local FX Pro Endpoints

The app exposes:

- `GET /api/gift-cards/catalog`
- `POST /api/gift-cards/purchase`
- `GET /api/gift-cards/orders`

The frontend route is:

- `/gift-cards`

## Streaming Note

The video player now refuses to play unrelated demo videos for real titles. Add licensed streams with:

```bash
FX_STREAM_LIBRARY_JSON='{
  "tv:76479": {
    "hls_url": "https://licensed-cdn.example/the-boys/s01e01/master.m3u8",
    "mp4_sources": [
      {"quality":"720p","label":"VF 720p","audio_id":"vf","url":"https://licensed-cdn.example/the-boys/s01e01/vf-720.mp4","mime":"video/mp4"}
    ]
  }
}'
```

Only use content you have rights to distribute.
