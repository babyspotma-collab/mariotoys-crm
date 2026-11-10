import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { countMatched, runAutoMatch, saveStockItems } from "@/lib/profit/stock-db";
import { parseStockPayload } from "@/lib/profit/stock-payload";
import { setSyncStatus } from "@/lib/profit/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/stock-sync — appelé par l'appli locale qui lit ALBASEET+ (prix
// d'achat, prix de gros, stock…). Contrat : voir lib/profit/stock-payload.ts.
//   En-tête  : Authorization: Bearer <STOCK_SYNC_SECRET>   (sinon 401)
//   Réponse  : { received, matched, unmatched }  (+ rejected/errors si des articles sont invalides)
// Chaque article est créé ou mis à jour par "code", l'historique des prix
// d'achat et de gros est conservé, puis l'article est associé aux variantes
// Shopify (code-barres, SKU, nom). Hors session (middleware) : ce jeton suffit.

function authorized(req: NextRequest): boolean {
  const secret = process.env.STOCK_SYNC_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let payload;
  try {
    payload = parseStockPayload(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e instanceof SyntaxError ? "JSON invalide" : (e as Error).message }, { status: 400 });
  }

  try {
    const codes = await saveStockItems(payload);
    if (codes.length) {
      await runAutoMatch(payload.items.map((i) => ({ code: i.code, barcode: i.barcode ?? null, designation: i.designation })));
    }
    const matched = await countMatched(codes);
    await setSyncStatus("stock", true, `${payload.received} article(s) reçu(s), ${matched} associé(s) à Shopify`);
    return NextResponse.json({
      received: payload.received,
      matched,
      unmatched: codes.length - matched,
      ...(payload.errors.length ? { rejected: payload.errors.length, errors: payload.errors.slice(0, 50) } : {}),
    });
  } catch (e) {
    console.error("stock-sync :", e instanceof Error ? e.message : e);
    await setSyncStatus("stock", false, "Erreur d'enregistrement côté CRM").catch(() => {});
    return NextResponse.json({ error: "Erreur d'enregistrement côté CRM" }, { status: 500 });
  }
}
