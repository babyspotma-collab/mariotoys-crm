// Livraison Casablanca : commandes remises directement à un livreur de
// l'entreprise (aucun colis Forcelog/Ozon). Constantes et petites fonctions
// partagées par la page Commandes, la page /livraisons et les actions.
//
// Module pur (aucun import serveur) : utilisable côté serveur et client.

import type { PillTone } from "@/components/Pill";

export type LocalStatus = "A_LIVRER" | "LIVREE" | "RETOUR";

// Livreurs proposés en un clic ; tout autre nom est accepté ("Autre livreur").
export const DEFAULT_COURIERS = ["Amine", "Nizar"] as const;

export const COURIER_MAX_LENGTH = 40;

// Libellé complet (page /livraisons) et couleur de chaque statut.
export const LOCAL_STATUS: Record<LocalStatus, { label: string; tone: PillTone }> = {
  A_LIVRER: { label: "Chez le livreur", tone: "amber" },
  LIVREE: { label: "Livrée", tone: "green" },
  RETOUR: { label: "Retour", tone: "red" },
};

// Nettoie un nom de livreur saisi : une seule ligne, espaces normalisés,
// pas de caractères de contrôle, 40 caractères maximum. Renvoie "" si le nom
// est vide ou invalide (l'appelant refuse alors l'action). Un nom qui
// correspond à un livreur par défaut (sans tenir compte de la casse ni des
// accents) reprend son écriture officielle, pour que "amine" et "Amine" ne
// fassent pas deux livreurs différents dans les filtres.
export function cleanCourier(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const text = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, COURIER_MAX_LENGTH)
    .trim();
  if (!text) return "";
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const known = DEFAULT_COURIERS.find((c) => fold(c) === fold(text));
  return known ?? text;
}

export function isLocalStatus(value: unknown): value is LocalStatus {
  return value === "A_LIVRER" || value === "LIVREE" || value === "RETOUR";
}
