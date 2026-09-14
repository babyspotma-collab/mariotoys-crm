# Mediva CRM

Dashboard interne : réception automatique des commandes Shopify Mediva,
confirmation/annulation manuelle, création automatique du colis Forcelog,
suivi de livraison.

Projet séparé de `mediva` (le site) et `mediva-automation` (création de
produits) — même boutique Shopify (`v5f0rs-mh.myshopify.com`), pas
d'autre lien entre les trois.

## Architecture

- **Réception des commandes** : webhook Shopify `orders/create` →
  `app/api/webhooks/shopify/orders-create/route.ts` → écrit en base
  (Postgres/Prisma), sans filtre, dès l'arrivée de la commande.
- **Dashboard** (`app/page.tsx`) : liste des commandes, statuts, boutons
  Confirmer/Annuler.
- **Confirmer** (`app/orders/actions.ts`) : crée le colis via l'API
  Forcelog (`AddParcel`), stocke le code colis renvoyé.
- **Suivi Forcelog** : Forcelog n'a pas de webhooks → un workflow GitHub
  Actions (`.github/workflows/sync-tracking.yml`, toutes les 2h — le
  cron natif Vercel est limité à 1x/jour sur le plan Hobby) appelle
  `/api/cron/sync-tracking`, qui interroge `GetParcel` pour chaque
  commande confirmée et met à jour le statut connu.
- **Auth** : mot de passe unique (usage solo), cookie de session signé
  HMAC — pas de table utilisateurs (`lib/auth.ts`, `middleware.ts`).
- **Commande manuelle** (`app/orders/new`) : pour les commandes prises par
  téléphone/WhatsApp, catalogue Shopify réel (`lib/shopify-admin.ts`),
  rejoint ensuite le même workflow que les commandes Shopify.
- **Suivi/retours/réclamations Forcelog** (`app/parcels`) : liste live
  (`GetParcels`), détail + historique, demande de retour
  (`Return/Request`), réclamations (`Claims/*`, types toujours chargés
  dynamiquement via `Claims/Types`, jamais codés en dur).
- **Création produit assistée** (`app/products/new`) : upload photo
  (Vercel Blob) → Google Gemini génère uniquement le titre et la
  description (`lib/gemini.ts`) → collection/tailles/tags/prix restent
  déterministes (choisis à l'upload ou calculés en code) → écran de
  relecture obligatoire → brouillon créé sur Shopify.

## Mise en place (étapes manuelles, à faire une fois)

Je ne peux pas provisionner Vercel/Postgres ni enregistrer le webhook
Shopify moi-même (pas d'accès à votre compte Vercel, et le webhook a
besoin de l'URL de déploiement qui n'existe qu'après le premier push).
Voici les étapes, dans l'ordre :

### 1. Importer le projet sur Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importer le repo
   `babyspotma-collab/mediva-crm`.
2. Ne pas déployer tout de suite — d'abord ajouter les variables d'env
   (étape 3).

### 2. Ajouter une base Postgres (Vercel Marketplace)

1. Dans le projet Vercel → onglet **Storage** → **Create Database** →
   choisir **Neon** (ou "Postgres") dans le Marketplace.
2. Une fois créée, Vercel injecte automatiquement `DATABASE_URL` (et
   variantes) dans les variables d'environnement du projet — rien à
   copier manuellement.

### 3. Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | injectée automatiquement par l'étape 2 |
| `DASHBOARD_PASSWORD` | le mot de passe de votre choix pour accéder au dashboard |
| `SESSION_SECRET` | chaîne aléatoire longue — générez avec `openssl rand -hex 32` |
| `SHOPIFY_STORE` | `v5f0rs-mh.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | même valeur que dans `mediva-automation/.env` |
| `SHOPIFY_CLIENT_SECRET` | même valeur que dans `mediva-automation/.env` |
| `FORCELOG_API_KEY` | votre clé API Forcelog |
| `CRON_SECRET` | chaîne aléatoire, ex. `openssl rand -hex 16` — la même valeur devra être ajoutée dans les GitHub Secrets du repo (étape 6) |
| `BLOB_READ_WRITE_TOKEN` | injectée automatiquement — Storage → Create → **Blob** (Marketplace), même principe que Postgres |
| `GEMINI_API_KEY` | votre clé Google Gemini — voir étape 3bis ci-dessous |

### 3bis. Obtenir une clé Google Gemini (gratuite, sans carte bancaire)

Utilisée uniquement pour générer le titre et la description des fiches
produit (`/products/new`) — tout le reste (collection, tags, tailles,
prix) reste géré par du code, pas par l'IA.

1. Ouvrez [aistudio.google.com](https://aistudio.google.com) et connectez-vous avec
   n'importe quel compte Google.
2. Cliquez sur **Get API key** (en haut à gauche, ou dans le menu latéral).
3. Cliquez sur **Create API key**, puis **Create API key in new project**
   (AI Studio crée un projet Google Cloud minimal pour vous — pas besoin
   d'en créer un manuellement, pas de compte de facturation à ajouter
   pour l'usage gratuit).
4. Copiez la clé générée (elle commence par `AIza...`) et collez-la dans
   `GEMINI_API_KEY` sur Vercel.

Le niveau gratuit de Gemini 2.5 Flash couvre largement l'usage prévu ici
(quelques fiches produit par jour). Si vous dépassez un jour le quota
gratuit, Google affiche une erreur explicite plutôt que de facturer
automatiquement — aucun risque de facture surprise sans passer à un plan
payant.

### 4. Déployer

Une fois les variables ajoutées, déployer. Noter l'URL de production
(ex: `https://mediva-crm.vercel.app`).

### 5. Créer les tables (une fois, depuis votre machine)

```bash
# .env.local avec au minimum DATABASE_URL (copié depuis Vercel)
npm install
npm run db:push
```

### 6. Activer la synchronisation Forcelog (GitHub Actions)

Le suivi Forcelog est déclenché par un workflow GitHub Actions, pas par
Vercel Cron (limité à 1x/jour sur le plan Hobby). Il faut ajouter deux
éléments dans le repo GitHub, sur
`https://github.com/babyspotma-collab/mediva-crm/settings/secrets/actions` :

1. Onglet **Secrets** → **New repository secret**
   - Nom : `CRON_SECRET`
   - Valeur : **exactement la même valeur** que celle définie dans les
     variables d'environnement Vercel à l'étape 3 (sinon l'appel sera
     rejeté avec une erreur 401).

2. Onglet **Variables** → **New repository variable**
   - Nom : `CRM_BASE_URL`
   - Valeur : l'URL de production, ex. `https://mediva-crm.vercel.app`
     (sans `/` final)

Le workflow tourne ensuite automatiquement toutes les 2h (12x/jour). Pour
vérifier qu'il fonctionne sans attendre : onglet **Actions** du repo →
sélectionner "Sync Forcelog tracking" → **Run workflow** (déclenchement
manuel, grâce à `workflow_dispatch`) → vérifier que le job passe au vert.

### 7. Enregistrer le webhook Shopify

```bash
node scripts/register-webhook.js https://mediva-crm.vercel.app
```

(nécessite `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`
dans `.env` ou `.env.local` local)

### 8. Se connecter

Ouvrir l'URL de production, entrer `DASHBOARD_PASSWORD`.

## Développement local

```bash
npm install
cp .env.example .env.local   # renseigner les valeurs
npm run db:push
npm run dev
```

## Limites connues / à ajuster avec l'usage réel

- `GetParcel`/`GetTracking` peuvent renvoyer "Parcel code Not Found"
  même pour un colis valide tout juste listé par `GetParcels` (observé
  en pratique, cause inconnue côté Forcelog) — géré sans planter
  (`app/parcels/[code]/page.tsx` affiche un message plutôt qu'une
  erreur), mais à surveiller si ça persiste sur de vrais colis livrés.
- `lib/shopify-admin.ts` filtre les collections Mediva par titre exact
  (liste figée `MEDIVA_COLLECTION_TITLES`) pour ne jamais montrer les
  collections Babyspot (même compte Shopify partagé) — à mettre à jour
  si une nouvelle collection Mediva est créée.
- Le champ "marque" (tag automatique si visible sur la photo) n'est plus
  généré depuis le passage à Gemini en portée restreinte (texte
  uniquement) — à ajouter manuellement sur l'écran de relecture si
  besoin, ou à réintroduire dans `lib/gemini.ts` si utile.
