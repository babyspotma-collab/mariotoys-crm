// Annulation d'une commande depuis la page Commandes : message de
// confirmation (pur, testable) et écriture en base.
//
// Annuler ne fait QUE changer le statut de la commande dans le CRM :
//  - le colis éventuel chez Forcelog/Ozon n'est JAMAIS touché (le CRM n'a pas
//    d'appel d'annulation transporteur) : le message de confirmation prévient
//    qu'il faut l'annuler chez le transporteur ;
//  - une commande en Livraison Casa est retirée du suivi (champs local* vidés)
//    pour qu'elle ne reste pas "Chez le livreur" sur /livraisons.

import { prisma } from "@/lib/db";

export type CancelMessageInput = {
  orderNumber: string;
  customerName: string;
  // Un colis existe chez le transporteur (code Forcelog/Ozon ou ligne Parcel).
  hasCarrierParcel: boolean;
  localDelivery: boolean;
  localCourier: string | null;
};

export const CARRIER_PARCEL_WARNING =
  "Un colis existe chez le transporteur : le CRM ne l'annule pas, pense à l'annuler chez Forcelog/Ozon.";

// Texte de la confirmation affichée avant d'annuler (window.confirm).
export function cancelConfirmMessage(o: CancelMessageInput): string {
  const parts = [`Annuler la commande ${o.orderNumber} de ${o.customerName} ?`];
  if (o.localDelivery) {
    parts.push(
      `Elle est en Livraison Casa${o.localCourier ? ` chez ${o.localCourier}` : ""} : elle sera aussi retirée de Livraisons Casa.`
    );
  }
  if (o.hasCarrierParcel) parts.push(CARRIER_PARCEL_WARNING);
  return parts.join("\n\n");
}

export type CancelResult = { ok: boolean; reason?: string };

// Passe la commande en ANNULEE (depuis NOUVELLE ou CONFIRMEE seulement) et vide
// le suivi Livraison Casa. Écriture conditionnelle : un double clic ou une page
// périmée ne peut pas "annuler" une commande déjà annulée ni écraser autre chose.
// Les champs du colis transporteur (forcelogCode, ozonCode, Parcel...) ne sont
// volontairement PAS modifiés.
export async function cancelOrderRecord(orderId: string): Promise<CancelResult> {
  const res = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ["NOUVELLE", "CONFIRMEE"] } },
    data: {
      status: "ANNULEE",
      localDelivery: false,
      localCourier: null,
      localStatus: null,
      localAssignedAt: null,
      localStatusChangedAt: null,
    },
  });
  return res.count === 1 ? { ok: true } : { ok: false, reason: "Commande introuvable ou déjà annulée." };
}
