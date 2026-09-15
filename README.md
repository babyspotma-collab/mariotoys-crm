# Mario Toys CRM

Dashboard interne : réception automatique des commandes Shopify Mario Toys,
confirmation/annulation manuelle, création automatique du colis Forcelog,
suivi de livraison.

Boutique Shopify `cvkf4d-z4.myshopify.com`, compte non partagé avec une
autre marque.

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

Pas de création produit dans ce CRM : côté Mario Toys, cette partie est
gérée séparément par `mario-toys-automation`.

## Mise en place (étapes manuelles, à faire une fois)

Je ne peux pas provisionner Vercel/Postgres ni enregistrer le webhook
Shopify moi-même (pas d'accès à votre compte Vercel, et le webhook a
besoin de l'URL de déploiement qui n'existe qu'après le premier push).
Voici les étapes, dans l'ordre :

### 1. Importer le projet sur Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importer le repo GitHub
   de ce projet (adapter le nom ci-dessous à celui que vous utilisez
   réellement).
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
| `SHOPIFY_STORE` | `cvkf4d-z4.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | identifiant OAuth de l'app Shopify Mario Toys (voir `.env` local) |
| `SHOPIFY_CLIENT_SECRET` | secret OAuth de l'app Shopify Mario Toys (voir `.env` local) |
| `SHOPIFY_API_VERSION` | `2026-07` |
| `FORCELOG_API_KEY` | votre clé API Forcelog |
| `CRON_SECRET` | chaîne aléatoire, ex. `openssl rand -hex 16` — la même valeur devra être ajoutée dans les GitHub Secrets du repo (étape 6) |

### 4. Déployer

Une fois les variables ajoutées, déployer. Noter l'URL de production
(ex: `https://mario-toys-crm.vercel.app`).

### 5. Créer les tables (une fois, depuis votre machine)

```bash
# .env.local avec au minimum DATABASE_URL (copié depuis Vercel)
npm install
npm run db:push
```

### 6. Activer la synchronisation Forcelog (GitHub Actions)

Le suivi Forcelog est déclenché par un workflow GitHub Actions, pas par
Vercel Cron (limité à 1x/jour sur le plan Hobby). Il faut ajouter deux
éléments dans le repo GitHub, sous
`https://github.com/<votre-org>/<votre-repo>/settings/secrets/actions` :

1. Onglet **Secrets** → **New repository secret**
   - Nom : `CRON_SECRET`
   - Valeur : **exactement la même valeur** que celle définie dans les
     variables d'environnement Vercel à l'étape 3 (sinon l'appel sera
     rejeté avec une erreur 401).

2. Onglet **Variables** → **New repository variable**
   - Nom : `CRM_BASE_URL`
   - Valeur : l'URL de production, ex. `https://mario-toys-crm.vercel.app`
     (sans `/` final)

Le workflow tourne ensuite automatiquement toutes les 2h (12x/jour). Pour
vérifier qu'il fonctionne sans attendre : onglet **Actions** du repo →
sélectionner "Sync Forcelog tracking" → **Run workflow** (déclenchement
manuel, grâce à `workflow_dispatch`) → vérifier que le job passe au vert.

### 7. Enregistrer le webhook Shopify

```bash
node scripts/register-webhook.js https://mario-toys-crm.vercel.app
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
