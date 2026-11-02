// Export Excel des commandes confirmées d'un mois (bouton sur la page Commandes).
// Parties pures (mois -> période, ligne du tableau, nom du transporteur)
// séparées de l'écriture du fichier : testées par orders-export.check.ts.

import { periodRange, type PeriodRange } from "@/lib/date-range";
import { parcelBucket } from "@/lib/home-stats";

/** "2026-10" -> période du 1er au dernier jour du mois (heure du Maroc), ou null si le mois est invalide. */
export function monthPeriod(month: string | null | undefined): PeriodRange | null {
  const m = month?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return null;
  const lastDay = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return periodRange({ period: "custom", from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` });
}

export type ExportOrder = {
  orderNumber: string;
  localNote: string | null;
  createdAt: Date;
  customerName: string;
  city: string;
  totalPrice: unknown; // Prisma Decimal | number | string
  shippingFee: unknown | null;
  carrier: string;
  forcelogCode: string | null;
  ozonCode: string | null;
  localDelivery: boolean;
  localCourier: string | null;
  localStatus: string | null;
  forcelogStatusCode: string | null;
  forcelogStatus: string | null;
  ozonStatus: string | null;
  // Le plus récent en premier.
  parcels: { carrier: "FORCELOG" | "OZON"; statusCode: string | null; status: string }[];
  items: { title: string; quantity: number }[];
};

/** Forcelog / Ozon Express, ou le livreur de la livraison Casablanca (Amine, Nizar…). Vide si aucun colis. */
export function transporterName(o: Pick<ExportOrder, "carrier" | "forcelogCode" | "ozonCode" | "localDelivery" | "localCourier" | "parcels">): string {
  if (o.localDelivery) return o.localCourier ?? "Livraison Casa";
  const carrier = o.forcelogCode ? "FORCELOG" : o.ozonCode ? "OZON" : (o.parcels[0]?.carrier ?? null);
  return carrier === "FORCELOG" ? "Forcelog" : carrier === "OZON" ? "Ozon Express" : "";
}

const dateMa = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", day: "2-digit", month: "2-digit", year: "numeric" });

const toNumber = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(String(v)));

/** Colis refusé / annulé / retourné chez Forcelog ou Ozon Express, ou livraison Casa marquée en retour. */
//
// Beaucoup de colis n'ont pas de code machine (statusCode vide) et seulement un
// libellé ("Retourné Reçu par client", "Retourné Expédié au client"…) : le
// libellé est donc lu aussi, en plus des catégories des pages Colis.
const RETURN_TEXT = /retourn|refus|annul|rembours/i;

function parcelReturned(carrier: "FORCELOG" | "OZON", statusCode: string | null, status: string): boolean {
  return parcelBucket(carrier, statusCode, status) === "returns" || RETURN_TEXT.test(status);
}

export function isReturned(
  o: Pick<ExportOrder, "localDelivery" | "localStatus" | "forcelogCode" | "ozonCode" | "forcelogStatusCode" | "forcelogStatus" | "ozonStatus" | "parcels">
): boolean {
  if (o.localDelivery) return o.localStatus === "RETOUR";
  const last = o.parcels[0]; // le plus récent (la requête les trie ainsi)
  if (last && parcelBucket(last.carrier, last.statusCode, last.status) === "delivered") return false;
  if (last && parcelReturned(last.carrier, last.statusCode, last.status)) return true;
  // Statut gardé sur la commande elle-même (peut être plus à jour que la ligne colis).
  if (o.forcelogCode && parcelReturned("FORCELOG", o.forcelogStatusCode, o.forcelogStatus ?? "")) return true;
  if (o.ozonCode && parcelReturned("OZON", null, o.ozonStatus ?? "")) return true;
  return false;
}

export type DeliveryState = "livree" | "retour" | "encours";

/** Livrée (argent encaissé), retour, ou encore en cours. Le retour l'emporte sur le reste sauf si le dernier colis est livré. */
export function deliveryState(o: Parameters<typeof isReturned>[0]): DeliveryState {
  if (o.localDelivery) return o.localStatus === "RETOUR" ? "retour" : o.localStatus === "LIVREE" ? "livree" : "encours";
  if (isReturned(o)) return "retour";
  const last = o.parcels[0];
  if (last && parcelBucket(last.carrier, last.statusCode, last.status) === "delivered") return "livree";
  if (o.forcelogCode && parcelBucket("FORCELOG", o.forcelogStatusCode, o.forcelogStatus ?? "") === "delivered") return "livree";
  if (o.ozonCode && parcelBucket("OZON", null, o.ozonStatus ?? "") === "delivered") return "livree";
  return "encours";
}

const STATE_LABEL: Record<DeliveryState, string> = { livree: "livrée", retour: "RETOUR", encours: "en cours" };

// Couleurs pastel (ARGB Excel) : lignes selon l'état, cellule "Livré par" selon le transporteur.
export const STATE_FILL: Record<DeliveryState, string | null> = {
  livree: "FFDDF1DD", // vert pastel
  retour: "FFFCE3CC", // pêche pastel
  encours: null,
};
const CARRIER_FILLS: Record<string, string> = {
  Forcelog: "FFE6DDF5", // lilas
  "Ozon Express": "FFD3EEE6", // menthe
  Amine: "FFD9E7F7", // bleu clair
  Nizar: "FFFBDDE8", // rose
  "Retrait Dépot": "FFD3EFF4", // cyan clair
  "Retrait Magasin": "FFD3EFF4",
};
const EXTRA_FILLS = ["FFFFF1C9", "FFE3EBC9", "FFEAD9F0", "FFFAD9D5", "FFD9E4EC"]; // livreurs sans couleur attitrée
export function carrierFill(name: string): string | null {
  if (!name) return null;
  const known = CARRIER_FILLS[name];
  if (known) return known;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA_FILLS[h % EXTRA_FILLS.length];
}

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/** "2026-10" -> "Mois d'Octobre 01/10/2026" (bandeau jaune de la feuille). */
export function monthBanner(month: string): string {
  const [y, m] = month.split("-");
  const name = MONTHS[Number(m) - 1];
  return `Mois ${/^[AEIOUÉ]/.test(name) ? "d'" : "de "}${name} 01/${m}/${y}`;
}

export type ExportRow = {
  numero: string;
  date: string; // jj/mm/aaaa
  articles: string;
  client: string;
  ville: string;
  livrePar: string;
  confirmation: string; // "valider" ; "annuler" quand le colis est revenu
  statut: string;
  state: DeliveryState;
  prix: number | null; // vide pour un retour (rien encaissé)
  fraisLivraison: number | null;
  remarque: string;
};

export function exportRow(o: ExportOrder): ExportRow {
  const state = deliveryState(o);
  const returned = state === "retour";
  return {
    numero: o.orderNumber,
    date: dateMa.format(o.createdAt),
    articles: o.items.map((i) => `${i.title} × ${i.quantity}`).join("\n"),
    client: o.customerName,
    ville: o.city,
    livrePar: transporterName(o),
    confirmation: returned ? "annuler" : "valider",
    statut: STATE_LABEL[state],
    state,
    prix: returned ? null : (toNumber(o.totalPrice) ?? 0),
    fraisLivraison: toNumber(o.shippingFee),
    remarque: [returned ? "Retourné" : "", o.localNote ?? ""].filter(Boolean).join(" — "),
  };
}