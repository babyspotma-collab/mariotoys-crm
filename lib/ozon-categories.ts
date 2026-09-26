// Catégorisation des colis Ozon Express par libellé de statut brut
// (Ozon n'expose pas de code machine séparé, contrairement à Forcelog —
// voir lib/ozon.ts). Vocabulaire complet réel extrait en direct du
// filtre "Status" de leur dashboard (client.ozoneexpress.ma/parcels,
// <select name="filter_status">, ~40 valeurs — pas deviné), recoupé avec
// l'historique réel de plusieurs vrais colis.
//
// Mapping validé avec l'utilisateur : "Reporté" (et variantes) rejoint
// "En cours de livraison", "Livré" devient sa propre catégorie stricte.
// Aucun équivalent Ozon à "Relancer vers un nouveau client" (vérifié sur
// les ~40 statuts réels) — Ozon n'a donc que 6 catégories + "Non
// catégorisé", contre 7 + "Non catégorisé" pour Forcelog ; les deux
// transporteurs ont des vocabulaires indépendants, pas de raison d'avoir
// le même nombre d'onglets. Ce qui ne rentre dans aucune catégorie va
// dans "Non catégorisé" plutôt que d'être perdu silencieusement.

export type OzonCategoryId = "shipped" | "delivering" | "cancelled" | "noAnswer" | "outOfZone" | "delivered";

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
    statuses: [
      "Ramassé",
      "Expédié",
      "Reçu",
      "Reçu En Agence De Livraison",
      "Envoyé à l'agence",
      "expédier par AMANA",
    ],
  },
  {
    id: "delivering",
    label: "Colis en cours de livraison",
    href: "/parcels/ozon/delivering",
    statuses: [
      "Mise en distribution",
      "En cours",
      "Programmé",
      "En Voyage",
      "Reporté",
      "Reporté ( SUIVI )",
      "reporté aujourd hui",
      "Retardé",
      "Retard Livraison 48h-72h",
    ],
  },
  {
    id: "cancelled",
    label: "Colis refusé ou annulé",
    href: "/parcels/ozon/cancelled",
    statuses: [
      "Annulé",
      "Annulé ( SUIVI )",
      "Refusé",
      "Retourné",
      "Retourné Reçu par client",
      "En retour par AMANA",
      "Remboursé",
    ],
  },
  {
    id: "noAnswer",
    label: "Colis sans réponse",
    href: "/parcels/ozon/no-answer",
    statuses: [
      "Pas de réponse + SMS",
      "Pas de réponse J+2",
      "Pas de réponse J+3",
      "Pas de reponse ( SUIVI )",
      "Injoignable",
      "Injoignable ( SUIVI )",
      "Boite Vocal",
      "Boite Vocal ( SUIVI )",
      "Erreur Numero",
      "pas réponse +déplacement",
      "pas réponse + déplacement J+2",
      "pas réponse + déplacement J+3",
    ],
  },
  {
    id: "outOfZone",
    label: "Colis hors zone",
    href: "/parcels/ozon/out-of-zone",
    statuses: ["Hors-zone", "Zone Non-couverte", "Hors Secteur"],
  },
  {
    id: "delivered",
    label: "Livré",
    href: "/parcels/ozon/delivered",
    statuses: ["Livré"],
  },
];

export const ALL_OZON_CATEGORIZED_STATUSES = OZON_CATEGORIES.flatMap((c) => c.statuses);

export function ozonCategoryById(id: OzonCategoryId): OzonCategory {
  const cat = OZON_CATEGORIES.find((c) => c.id === id);
  if (!cat) throw new Error(`Catégorie Ozon inconnue: ${id}`);
  return cat;
}
