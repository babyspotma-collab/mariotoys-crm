// Catégorisation des colis par STATUS_CODE Forcelog réel (trouvé dans le
// <select id="f_statut"> de leur dashboard web, pas deviné — voir
// scripts/sync-forcelog-web.js). Validé avec l'utilisateur avant
// implémentation : "Retourné"/"Préparation retour"/"Demande de retour"
// rejoignent "Refusé ou annulé" (vente qui n'aboutit pas), "Numéro
// invalide" rejoint "Sans réponse" (client injoignable), "Livré" reste
// dans "Autre" avec le reste (pas de 6e catégorie dédiée).
//
// Source unique de vérité pour l'UI (app/parcels/*) ET pour la liste des
// codes à synchroniser (scripts/sync-forcelog-web.js, qui duplique cette
// liste — script Node CommonJS autonome, ne peut pas importer ce module
// ESM/TS directement).

export type ParcelCategoryId = "shipped" | "delivering" | "cancelled" | "noAnswer" | "outOfZone";

export type ParcelCategory = {
  id: ParcelCategoryId;
  label: string;
  href: string;
  codes: string[];
};

export const PARCEL_CATEGORIES: ParcelCategory[] = [
  {
    id: "shipped",
    label: "Colis expédié",
    href: "/parcels/forcelog/shipped",
    codes: ["PICKED_UP", "PICKED_UP_1", "SENT", "RECEIVED"],
  },
  {
    id: "delivering",
    label: "Colis en cours de livraison",
    href: "/parcels/forcelog/delivering",
    codes: ["DISTRIBUTION", "IN_PROGRESS", "TRAVELLING"],
  },
  {
    id: "cancelled",
    label: "Colis refusé ou annulé",
    href: "/parcels/forcelog/cancelled",
    codes: ["CANCELED", "DOESNT_ORDER", "REFUSE", "CANCELED_TEAM", "RETURNED", "PREPAR_RETURN", "RERETURN"],
  },
  {
    id: "noAnswer",
    label: "Colis sans réponse",
    href: "/parcels/forcelog/no-answer",
    codes: ["NO_ANSWER", "NO_ANSWER_SMS", "NO_ANSWER_TEAM", "NOANSWER3", "UNREACHABLE", "UNREACHABLE_TEAM", "VOICEMAIL", "NUMBERERROR"],
  },
  {
    id: "outOfZone",
    label: "Colis hors zone",
    href: "/parcels/forcelog/out-of-zone",
    codes: ["OUT_OF_AREA"],
  },
];

export const ALL_CATEGORIZED_CODES = PARCEL_CATEGORIES.flatMap((c) => c.codes);

export function categoryById(id: ParcelCategoryId): ParcelCategory {
  const cat = PARCEL_CATEGORIES.find((c) => c.id === id);
  if (!cat) throw new Error(`Catégorie inconnue: ${id}`);
  return cat;
}
