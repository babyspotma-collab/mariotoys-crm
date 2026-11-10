-- Page Rentabilité : NOUVELLES tables uniquement (aucune table existante modifiée).
-- Idempotent : peut être rejoué sans effet.

DO $$ BEGIN
  CREATE TYPE "CostType" AS ENUM ('LOCAL', 'IMPORTE', 'NON_CLASSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AlbaseetArticle" (
  "code"            TEXT PRIMARY KEY,
  "barcode"         TEXT,
  "designation"     TEXT NOT NULL,
  "prixAchat"       DECIMAL(12,2),
  "prixGros"        DECIMAL(12,2),
  "prixVente"       DECIMAL(12,2),
  "fournisseur"     TEXT,
  "famille"         TEXT,
  "stock"           DECIMAL(14,3),
  "costType"        "CostType" NOT NULL DEFAULT 'NON_CLASSE',
  "costTypeSetAt"   TIMESTAMP(3),
  "sourceUpdatedAt" TIMESTAMP(3),
  "sentAt"          TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AlbaseetArticle_barcode_idx" ON "AlbaseetArticle" ("barcode");
CREATE INDEX IF NOT EXISTS "AlbaseetArticle_fournisseur_idx" ON "AlbaseetArticle" ("fournisseur");
CREATE INDEX IF NOT EXISTS "AlbaseetArticle_famille_idx" ON "AlbaseetArticle" ("famille");
CREATE INDEX IF NOT EXISTS "AlbaseetArticle_costType_idx" ON "AlbaseetArticle" ("costType");

CREATE TABLE IF NOT EXISTS "AlbaseetPriceHistory" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "code"        TEXT NOT NULL,
  "prixAchat"   DECIMAL(12,2),
  "prixGros"    DECIMAL(12,2),
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AlbaseetPriceHistory_code_effectiveAt_idx" ON "AlbaseetPriceHistory" ("code", "effectiveAt");

CREATE TABLE IF NOT EXISTS "ShopifyVariant" (
  "id"            TEXT PRIMARY KEY,
  "productId"     TEXT NOT NULL,
  "productTitle"  TEXT NOT NULL,
  "variantTitle"  TEXT,
  "sku"           TEXT,
  "barcode"       TEXT,
  "price"         DECIMAL(12,2) NOT NULL,
  "imageUrl"      TEXT,
  "productStatus" TEXT NOT NULL,
  "collectionIds" TEXT[] NOT NULL DEFAULT '{}',
  "syncedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "ShopifyVariant_productId_idx" ON "ShopifyVariant" ("productId");
CREATE INDEX IF NOT EXISTS "ShopifyVariant_barcode_idx" ON "ShopifyVariant" ("barcode");
CREATE INDEX IF NOT EXISTS "ShopifyVariant_sku_idx" ON "ShopifyVariant" ("sku");

CREATE TABLE IF NOT EXISTS "ShopifyCollection" (
  "id"       TEXT PRIMARY KEY,
  "title"    TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "ArticleLink" (
  "variantId"    TEXT PRIMARY KEY,
  "albaseetCode" TEXT,
  "method"       TEXT NOT NULL,
  "score"        DOUBLE PRECISION,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ArticleLink_albaseetCode_idx" ON "ArticleLink" ("albaseetCode");

CREATE TABLE IF NOT EXISTS "MetaCampaign" (
  "id"          TEXT PRIMARY KEY,
  "accountId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "status"      TEXT,
  "currency"    TEXT NOT NULL DEFAULT 'USD',
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MetaCampaign_accountId_idx" ON "MetaCampaign" ("accountId");

CREATE TABLE IF NOT EXISTS "MetaSpendDaily" (
  "campaignId" TEXT NOT NULL,
  "date"       DATE NOT NULL,
  "accountId"  TEXT NOT NULL,
  "spend"      DECIMAL(12,2) NOT NULL,
  "currency"   TEXT NOT NULL,
  "syncedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("campaignId", "date")
);
CREATE INDEX IF NOT EXISTS "MetaSpendDaily_date_idx" ON "MetaSpendDaily" ("date");
CREATE INDEX IF NOT EXISTS "MetaSpendDaily_accountId_date_idx" ON "MetaSpendDaily" ("accountId", "date");

CREATE TABLE IF NOT EXISTS "CampaignLink" (
  "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "campaignId"  TEXT NOT NULL,
  "targetType"  TEXT NOT NULL,
  "targetId"    TEXT NOT NULL,
  "targetTitle" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignLink_campaignId_targetType_targetId_key" ON "CampaignLink" ("campaignId", "targetType", "targetId");

CREATE TABLE IF NOT EXISTS "ProfitSetting" (
  "key"       TEXT PRIMARY KEY,
  "value"     JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ShippingRate" (
  "id"      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "carrier" "Carrier" NOT NULL,
  "city"    TEXT NOT NULL,
  "cityKey" TEXT NOT NULL,
  "fee"     DECIMAL(10,2) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShippingRate_carrier_cityKey_key" ON "ShippingRate" ("carrier", "cityKey");
