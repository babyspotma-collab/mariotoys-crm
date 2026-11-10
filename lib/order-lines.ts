// Lignes de commande choisies dans le catalogue (Nouvelle commande, « Relier au
// catalogue » de la fiche commande) : une variante Shopify, ou un article ALBASEET+
// pour un produit absent de Shopify. Le titre enregistré vient toujours du
// catalogue : aucun titre libre.

import { prisma } from "@/lib/db";
import { resolveCatalogVariants } from "@/lib/shopify-admin";

export type CatalogLineInput = { variantId?: string | null; albaseetCode?: string | null; quantity: number; price: number };
export type CatalogLine = { title: string; quantity: number; price: number; shopifyVariantId: string | null; albaseetCode: string | null };

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Vérifie les lignes ; renvoie les données à enregistrer, ou un message d'erreur. */
export async function resolveCatalogLines(rows: unknown): Promise<{ lines: CatalogLine[] } | { error: string }> {
  if (!Array.isArray(rows) || rows.length === 0) return { error: "Ajoute au moins un produit." };
  if (rows.length > 50) return { error: "Trop de lignes." };
  const list = rows as CatalogLineInput[];
  const valid = list.every(
    (r) =>
      r &&
      Number.isInteger(r.quantity) &&
      r.quantity >= 1 &&
      Number(r.price) >= 0 &&
      Number.isFinite(Number(r.price)) &&
      (isStr(r.variantId) !== isStr(r.albaseetCode)) // exactement l'un des deux
  );
  if (!valid) {
    return { error: "Choisis pour chaque ligne un produit du catalogue (avec sa variante) ou un article ALBASEET+, avec une quantité et un prix valides." };
  }

  const variantIds = list.map((r) => r.variantId).filter(isStr);
  const codes = list.map((r) => r.albaseetCode).filter(isStr);
  let shopify = new Map<string, { title: string; price: number }>();
  if (variantIds.length) {
    try {
      shopify = await resolveCatalogVariants(variantIds);
    } catch {
      return { error: "Catalogue Shopify indisponible, réessaie dans un instant." };
    }
  }
  const articles = new Map(
    (codes.length ? await prisma.albaseetArticle.findMany({ where: { code: { in: codes } }, select: { code: true, designation: true } }) : []).map((a) => [
      a.code,
      a.designation,
    ])
  );
  if (variantIds.some((id) => !shopify.has(id))) return { error: "Un produit choisi n'existe plus dans le catalogue Shopify : choisis-le à nouveau." };
  if (codes.some((c) => !articles.has(c))) return { error: "Un article ALBASEET+ choisi est introuvable : choisis-le à nouveau." };

  return {
    lines: list.map((r) => ({
      title: isStr(r.variantId) ? shopify.get(r.variantId)!.title : articles.get(r.albaseetCode as string)!,
      quantity: r.quantity,
      price: Number(r.price),
      shopifyVariantId: isStr(r.variantId) ? r.variantId : null,
      albaseetCode: isStr(r.albaseetCode) ? r.albaseetCode : null,
    })),
  };
}
