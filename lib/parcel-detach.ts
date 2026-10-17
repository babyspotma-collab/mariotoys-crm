// "Annuler le colis" : retire le colis Forcelog/Ozon d'une commande et remet la
// commande en "Confirmée sans colis" (pour créer un nouveau colis ou la remettre
// à un livreur, Livraison Casa).
//
// IMPORTANT : le CRM n'a aucun appel pour annuler un colis chez le transporteur.
// Cette action ne change QUE le CRM. Le message de confirmation demande donc
// d'annuler d'abord le colis chez Forcelog/Ozon.
//
// Le colis (ligne Parcel, avec son statut) est conservé pour les statistiques et
// le suivi transporteur ; il est seulement détaché de la commande et marqué
// detachedAt, pour que les synchronisations (qui rattachent par téléphone un
// colis sans commande) ne le recollent pas aussitôt.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type DetachMessageInput = {
  orderNumber: string;
  customerName: string;
  carrier: "FORCELOG" | "OZON" | null;
  code: string | null;
  status: string | null;
};

const CARRIER_LABEL = { FORCELOG: "Forcelog", OZON: "Ozon Express" } as const;

// Texte de la confirmation affichée avant de retirer le colis (window.confirm).
export function detachConfirmMessage(o: DetachMessageInput): string {
  const who = o.carrier ? CARRIER_LABEL[o.carrier] : "le transporteur";
  const parcel = o.code ? `Le colis ${o.code}` : "Le colis";
  const status = o.status ? ` (${who}, statut « ${o.status} »)` : ` (${who})`;
  return [
    `${parcel}${status} sera retiré de la commande ${o.orderNumber} de ${o.customerName}.`,
    "La commande redevient « Confirmée sans colis » : tu pourras créer un nouveau colis ou la remettre à un livreur (Livraison Casa).",
    `Le CRM n'annule PAS le colis chez ${who} : annule-le d'abord chez ${o.carrier ? who : "Forcelog/Ozon"}, sinon il sera quand même livré et facturé.`,
    "Continuer ?",
  ].join("\n\n");
}

export type DetachResult = { ok: boolean; reason?: string };

// Retire le(s) colis de la commande et la remet CONFIRMEE sans colis. Refusé si
// la commande n'est pas NOUVELLE/CONFIRMEE, est en Livraison Casa, ou n'a aucun
// colis. Tout se fait dans UNE transaction (colis détaché + commande nettoyée).
export async function detachParcelFromOrder(orderId: string): Promise<DetachResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      localDelivery: true,
      forcelogCode: true,
      ozonCode: true,
      parcels: { select: { id: true } },
    },
  });
  if (!order) return { ok: false, reason: "Commande introuvable." };
  if (order.status !== "NOUVELLE" && order.status !== "CONFIRMEE") {
    return { ok: false, reason: "Seule une commande à confirmer ou confirmée peut perdre son colis." };
  }
  if (order.localDelivery) return { ok: false, reason: "Commande en Livraison Casa : aucun colis transporteur." };
  const hasParcel = !!(order.forcelogCode || order.ozonCode || order.parcels.length);
  if (!hasParcel) return { ok: false, reason: "Cette commande n'a pas de colis." };

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      // La commande d'abord : plus de code ni de suivi transporteur ; "rendre
      // confirmé". Écriture conditionnelle (statut attendu, pas en Casa) : si la
      // commande a changé entre-temps, on annule TOUT (rien n'est détaché).
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: ["NOUVELLE", "CONFIRMEE"] }, localDelivery: false },
        data: {
          status: "CONFIRMEE",
          autoConfirmedAt: null, // "Confirmée automatiquement (colis envoyé)" ne serait plus vrai
          forcelogCode: null,
          forcelogStatus: null,
          forcelogStatusCode: null,
          forcelogError: null,
          forcelogProductNature: null,
          forcelogTrackingHistory: Prisma.DbNull,
          forcelogSyncedAt: null,
          forcelogStatusChangedAt: null,
          forcelogSyncFailCount: 0,
          ozonCode: null,
          ozonStatus: null,
          ozonError: null,
          ozonTrackingHistory: Prisma.DbNull,
          ozonSyncedAt: null,
          ozonStatusChangedAt: null,
          ozonSyncFailCount: 0,
        },
      });
      if (updated.count !== 1) throw new Error(CHANGED);
      // Les colis (lignes Parcel) liés à la commande : détachés ET marqués, jamais supprimés.
      await tx.parcel.updateMany({ where: { orderId }, data: { orderId: null, detachedAt: now } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === CHANGED) return { ok: false, reason: "La commande a changé entre-temps." };
    throw e;
  }
  return { ok: true };
}

const CHANGED = "ORDER_CHANGED";
