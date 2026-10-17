"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { startLocalDelivery as startLocalDeliveryDb } from "@/lib/local-delivery-db";
import { cancelOrderRecord } from "@/lib/order-cancel";
import { detachParcelFromOrder } from "@/lib/parcel-detach";

// Annule la commande (NOUVELLE ou CONFIRMEE). Ne touche pas au colis éventuel
// chez le transporteur ; retire la commande de Livraisons Casa si besoin
// (voir lib/order-cancel.ts).
export async function cancelOrder(orderId: string) {
  await cancelOrderRecord(orderId);
  revalidatePath("/");
  revalidatePath("/livraisons");
  revalidatePath(`/orders/${orderId}/confirm`);
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

// "Annuler le colis" : retire le colis Forcelog/Ozon de la commande, qui redevient
// "Confirmée sans colis". Ne change QUE le CRM : le colis chez le transporteur
// doit être annulé là-bas (voir lib/parcel-detach.ts).
export async function detachParcel(orderId: string) {
  await detachParcelFromOrder(orderId);
  revalidatePath("/");
  revalidatePath("/parcels");
  revalidatePath(`/orders/${orderId}/confirm`);
}

// "Livraison Casa" : confirme la commande (si besoin) ET la remet à un livreur
// de l'entreprise (champ "courier" du formulaire : Amine, Nizar ou un autre).
// Aucun appel Forcelog/Ozon, aucun colis. Refusée si la commande n'est pas
// NOUVELLE/CONFIRMEE ou a déjà un colis (voir lib/local-delivery-db.ts).
export async function startLocalDelivery(orderId: string, formData: FormData) {
  await startLocalDeliveryDb(orderId, formData.get("courier"));
  revalidatePath("/");
  revalidatePath("/livraisons");
  revalidatePath(`/orders/${orderId}/confirm`);
}
