import { NextRequest, NextResponse } from "next/server";
import { syncCatalog } from "@/lib/profit/shopify-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Tâche planifiée Vercel (vercel.json, 1x/jour) : copie du catalogue Shopify pour
// la page Rentabilité (variantes, codes-barres, SKU, collections), puis
// association automatique aux articles ALBASEET+. Même garde CRON_SECRET que les
// autres tâches (Vercel l'envoie tout seul en "Authorization: Bearer …").
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    return NextResponse.json(await syncCatalog(40_000));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
