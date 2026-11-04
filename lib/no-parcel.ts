// Commandes confirmées sans colis ("À expédier") : filtre partagé par la page
// Commandes et l'Accueil, et ancienneté affichée sur chaque ligne.
//
// Une commande remise à un livreur de l'entreprise (Livraison Casa) n'a pas de
// colis transporteur et n'en attend pas : elle n'en fait pas partie.
// Module pur, testé par no-parcel.check.ts.

export const NO_PARCEL = { forcelogCode: null, ozonCode: null, parcels: { none: {} }, localDelivery: false };

export type WaitTone = "gray" | "amber" | "red";

const DAY_MS = 86_400_000;

/** Jours entiers écoulés depuis la date de la commande (la date de confirmation n'est pas enregistrée). */
export function waitingDays(createdAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS));
}

/** Gris jusqu'à 3 jours, orange de 4 à 7 jours, rouge au-delà. */
export function waitTone(days: number): WaitTone {
  return days > 7 ? "red" : days > 3 ? "amber" : "gray";
}

export function waitLabel(days: number): string {
  return days === 0 ? "Sans colis · aujourd'hui" : `Sans colis depuis ${days} j`;
}
