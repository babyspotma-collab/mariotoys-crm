"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveCatalogLines } from "@/lib/order-lines";

/**
 * Relie après coup une ligne de commande au catalogue (pour le coût d'achat de la
 * page Rentabilité) : variante Shopify, ou article ALBASEET+ si le produit n'est pas
 * sur Shopify. Plusieurs lignes = la ligne d'origine est découpée (ex. « Quad x1,
 * Vespa x1 »). Le titre saisi à l'origine est gardé dans originalTitle, sur chaque
 * ligne. Le total de la ligne ne change pas, donc ni le total de la commande, ni
 * le CA, ni les colis.
 */
export async function relinkOrderItem(itemId: string, rows: unknown): Promise<{ error: string | null }> {
  const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
  if (!item) return { error: "Ligne introuvable." };
  if (!(await isRelinkable(item))) return { error: "Cette ligne est déjà reliée au catalogue." };

  const resolved = await resolveCatalogLines(rows);
  if ("error" in resolved) return { error: resolved.error };
  const lines = resolved.lines;
  if (lines.length > 20) return { error: "20 produits au maximum." };
  const before = Number(item.price) * item.quantity;
  const after = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  if (Math.abs(before - after) > 0.01) {
    return { error: `Le total des lignes (${after.toFixed(2)} DH) doit rester égal à celui de la ligne d'origine (${before.toFixed(2)} DH).` };
  }

  const originalTitle = item.originalTitle ?? item.title; // jamais perdu, même après plusieurs corrections
  const [first, ...rest] = lines;
  const done = await prisma.$transaction(async (tx) => {
    // Garde-fou : la ligne n'a pas été modifiée entre-temps.
    const { count } = await tx.orderItem.updateMany({
      where: { id: itemId, shopifyVariantId: item.shopifyVariantId, albaseetCode: null },
      data: { ...first, originalTitle, stockInfo: Prisma.DbNull, stockCheckedAt: null },
    });
    if (count === 0) return false;
    for (const l of rest) await tx.orderItem.create({ data: { orderId: item.orderId, ...l, originalTitle } });
    return true;
  });
  if (!done) return { error: "Cette ligne vient d'être modifiée : recharge la page." };
  revalidatePath(`/orders/${item.orderId}`);
  return { error: null };
}

/** Ligne à relier : ni article ALBASEET+, ni variante présente dans la copie du catalogue Shopify. */
async function isRelinkable(item: { shopifyVariantId: string | null; albaseetCode: string | null }): Promise<boolean> {
  if (item.albaseetCode) return false;
  if (!item.shopifyVariantId) return true;
  return !(await prisma.shopifyVariant.findUnique({ where: { id: item.shopifyVariantId }, select: { id: true } }));
}
