// Catégorisation des colis Ozon Express par libellé de statut brut
// (Ozon n'expose pas de code machine séparé, contrairement à Forcelog —
// voir lib/ozon.ts). Vocabulaire réel observé sur plusieurs vrais colis
// (historiques complets récupérés via /tracking, pas deviné) :
// "Nouveau Colis", "Attente De Ramassage", "Ramassé", "Expédié", "Reçu",
// "Mise en distribution", "client intéressé", "Pas de réponse + SMS",
// "Reporté", "Programmé", "Livré", "Annulé", "Retourné".
//
// Mapping validé avec l'utilisateur avant implémentation, indépendamment
// de celui de Forcelog (voir lib/parcel-categories.ts) : "client
// intéressé" et "Reporté" rejoignent "Autre" (pas assez clairs / mêmes
// choix que pour Forcelog avec les statuts ambigus), "Colis hors zone"
// n'a aucun exemple réel pour l'instant — catégorie vide, à peupler dès
// qu'un vrai colis Ozon hors zone est observé.

export type OzonCategoryId = "shipped" | "delivering" | "cancelled" | "noAnswer" | "outOfZone";

export type OzonCategory = {
  id: OzonCategoryId;
  label: string;
  href: string;
  statuses: string[];
};

export const OZON_CATEGORIES: OzonCategory[] = [
  {
    id: "shipped",
    label: "Colis expédié",
    href: "/parcels/ozon/shipped",
    statuses: ["Ramassé", "Expédié", "Reçu"],
  },
  {
    id: "delivering",
    label: "Colis en cours de livraison",
    href: "/parcels/ozon/delivering",
    statuses: ["Mise en distribution", "Programmé"],
  },
  {
    id: "cancelled",
    label: "Colis refusé ou annulé",
    href: "/parcels/ozon/cancelled",
    statuses: ["Annulé", "Retourné", "Retourné Reçu par client"],
  },
  {
    id: "noAnswer",
    label: "Colis sans réponse",
    href: "/parcels/ozon/no-answer",
    statuses: ["Pas de réponse + SMS"],
  },
  {
    id: "outOfZone",
    label: "Colis hors zone",
    href: "/parcels/ozon/out-of-zone",
    statuses: [],
  },
];

export const ALL_OZON_CATEGORIZED_STATUSES = OZON_CATEGORIES.flatMap((c) => c.statuses);

export function ozonCategoryById(id: OzonCategoryId): OzonCategory {
  const cat = OZON_CATEGORIES.find((c) => c.id === id);
  if (!cat) throw new Error(`Catégorie Ozon inconnue: ${id}`);
  return cat;
}
