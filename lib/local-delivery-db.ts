// Écritures de la Livraison Casablanca. Les server actions (app/orders/actions.ts
// et app/livraisons/actions.ts) ne font que lire le formulaire et appeler ces
// fonctions ; elles vivent ici pour pouvoir être vérifiées sans contexte Next.
//
// Règle : toute écriture est un updateMany CONDITIONNEL (état attendu dans le
// where) — un double clic ou une page périmée ne peut jamais écraser un état
// plus récent, et rien ne touche une commande qui n'est pas en livraison Casa
// (sauf la remise initiale, qui exige justement qu'elle ne le soit pas).

import { prisma } from "@/lib/db";
import { cleanCourier, type LocalStatus } from "@/lib/local-delivery";

// Aucun colis transporteur d'aucune sorte : ni code Forcelog/Ozon, ni ligne
// Parcel liée. Même définition que "Confirmées sans colis" (app/page.tsx).
const NO_CARRIER_PARCEL = { forcelogCode: null, ozonCode: null, parcels: { none: {} } };

export type LocalResult = { ok: boolean; reason?: string };

// Confirme la commande (si elle est NOUVELLE) ET la remet au livreur. Aucun
// appel Forcelog/Ozon. Ne s'applique qu'à une commande NOUVELLE ou CONFIRMEE
// sans aucun colis et pas déjà en livraison Casa.
export async function startLocalDelivery(orderId: string, rawCourier: unknown): Promise<LocalResult> {
  const courier = cleanCourier(rawCourier);
  if (!courier) return { ok: false, reason: "Nom de livreur vide ou invalide." };

  const now = new Date();
  const res = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: { in: ["NOUVELLE", "CONFIRMEE"] },
      localDelivery: false,
      ...NO_CARRIER_PARCEL,
    },
    data: {
      status: "CONFIRMEE",
      localDelivery: true,
      localCourier: courier,
      localStatus: "A_LIVRER",
      localAssignedAt: now,
      localStatusChangedAt: now,
    },
  });
  return res.count === 1
    ? { ok: true }
    : { ok: false, reason: "Commande introuvable, annulée, déjà en livraison Casa ou déjà avec un colis." };
}

// Change le statut d'une commande déjà en livraison Casa, seulement depuis
// l'un des statuts `from` (ex. LIVREE uniquement depuis A_LIVRER). Remettre
// chez le livreur (-> A_LIVRER) compte comme une nouvelle remise : la date de
// remise est mise à jour.
export async function setLocalStatus(orderId: string, from: LocalStatus[], to: LocalStatus): Promise<LocalResult> {
  const now = new Date();
  const res = await prisma.order.updateMany({
    where: { id: orderId, localDelivery: true, localStatus: { in: from } },
    data: {
      localStatus: to,
      localStatusChangedAt: now,
      ...(to === "A_LIVRER" ? { localAssignedAt: now } : {}),
    },
  });
  return res.count === 1 ? { ok: true } : { ok: false, reason: "Statut déjà modifié ou commande retirée." };
}

// Change de livreur. Si la commande est encore chez le livreur (A_LIVRER),
// c'est une nouvelle remise physique : la date de remise est mise à jour. Pour
// une commande déjà livrée ou en retour, seul le nom change (historique).
export async function changeCourier(orderId: string, rawCourier: unknown): Promise<LocalResult> {
  const courier = cleanCourier(rawCourier);
  if (!courier) return { ok: false, reason: "Nom de livreur vide ou invalide." };

  const pending = await prisma.order.updateMany({
    where: { id: orderId, localDelivery: true, localStatus: "A_LIVRER" },
    data: { localCourier: courier, localAssignedAt: new Date() },
  });
  if (pending.count === 1) return { ok: true };

  const done = await prisma.order.updateMany({
    where: { id: orderId, localDelivery: true },
    data: { localCourier: courier },
  });
  return done.count === 1 ? { ok: true } : { ok: false, reason: "Commande retirée de Livraisons Casa." };
}

// Retire la commande de Livraisons Casa : tous les champs local* sont vidés,
// la commande reste CONFIRMEE (donc de nouveau "Confirmée sans colis").
export async function removeLocalDelivery(orderId: string): Promise<LocalResult> {
  const res = await prisma.order.updateMany({
    where: { id: orderId, localDelivery: true },
    data: {
      localDelivery: false,
      localCourier: null,
      localStatus: null,
      localAssignedAt: null,
      localStatusChangedAt: null,
    },
  });
  return res.count === 1 ? { ok: true } : { ok: false, reason: "Commande déjà retirée." };
}
