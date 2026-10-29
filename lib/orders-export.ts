// Export Excel des commandes confirmées d'un mois (bouton sur la page Commandes).
// Parties pures (mois -> période, ligne du tableau, nom du transporteur)
// séparées de l'écriture du fichier : testées par orders-export.check.ts.

import { periodRange, type PeriodRange } from "@/lib/date-range";

/** "2026-10" -> période du 1er au dernier jour du mois (heure du Maroc), ou null si le mois est invalide. */
export function monthPeriod(month: string | null | undefined): PeriodRange | null {
  const m = month?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return null;
  const lastDay = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return periodRange({ period: "custom", from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` });
}

export type ExportOrder = {
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
  parcels: { carrier: string }[];
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

export type ExportRow = {
  date: string;
  articles: string;
  client: string;
  ville: string;
  transporteur: string;
  fraisLivraison: number | null;
  prix: number;
};

export function exportRow(o: ExportOrder): ExportRow {
  return {
    date: dateMa.format(o.createdAt),
    articles: o.items.map((i) => `${i.title} × ${i.quantity}`).join("\n"),
    client: o.customerName,
    ville: o.city,
    transporteur: transporterName(o),
    fraisLivraison: toNumber(o.shippingFee),
    prix: toNumber(o.totalPrice) ?? 0,
  };
}
