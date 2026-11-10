-- Lignes de commande reliées au catalogue après coup (fiche commande) ou à un
-- article ALBASEET+ absent de Shopify. Ajout de colonnes uniquement (idempotent).
--   originalTitle : titre saisi à l'origine, conservé quand la ligne est reliée ou découpée
--   albaseetCode  : article ALBASEET+ choisi directement (produit absent de Shopify)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "originalTitle" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "albaseetCode" TEXT;
