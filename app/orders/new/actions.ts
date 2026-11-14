"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { cleanPaidMethod } from "@/lib/payment-method";
import { SHIPPING_OPTIONS } from "@/lib/shipping-options";
import { resolveCatalogLines } from "@/lib/order-lines";
import { requireSession } from "@/lib/session";

export type NewOrderState = { error: string | null };

// Une ligne = une variante Shopify ou un article ALBASEET+ (lib/order-lines.ts) : aucun titre libre.

export async function createManualOrder(
  _prevState: NewOrderState,
  formData: FormData
): Promise<NewOrderState> {
  await requireSession();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const phone = normalizeMoroccanPhone(String(formData.get("phone") ?? "").trim());
  const city = String(formData.get("city") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const itemsRaw = String(formData.get("items") ?? "[]");

  if (!customerName || !phone || !city || !address) {
    return { error: "Tous les champs client sont obligatoires." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(itemsRaw);
  } catch {
    return { error: "Articles invalides." };
  }
  const resolved = await resolveCatalogLines(raw);
  if ("error" in resolved) return { error: resolved.error };
  const items = resolved.lines;

  // Frais de livraison choisis dans le formulaire : gratuit, 20 ou 40 DH.
  // Comme pour une commande Shopify, ils sont inclus dans le total à encaisser.
  const shipping = Number(formData.get("shipping") ?? 0);
  if (!SHIPPING_OPTIONS.includes(shipping as (typeof SHIPPING_OPTIONS)[number])) {
    return { error: "Frais de livraison invalides." };
  }

  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0) + shipping;

  const orderNumber = `M-${Date.now().toString(36).toUpperCase()}`;

  const paidMethod = cleanPaidMethod(formData.get("paidMethod"));

  await prisma.order.create({
    data: {
      shopifyOrderId: null,
      source: "MANUEL",
      // Saisie à la main = déjà validée avec le client : directement confirmée.
      status: "CONFIRMEE",
      orderNumber,
      customerName,
      phone,
      city,
      address,
      totalPrice,
      shippingFee: shipping,
      paidOnline: paidMethod !== null,
      paidMethod,
      items: {
        create: items,
      },
    },
  });

  // Commande confirmée d'office : on arrive sur l'onglet des confirmées, d'où
  // on crée le colis (ou on la remet à un livreur Casa).
  redirect("/orders?tab=ok");
}
