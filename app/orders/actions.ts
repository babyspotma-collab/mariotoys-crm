"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { addParcel } from "@/lib/forcelog";

export async function confirmOrder(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });

  const productNature = order.items.map((i) => `${i.title} x${i.quantity}`).join(", ");

  try {
    const parcel = await addParcel({
      orderNum: order.orderNumber,
      receiver: order.customerName,
      phone: order.phone,
      city: order.city,
      address: order.address,
      cod: Number(order.totalPrice),
      productNature: productNature || "Textile médical",
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CONFIRMEE",
        forcelogCode: parcel.code,
        forcelogError: null,
      },
    });
  } catch (err) {
    // On garde la commande en NOUVELLE pour permettre un nouvel essai
    // depuis le dashboard, en gardant trace de l'erreur Forcelog.
    await prisma.order.update({
      where: { id: orderId },
      data: { forcelogError: err instanceof Error ? err.message : String(err) },
    });
  }

  revalidatePath("/");
}

export async function cancelOrder(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "ANNULEE" },
  });
  revalidatePath("/");
}
