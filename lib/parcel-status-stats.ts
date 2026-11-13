// Répartition des colis de la période par statut (Forcelog + Ozon Express),
// affichée sur l'Accueil. Mêmes catégories que les pages Colis
// (lib/parcel-categories.ts, lib/ozon-categories.ts).

import { prisma } from "@/lib/db";
import { OZON_CATEGORIES } from "@/lib/ozon-categories";
import { PARCEL_CATEGORIES } from "@/lib/parcel-categories";
import { parcelInRange } from "@/lib/parcel-date";

export const STATUS_BUCKETS = ["delivered", "ongoing", "cancelled", "noAnswer", "other"] as const;
export type StatusBucket = (typeof STATUS_BUCKETS)[number];
export const STATUS_LABELS: Record<StatusBucket, string> = {
  delivered: "Livré",
  ongoing: "En cours de livraison",
  cancelled: "Refusé ou annulé",
  noAnswer: "Sans réponse",
  other: "Non catégorisé",
};
export const STATUS_COLORS: Record<StatusBucket, string> = {
  delivered: "#2F7A45",
  ongoing: "#2F5E9E",
  cancelled: "#B3432C",
  noAnswer: "#A87A1E",
  other: "#8A857C",
};

const forcelogCodes = (id: string) => PARCEL_CATEGORIES.find((c) => c.id === id)!.codes;
const ozonStatuses = (id: string) => OZON_CATEGORIES.find((c) => c.id === id)!.statuses;

export async function parcelStatusBreakdown(range: { start: Date; end: Date }): Promise<Record<StatusBucket, number>> {
  const dateFilter = parcelInRange(range);
  const totals: Record<StatusBucket, number> = { delivered: 0, ongoing: 0, cancelled: 0, noAnswer: 0, other: 0 };

  const [forcelog, ozon] = await Promise.all([
    prisma.parcel.groupBy({ by: ["statusCode"], where: { carrier: "FORCELOG", ...dateFilter }, _count: true }),
    prisma.parcel.groupBy({ by: ["status"], where: { carrier: "OZON", ...dateFilter }, _count: true }),
  ]);

  for (const r of forcelog) {
    const code = r.statusCode;
    if (code && forcelogCodes("delivered").includes(code)) totals.delivered += r._count;
    else if (code && ["shipped", "delivering", "relaunchNewClient"].some((id) => forcelogCodes(id).includes(code))) totals.ongoing += r._count;
    else if (code && forcelogCodes("cancelled").includes(code)) totals.cancelled += r._count;
    else if (code && forcelogCodes("noAnswer").includes(code)) totals.noAnswer += r._count;
    else totals.other += r._count; // hors zone + non catégorisé
  }
  for (const r of ozon) {
    const s = r.status;
    if (ozonStatuses("delivered").includes(s)) totals.delivered += r._count;
    else if (["shipped", "delivering"].some((id) => ozonStatuses(id).includes(s))) totals.ongoing += r._count;
    else if (ozonStatuses("cancelled").includes(s)) totals.cancelled += r._count;
    else if (ozonStatuses("noAnswer").includes(s)) totals.noAnswer += r._count;
    else totals.other += r._count;
  }
  return totals;
}
