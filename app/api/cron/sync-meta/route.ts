import { NextRequest, NextResponse } from "next/server";
import { syncMetaSpend } from "@/lib/profit/meta";
import { getInternal } from "@/lib/profit/settings";
import { syncCatalog } from "@/lib/profit/shopify-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Tâche planifiée Vercel (vercel.json, 1x/jour, après sync-shopify-catalog) :
// dépenses Meta Ads des 7 derniers jours par campagne. Termine d'abord une copie
// du catalogue Shopify restée en attente au passage précédent.
//   ?since=2026-09-01 : recharge depuis cette date (rattrapage manuel).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  let catalog: unknown = null;
  if (await getInternal("catalogBulk")) {
    catalog = await syncCatalog(15_000).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  }
  const meta = await syncMetaSpend({ since: req.nextUrl.searchParams.get("since") ?? undefined });
  return NextResponse.json({ meta, catalog }, { status: meta.ok ? 200 : 500 });
}
