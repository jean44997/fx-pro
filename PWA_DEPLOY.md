# FX Pro 2026 PWA

## Build local

```sh
cd frontend
npx yarn@1.22.22 install --frozen-lockfile
npx yarn@1.22.22 build:web
```

Le dossier a publier est `frontend/dist`.

## Variables utiles

- `EXPO_PUBLIC_BACKEND_URL`: URL HTTPS de ton backend, sans `/api`. Si elle est vide, l'app utilise le mode Firebase direct pour connexion, creation de compte, profils, transferts, notifications et historique de base via Firebase Auth + Firestore.
- `EXPO_PUBLIC_FIREBASE_WEB_PUSH_VAPID_KEY`: cle publique VAPID FCM web. Le projet contient deja la cle fournie en fallback.

Si connexion ou creation de compte renvoie `405`, le frontend envoie le POST vers un site statique au lieu de l'API. Corrige `EXPO_PUBLIC_BACKEND_URL` avec l'URL HTTPS du backend FastAPI, sans `/api`.
Si tu n'as pas de backend, supprime `EXPO_PUBLIC_BACKEND_URL` pour activer le mode Firebase direct.

## Vercel

1. Importe le repo GitHub dans Vercel.
2. Garde le root du repo, le fichier `vercel.json` configure deja le build.
3. Sans backend, ne cree pas `EXPO_PUBLIC_BACKEND_URL`. Avec backend FastAPI, ajoute l'URL HTTPS sans `/api`.
4. Deploy.

## Firebase Hosting

```sh
cd frontend
npx yarn@1.22.22 install --frozen-lockfile
npx yarn@1.22.22 build:web
cd ..
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only storage
npx firebase-tools deploy --only functions
npx firebase-tools deploy --only hosting
```

Le projet Firebase par defaut est `mon-site-58f25`.

## Render

1. Cree un Static Site depuis le repo.
2. Render peut lire `render.yaml`.
3. Sans backend, ne cree pas `EXPO_PUBLIC_BACKEND_URL`. Avec backend FastAPI, ajoute l'URL HTTPS sans `/api`.
4. Deploy.

## iPhone Safari

Pour que la PWA se comporte comme une app iOS:

1. Ouvre le site en HTTPS dans Safari.
2. Partage > Ajouter a l'ecran d'accueil.
3. Ouvre l'icone ajoutee.
4. Accepte les notifications quand iOS les demande.

Les notifications web iOS exigent Safari, HTTPS et l'app ajoutee a l'ecran d'accueil.
La demande de permission doit partir d'une action utilisateur. L'app la declenche pendant les actions de connexion, creation de compte et activation du switch notifications.

La PWA ne demande pas la camera pendant connexion ou creation de compte. Les permissions galerie/photo et Face ID/empreinte ne sont pas des prompts web generaux comme dans une app native: le navigateur les demande uniquement au moment d'utiliser le selecteur de fichier, la camera, ou une authentification WebAuthn/passkey.
