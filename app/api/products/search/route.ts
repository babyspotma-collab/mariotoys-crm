import { NextRequest, NextResponse } from "next/server";
import { searchProducts, warmCatalogue } from "@/lib/shopify-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // premier appel : chargement de tout le catalogue

// Propositions de produits Shopify pendant la saisie d'une commande manuelle.
// Protégée par la session (middleware) comme le reste du CRM.
//   ?q=licorn  -> propositions        ?warm=1 -> prépare le catalogue en mémoire
export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get("warm")) {
      await warmCatalogue();
      return NextResponse.json({ ok: true });
    }
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ products: [] });
    return NextResponse.json({ products: await searchProducts(q, 10) });
  } catch {
    return NextResponse.json({ error: "Catalogue Shopify indisponible" }, { status: 502 });
  }
}
