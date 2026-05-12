# FX Pro 2026 — PRD

## Overview
Mobile fintech app (iOS/Android via Expo) for **currency conversion**, **multi-currency wallet** and **P2P transfers** between users, with an **admin dashboard**.

## Stack
- Frontend: Expo SDK 54 + Expo Router (file-based), react-native-reanimated, expo-blur, expo-linear-gradient, expo-camera, react-native-qrcode-svg, react-native-svg.
- Backend: FastAPI + MongoDB (motor), JWT auth + Emergent Google Auth.
- Live rates: open.er-api.com (free, no key) + admin override.

## Roles
- `user` — register/login, convert, transfer, view history, receive QR.
- `admin` — full user management, balance credit/debit in real time, block/unblock, delete, rate override.

## Currencies
EUR, XOF (FCFA BCEAO), XAF (FCFA BEAC), USD, GBP, NGN, MAD, CAD, CHF, JPY, CNY.

## Key features (20+)
1. Animated onboarding (3 slides)
2. JWT auth + Google Auth (Emergent)
3. Auto splash with rotating ring
4. Home dashboard with 30-day animated chart
5. Multi-currency converter
6. Multi-currency wallet
7. P2P transfer by email
8. P2P transfer by QR code (camera or paste)
9. QR generator (receive)
10. Transaction history with filters
11. Shareable receipts
12. Push notifications register endpoint
13. In-app notification center
14. Rate alerts (above/below)
15. Favorite currency pairs
16. Settings (notifications, biometric flag, hide balances)
17. KYC verification screen
18. Profile with avatar
19. Admin dashboard stats grid
20. Admin user management (search, view, credit, debit, block, delete)
21. Admin rate override + refresh from live API
22. Haptic feedback on every action
23. Animated bottom tab bar
24. Welcome bonus (+100€ +50000 FCFA)
25. Auto-redirect (admin → admin dashboard, user → home)

## Seeded accounts
- admin@fxpro.com / Admin@2026 (admin)
- demo@fxpro.com / Demo@2026 (user)

## Endpoints
Auth: register, login, google/session, me, logout
Rates: get, history, refresh (admin), override (admin)
Convert: POST /api/convert
Transfer: POST /api/transfer
QR: GET /api/qr/me, /api/qr/lookup
Transactions: list, get by id
Notifications: list, read-all, push-token
Alerts: list, create, delete
Favorites: toggle
Profile: PATCH /api/profile
Admin: stats, users, balance, block, delete

## Business smart enhancement
Welcome bonus (free EUR + FCFA credit on signup) drives instant activation and demo-friendly conversion — boosts retention metric on day-1.
