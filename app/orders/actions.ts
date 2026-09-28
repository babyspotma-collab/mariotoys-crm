"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function cancelOrder(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "ANNULEE" },
  });
  revalidatePath("/");
}

// Confirmer = uniquement passer la commande en CONFIRMEE (comptée dans les
// statistiques). Aucun appel transporteur : le colis se crée ensuite, à
// part, depuis "Créer le colis" (app/orders/[id]/confirm).
export async function confirmOrder(orderId: string) {
  await prisma.order.updateMany({
    where: { id: orderId, status: "NOUVELLE" },
    data: { status: "CONFIRMEE" },
  });
  revalidatePath("/");
  revalidatePath(`/orders/${orderId}/confirm`);
}
