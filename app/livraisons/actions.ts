"use server";

import { revalidatePath } from "next/cache";
import { changeCourier, removeLocalDelivery, setLocalNote, setLocalStatus } from "@/lib/local-delivery-db";

// Toutes ces actions ne concernent que des commandes en livraison Casa
// (localDelivery: true, voir lib/local-delivery-db.ts) et sont manuelles :
// aucune synchronisation transporteur.

function refresh(orderId: string) {
  revalidatePath("/livraisons");
  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}/confirm`);
}

export async function markDelivered(orderId: string) {
  await setLocalStatus(orderId, ["A_LIVRER"], "LIVREE");
  refresh(orderId);
}

export async function markReturned(orderId: string) {
  await setLocalStatus(orderId, ["A_LIVRER"], "RETOUR");
  refresh(orderId);
}

// "Remettre chez le livreur" : depuis LIVREE ou RETOUR.
export async function putBackWithCourier(orderId: string) {
  await setLocalStatus(orderId, ["LIVREE", "RETOUR"], "A_LIVRER");
  refresh(orderId);
}

export async function reassignCourier(orderId: string, formData: FormData) {
  await changeCourier(orderId, formData.get("courier"));
  refresh(orderId);
}

export async function saveLocalNote(orderId: string, formData: FormData) {
  await setLocalNote(orderId, formData.get("note"));
  revalidatePath("/livraisons");
}

export async function removeFromLocalDelivery(orderId: string) {
  await removeLocalDelivery(orderId);
  refresh(orderId);
}
