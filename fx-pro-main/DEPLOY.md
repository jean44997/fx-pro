# FX Pro 2026 — Deploiement PWA

> Web app installable (PWA) qui devient une « app » iOS / Android une fois
> ajoutee a l'ecran d'accueil, avec notifications push reelles.

## 1. Pre-requis (une seule fois)

```powershell
# Variables d'environnement (frontend)
cd frontend
copy .env.example .env
# Editez .env :
#   EXPO_PUBLIC_BACKEND_URL=https://votre-api.example.com
#   EXPO_PUBLIC_FIREBASE_VAPID_KEY=<cle VAPID Firebase Console>
```

> **Cle VAPID** : Firebase Console -> Project Settings -> Cloud Messaging ->
> Web Push certificates -> Generate key pair. Sans cette cle, les
> notifications PUSH du serveur ne fonctionneront pas (les notifs locales si).

## 2. Build du PWA

```powershell
cd frontend
yarn install
yarn build:web
# => sortie dans frontend/dist/
```

## 3. Test local

```powershell
# Sert le PWA sur http://localhost:5050
npx serve dist -l 5050 --single
```

Ouvrez `http://localhost:5050` puis verifiez dans DevTools (Application) :
- Manifest detecte
- Service worker enregistre (`/service-worker.js`)
- "Installable" affiche

## 4. Deploiement Firebase Hosting

```powershell
# Une seule fois :
npx firebase login

# A chaque deploiement :
cd frontend
yarn build:web
cd ..
npx firebase deploy --only hosting
```

URL deployee : `https://mon-site-58f25.web.app` (projet defini dans `.firebaserc`).

Pour activer la synchronisation Firestore des profils crees par register/login :

```powershell
npx firebase deploy --only firestore:rules
```

## 5. Comportement par plateforme

| Plateforme | Apres "Ajouter a l'ecran d'accueil" | Notifications |
|---|---|---|
| **Android Chrome** | App standalone plein-ecran | Push reelles (FCM) |
| **iOS Safari 16.4+** | App standalone, sans bandeau Safari | Push reelles (FCM Web Push) |
| **iOS Safari < 16.4** | App standalone | Notifs locales seulement |
| **Desktop Chrome/Edge** | Window app independante | Push reelles |

## 6. Verification des permissions

L'app demande automatiquement les permissions correctes :

- **iOS standalone** : `Notification.requestPermission()` au toggle Settings
- **Android Chrome** : meme flux + canal `default` cree dans Notifications API
- **Camera** : `expo-camera` -> `NSCameraUsageDescription` / `CAMERA`
- **Photos** : `expo-image-picker` -> `NSPhotoLibraryUsageDescription`
- **FaceID** : `expo-local-authentication` -> `NSFaceIDUsageDescription`

> Sur iOS Safari **non standalone**, un coach s'affiche pour expliquer le geste
> Partager -> Sur l'ecran d'accueil. C'est l'unique facon d'activer les push
> sur iOS (limitation d'Apple, pas un bug).

## 7. Transferts P2P entre utilisateurs

Backend FastAPI `POST /api/transfer` :
- Transaction MongoDB atomique (sender debit + receiver credit + receipt + notifs)
- Fallback `update_one` conditionnel si Mongo standalone (pas de replica set)
- Notifications cree es pour sender et receiver (alimentent /notifications)
- Verifications : self-transfer, blocked, solde insuffisant, devise supportee

Code source : `backend/server.py` ligne 461-589.

## 8. Architecture en bref

```
frontend/
  app/                 Routes (expo-router)
  src/
    auth.tsx           Contexte auth + API client
    firebase*.ts       Auth Firebase miroir (multi-plateforme)
    notifs*.ts         Notifications (web/native)
    webPush.ts         API Notification + Service Worker
  public/
    manifest.webmanifest    Manifeste PWA
    service-worker.js       SW (push, deep-link, offline)
    icons/                  Icones PWA (192/512 + apple-touch)
  dist/                Build statique pour hosting
backend/
  server.py            FastAPI + JWT + Mongo (auth, transfer, rates...)
firebase.json          Config Hosting (rewrites + headers cache)
```
