"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export type NewOrderState = { error: string | null };

type LineItem = { title: string; price: number; quantity: number };

export async function createManualOrder(
  _prevState: NewOrderState,
  formData: FormData
): Promise<NewOrderState> {
  const customerName = String(formData.get("customerName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const itemsRaw = String(formData.get("items") ?? "[]");

  if (!customerName || !phone || !city || !address) {
    return { error: "Tous les champs client sont obligatoires." };
  }

  let items: LineItem[];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { error: "Articles invalides." };
  }

  items = items.filter((i) => i.title && i.quantity > 0 && i.price >= 0);
  if (items.length === 0) {
    return { error: "Ajoutez au moins un article." };
  }

  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const orderNumber = `M-${Date.now().toString(36).toUpperCase()}`;

  await prisma.order.create({
    data: {
      shopifyOrderId: null,
      source: "MANUEL",
      orderNumber,
      customerName,
      phone,
      city,
      address,
      totalPrice,
      items: { create: items.map((i) => ({ title: i.title, quantity: i.quantity, price: i.price })) },
    },
  });

  // Rejoint la liste "Nouvelles" du dashboard — suit le même workflow
  // Confirmer que les commandes Shopify, sans étape spéciale.
  redirect("/");
}
