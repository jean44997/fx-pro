# FX Pro 2026 PWA

## Build local

```sh
cd frontend
npx yarn@1.22.22 install --frozen-lockfile
npx yarn@1.22.22 build:web
```

Le dossier a publier est `frontend/dist`.

## Variables utiles

- `EXPO_PUBLIC_BACKEND_URL`: URL HTTPS de ton backend, sans `/api`.
- `EXPO_PUBLIC_FIREBASE_WEB_PUSH_VAPID_KEY`: cle publique VAPID FCM web. Le projet contient deja la cle fournie en fallback.

## Vercel

1. Importe le repo GitHub dans Vercel.
2. Garde le root du repo, le fichier `vercel.json` configure deja le build.
3. Ajoute `EXPO_PUBLIC_BACKEND_URL` dans les variables Vercel.
4. Deploy.

## Firebase Hosting

```sh
cd frontend
npx yarn@1.22.22 install --frozen-lockfile
npx yarn@1.22.22 build:web
cd ..
npx firebase-tools deploy --only hosting
```

Le projet Firebase par defaut est `mon-site-58f25`.

## Render

1. Cree un Static Site depuis le repo.
2. Render peut lire `render.yaml`.
3. Ajoute `EXPO_PUBLIC_BACKEND_URL` dans les variables.
4. Deploy.

## iPhone Safari

Pour que la PWA se comporte comme une app iOS:

1. Ouvre le site en HTTPS dans Safari.
2. Partage > Ajouter a l'ecran d'accueil.
3. Ouvre l'icone ajoutee.
4. Accepte les notifications quand iOS les demande.

Les notifications web iOS exigent Safari, HTTPS et l'app ajoutee a l'ecran d'accueil.
