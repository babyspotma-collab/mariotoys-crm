// Copie du catalogue Shopify (variantes, codes-barres, SKU, collections) dans
// ShopifyVariant / ShopifyCollection. ~5 000 variantes : trop pour des requêtes
// page par page dans la limite de 60 s de Vercel, on passe donc par une
// opération groupée Shopify (bulkOperationRunQuery) : Shopify prépare un fichier
// JSONL, on attend qu'il soit prêt puis on le lit. Si l'attente dépasse le temps
// imparti, l'opération reste notée (ProfitSetting "internal.catalogBulk") et le
// passage suivant reprend le même fichier au lieu d'en relancer un.

import { prisma } from "@/lib/db";
import { gql } from "@/lib/shopify-admin";
import { runAutoMatch } from "./stock-db";
import { getInternal, setInternal, setSyncStatus } from "./settings";

const BULK_QUERY = `{
  products {
    edges { node {
      id title status featuredImage { url }
      collections { edges { node { id title } } }
      variants { edges { node { id title sku barcode price } } }
    } }
  }
}`;

type BulkRef = { id: string; startedAt: string };
type BulkStatus = { status: string; errorCode: string | null; url: string | null; objectCount: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startBulk(): Promise<BulkRef> {
  const data = await gql<{ bulkOperationRunQuery: { bulkOperation: { id: string } | null; userErrors: { message: string }[] } }>(
    `mutation ($q: String!) { bulkOperationRunQuery(query: $q) { bulkOperation { id } userErrors { message } } }`,
    { q: BULK_QUERY }
  );
  const op = data.bulkOperationRunQuery.bulkOperation;
  if (!op) throw new Error(`Shopify : ${data.bulkOperationRunQuery.userErrors.map((e) => e.message).join(" ; ") || "opération groupée refusée"}`);
  const ref = { id: op.id, startedAt: new Date().toISOString() };
  await setInternal("catalogBulk", ref);
  return ref;
}

async function bulkStatus(id: string): Promise<BulkStatus> {
  const data = await gql<{ node: BulkStatus | null }>(
    `query ($id: ID!) { node(id: $id) { ... on BulkOperation { status errorCode url objectCount } } }`,
    { id }
  );
  if (!data.node) throw new Error("Opération groupée Shopify introuvable");
  return data.node;
}

export type CatalogResult = { status: "done" | "pending"; variants?: number; linked?: number };

/** Met à jour la copie du catalogue. `budgetMs` = temps maximum d'attente du fichier Shopify. */
export async function syncCatalog(budgetMs = 40_000): Promise<CatalogResult> {
  const deadline = Date.now() + budgetMs;
  try {
    let ref = await getInternal<BulkRef>("catalogBulk");
    if (ref && Date.now() - Date.parse(ref.startedAt) > 6 * 3600_000) ref = null; // trop ancien : on recommence
    if (!ref) ref = await startBulk();

    let s = await bulkStatus(ref.id);
    while (s.status === "CREATED" || s.status === "RUNNING") {
      if (Date.now() > deadline) {
        await setSyncStatus("catalog", true, "Catalogue Shopify en préparation, mis à jour au prochain passage");
        return { status: "pending" };
      }
      await sleep(2000);
      s = await bulkStatus(ref.id);
    }
    if (s.status !== "COMPLETED") {
      await setInternal("catalogBulk", null);
      throw new Error(`Opération groupée Shopify ${s.status}${s.errorCode ? ` (${s.errorCode})` : ""}`);
    }

    const variants = s.url ? await saveCatalog(await (await fetch(s.url, { cache: "no-store" })).text()) : 0;
    await setInternal("catalogBulk", null);
    const linked = await runAutoMatch();
    await setSyncStatus("catalog", true, `${variants} variantes Shopify, ${linked} association(s) automatique(s) ajoutée(s) ou améliorée(s)`);
    return { status: "done", variants, linked };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setSyncStatus("catalog", false, message).catch(() => {});
    throw e;
  }
}

type ProductLine = { id: string; title: string; status: string; featuredImage: { url: string } | null };
type VariantLine = { id: string; title: string; sku: string | null; barcode: string | null; price: string; __parentId: string };
type CollectionLine = { id: string; title: string; __parentId: string };

async function saveCatalog(jsonl: string): Promise<number> {
  const products = new Map<string, ProductLine>();
  const variants: VariantLine[] = [];
  const collections = new Map<string, string>();
  const productCollections = new Map<string, string[]>();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.id?.startsWith("gid://shopify/Product/")) products.set(o.id, o);
    else if (o.id?.startsWith("gid://shopify/ProductVariant/")) variants.push(o);
    else if (o.id?.startsWith("gid://shopify/Collection/")) {
      collections.set(o.id, o.title);
      productCollections.set(o.__parentId, [...(productCollections.get(o.__parentId) ?? []), o.id]);
    }
  }

  const runStart = new Date();
  const rows = variants
    .filter((v) => products.has(v.__parentId))
    .map((v) => {
      const p = products.get(v.__parentId)!;
      return {
        id: v.id,
        product_id: p.id,
        product_title: p.title,
        variant_title: v.title && v.title !== "Default Title" ? v.title : null,
        sku: v.sku?.trim() || null,
        barcode: v.barcode?.trim() || null,
        price: Number(v.price) || 0,
        image_url: p.featuredImage?.url ?? null,
        status: p.status,
        collection_ids: (productCollections.get(p.id) ?? []).join(","),
      };
    });
  if (rows.length === 0) throw new Error("Catalogue Shopify vide : rien n'a été remplacé");

  for (let i = 0; i < rows.length; i += 1000) {
    await prisma.$executeRaw`
      INSERT INTO "ShopifyVariant" ("id","productId","productTitle","variantTitle","sku","barcode","price","imageUrl","productStatus","collectionIds","syncedAt")
      SELECT x.id, x.product_id, x.product_title, x.variant_title, x.sku, x.barcode, x.price, x.image_url, x.status,
             COALESCE(string_to_array(NULLIF(x.collection_ids, ''), ','), '{}'), ${runStart.toISOString()}::timestamptz AT TIME ZONE 'UTC'
      FROM jsonb_to_recordset(${JSON.stringify(rows.slice(i, i + 1000))}::jsonb) AS x(
        id text, product_id text, product_title text, variant_title text, sku text, barcode text, price numeric,
        image_url text, status text, collection_ids text)
      ON CONFLICT ("id") DO UPDATE SET
        "productId" = EXCLUDED."productId", "productTitle" = EXCLUDED."productTitle", "variantTitle" = EXCLUDED."variantTitle",
        "sku" = EXCLUDED."sku", "barcode" = EXCLUDED."barcode", "price" = EXCLUDED."price", "imageUrl" = EXCLUDED."imageUrl",
        "productStatus" = EXCLUDED."productStatus", "collectionIds" = EXCLUDED."collectionIds", "syncedAt" = EXCLUDED."syncedAt"`;
  }
  const cols = [...collections].map(([id, title]) => ({ id, title }));
  await prisma.$transaction([
    // Variantes supprimées de Shopify. Leurs liens ALBASEET+ restent (anciennes commandes).
    prisma.shopifyVariant.deleteMany({ where: { syncedAt: { lt: runStart } } }),
    prisma.$executeRaw`
      INSERT INTO "ShopifyCollection" ("id","title","syncedAt")
      SELECT x.id, x.title, ${runStart.toISOString()}::timestamptz AT TIME ZONE 'UTC' FROM jsonb_to_recordset(${JSON.stringify(cols)}::jsonb) AS x(id text, title text)
      ON CONFLICT ("id") DO UPDATE SET "title" = EXCLUDED."title", "syncedAt" = EXCLUDED."syncedAt"`,
    prisma.shopifyCollection.deleteMany({ where: { syncedAt: { lt: runStart } } }),
  ]);
  return rows.length;
}
