// Écritures ALBASEET+ : articles reçus par POST /api/stock-sync, historique des
// prix, association automatique aux variantes Shopify (lib/profit/matching.ts).

import { prisma } from "@/lib/db";
import { autoMatch, type ArticleForMatch, type LinkState, type LinkUpsert } from "./matching";
import type { StockPayload } from "./stock-payload";

const dec = (v: unknown): number | null => (v === null || v === undefined ? null : Number(String(v)));
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Enregistre un lot (création ou mise à jour par code) ; renvoie les codes enregistrés. */
export async function saveStockItems(payload: StockPayload): Promise<string[]> {
  const items = payload.items;
  if (!items.length) return [];
  const codes = items.map((i) => i.code);
  const existing = new Map(
    (await prisma.albaseetArticle.findMany({ where: { code: { in: codes } } })).map((a) => [a.code, a])
  );
  const now = new Date();

  // Un champ absent du lot garde la valeur en base (voir stock-payload.ts).
  const rows = items.map((i) => {
    const old = existing.get(i.code);
    const keep = <T>(v: T | undefined, prev: T | null | undefined): T | null => (v === undefined ? prev ?? null : v);
    return {
      code: i.code,
      barcode: keep(i.barcode, old?.barcode),
      designation: i.designation,
      prix_achat: i.prixAchat,
      prix_gros: keep(i.prixGros, dec(old?.prixGros)),
      prix_vente: keep(i.prixVente, dec(old?.prixVente)),
      fournisseur: keep(i.fournisseur, old?.fournisseur),
      famille: keep(i.famille, old?.famille),
      stock: keep(i.stock, dec(old?.stock)),
      updated_at: iso(i.updatedAt),
      sent_at: iso(payload.sentAt),
    };
  });

  // Historique : une ligne quand le prix d'achat ou de gros change (ou nouvel article).
  const history = rows
    .filter((r) => {
      const old = existing.get(r.code);
      return !old || dec(old.prixAchat) !== r.prix_achat || dec(old.prixGros) !== r.prix_gros;
    })
    .map((r) => ({ code: r.code, prix_achat: r.prix_achat, prix_gros: r.prix_gros, effective_at: r.updated_at ?? r.sent_at ?? now.toISOString() }));

  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO "AlbaseetArticle" ("code","barcode","designation","prixAchat","prixGros","prixVente","fournisseur","famille","stock","sourceUpdatedAt","sentAt","updatedAt")
      SELECT x.code, x.barcode, x.designation, x.prix_achat, x.prix_gros, x.prix_vente, x.fournisseur, x.famille, x.stock,
             x.updated_at AT TIME ZONE 'UTC', x.sent_at AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        code text, barcode text, designation text, prix_achat numeric, prix_gros numeric, prix_vente numeric,
        fournisseur text, famille text, stock numeric, updated_at timestamptz, sent_at timestamptz)
      ON CONFLICT ("code") DO UPDATE SET
        "barcode" = EXCLUDED."barcode", "designation" = EXCLUDED."designation",
        "prixAchat" = EXCLUDED."prixAchat", "prixGros" = EXCLUDED."prixGros", "prixVente" = EXCLUDED."prixVente",
        "fournisseur" = EXCLUDED."fournisseur", "famille" = EXCLUDED."famille", "stock" = EXCLUDED."stock",
        "sourceUpdatedAt" = EXCLUDED."sourceUpdatedAt", "sentAt" = EXCLUDED."sentAt", "updatedAt" = EXCLUDED."updatedAt"`,
    prisma.$executeRaw`
      INSERT INTO "AlbaseetPriceHistory" ("id","code","prixAchat","prixGros","effectiveAt")
      SELECT gen_random_uuid()::text, x.code, x.prix_achat, x.prix_gros, x.effective_at AT TIME ZONE 'UTC'
      FROM jsonb_to_recordset(${JSON.stringify(history)}::jsonb) AS x(code text, prix_achat numeric, prix_gros numeric, effective_at timestamptz)`,
  ]);
  return codes;
}

/**
 * Association automatique. `articles` absent = tous les articles (après une mise à
 * jour du catalogue Shopify) ; sinon seulement ceux du lot reçu.
 */
export async function runAutoMatch(articles?: ArticleForMatch[]): Promise<number> {
  const [variants, links, all] = await Promise.all([
    prisma.shopifyVariant.findMany({ select: { id: true, productTitle: true, variantTitle: true, sku: true, barcode: true } }),
    prisma.articleLink.findMany({ select: { variantId: true, albaseetCode: true, method: true, score: true } }),
    articles ? Promise.resolve(articles) : prisma.albaseetArticle.findMany({ select: { code: true, barcode: true, designation: true } }),
  ]);
  const state = new Map<string, LinkState>(links.map((l) => [l.variantId, l]));
  const upserts = autoMatch(variants, all, state);
  await saveLinks(upserts);
  return upserts.length;
}

async function saveLinks(upserts: LinkUpsert[]): Promise<void> {
  for (let i = 0; i < upserts.length; i += 1000) {
    const chunk = upserts.slice(i, i + 1000).map((u) => ({ variant_id: u.variantId, code: u.albaseetCode, method: u.method, score: u.score }));
    // Garde-fou : un lien MANUAL n'est jamais réécrit, même en cas de course.
    await prisma.$executeRaw`
      INSERT INTO "ArticleLink" ("variantId","albaseetCode","method","score","updatedAt")
      SELECT x.variant_id, x.code, x.method, x.score, now() AT TIME ZONE 'UTC'
      FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(variant_id text, code text, method text, score double precision)
      ON CONFLICT ("variantId") DO UPDATE SET
        "albaseetCode" = EXCLUDED."albaseetCode", "method" = EXCLUDED."method", "score" = EXCLUDED."score", "updatedAt" = EXCLUDED."updatedAt"
      WHERE "ArticleLink"."method" <> 'MANUAL'`;
  }
}

/** Nombre de codes du lot reliés à au moins une variante Shopify. */
export async function countMatched(codes: string[]): Promise<number> {
  if (!codes.length) return 0;
  const rows = await prisma.articleLink.findMany({ where: { albaseetCode: { in: codes } }, select: { albaseetCode: true }, distinct: ["albaseetCode"] });
  return rows.length;
}
