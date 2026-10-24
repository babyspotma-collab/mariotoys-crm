import { NextRequest, NextResponse } from "next/server";
import { listProducts } from "@/lib/shopify-admin";

export const dynamic = "force-dynamic";

// Propositions de produits Shopify pendant la saisie d'une commande manuelle.
// Protégée par la session (middleware) comme le reste du CRM.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ products: [] });
  try {
    const products = await listProducts(q, 8);
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ error: "Catalogue Shopify indisponible" }, { status: 502 });
  }
}
