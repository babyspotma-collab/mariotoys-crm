import { NextRequest, NextResponse } from "next/server";
import { getProductVariants } from "@/lib/shopify-admin";
import { hasSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Variantes d'un produit Shopify, pour choisir la variante d'une ligne de commande.
// Protégée par la session (middleware) comme le reste du CRM.
export async function GET(req: NextRequest) {
  if (!(await hasSession())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("productId") ?? "";
  if (!id.startsWith("gid://shopify/Product/")) return NextResponse.json({ error: "Produit invalide" }, { status: 400 });
  try {
    const data = await getProductVariants(id);
    if (!data) return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("products/variants :", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Catalogue Shopify indisponible" }, { status: 502 });
  }
}
