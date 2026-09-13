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
- **Suivi Forcelog** : Forcelog n'a pas de webhooks → un cron Vercel
  (`vercel.json`, toutes les 20 min) interroge `GetParcel` pour chaque
  commande confirmée et met à jour le statut connu
  (`app/api/cron/sync-tracking/route.ts`).
- **Auth** : mot de passe unique (usage solo), cookie de session signé
  HMAC — pas de table utilisateurs (`lib/auth.ts`, `middleware.ts`).

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
| `CRON_SECRET` | chaîne aléatoire — Vercel l'envoie automatiquement au cron une fois définie |

### 4. Déployer

Une fois les variables ajoutées, déployer. Noter l'URL de production
(ex: `https://mediva-crm.vercel.app`).

### 5. Créer les tables (une fois, depuis votre machine)

```bash
# .env.local avec au minimum DATABASE_URL (copié depuis Vercel)
npm install
npm run db:push
```

### 6. Enregistrer le webhook Shopify

```bash
node scripts/register-webhook.js https://mediva-crm.vercel.app
```

(nécessite `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`
dans `.env` ou `.env.local` local)

### 7. Se connecter

Ouvrir l'URL de production, entrer `DASHBOARD_PASSWORD`.

## Développement local

```bash
npm install
cp .env.example .env.local   # renseigner les valeurs
npm run db:push
npm run dev
```

## Limites connues / à ajuster avec l'usage réel

- Les champs exacts requis par `Forcelog/AddParcel` au-delà de
  `ORDER_NUM, RECEIVER, PHONE, CITY, ADDRESS, COD, PRODUCT_NATURE` ne
  sont pas garantis (doc partielle) — en cas d'erreur de validation,
  elle s'affiche sur la commande dans le dashboard (`forcelogError`)
  pour ajustement du code.
- Le nom du champ de statut dans la réponse `GetParcel` est deviné
  (`STATUS`/`Status`/`status`/`PARCEL_STATUS`) — à confirmer avec une
  vraie réponse et ajuster `extractStatus()` dans
  `app/api/cron/sync-tracking/route.ts` si besoin.
- Pas de mapping ville Shopify → code ville Forcelog : le nom de ville
  brut de la commande est envoyé tel quel. Si `GetCities` exige un code
  précis, il faudra ajouter une étape de correspondance.
