import { prisma } from "@/lib/db";
import { categoryById } from "@/lib/parcel-categories";
import { ozonCategoryById } from "@/lib/ozon-categories";

// Tableau comparatif par transporteur (page Statistiques). "Retours" =
// catégorie "cancelled" (refusé/annulé/retourné, voir lib/parcel-categories.ts
// et lib/ozon-categories.ts) calculée depuis Parcel — remplace l'ancien
// "taux d'annulation" qui lisait Order.status (bug : ne reflétait que les
// annulations manuelles avant expédition, jamais les refus/retours
// transporteur réels, donc toujours 0 % en pratique).
export type CarrierStatRow = {
  id: "forcelog" | "ozon";
  name: string;
  sent: number;
  delivered: number;
  deliveryRate: number | null;
  returns: number;
  returnRate: number | null;
  avgDelayDays: number | null;
  avgFee: number | null;
  cashIn: number | null;
};

type Range = { start: Date; end: Date };

async function rowFor(
  id: "forcelog" | "ozon",
  name: string,
  carrier: "FORCELOG" | "OZON",
  deliveredWhere: Record<string, unknown>,
  cancelledWhere: Record<string, unknown>,
  range: Range
): Promise<CarrierStatRow> {
  const dateFilter = { carrierCreatedAt: { gte: range.start, lt: range.end } };

  const [sent, delivered, returns, delayRows, invoiceAgg] = await Promise.all([
    prisma.parcel.count({ where: { carrier, ...dateFilter } }),
    prisma.parcel.count({ where: { carrier, ...dateFilter, ...deliveredWhere } }),
    prisma.parcel.count({ where: { carrier, ...dateFilter, ...cancelledWhere } }),
    prisma.parcel.findMany({
      where: { carrier, ...dateFilter, deliveredAt: { not: null } },
      select: { carrierCreatedAt: true, deliveredAt: true },
    }),
    prisma.crbtInvoice.aggregate({
      where: { carrier, cDate: { gte: range.start, lt: range.end } },
      _sum: { feesAmount: true, parcelsCount: true, amount: true },
    }),
  ]);

  const delays = delayRows
    .filter((p) => p.carrierCreatedAt && p.deliveredAt)
    .map((p) => (p.deliveredAt!.getTime() - p.carrierCreatedAt!.getTime()) / 86_400_000);
  const avgDelayDays = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null;

  const billedParcels = invoiceAgg._sum.parcelsCount ?? 0;
  const avgFee = billedParcels > 0 ? Number(invoiceAgg._sum.feesAmount ?? 0) / billedParcels : null;
  const cashIn = billedParcels > 0 ? Number(invoiceAgg._sum.amount ?? 0) : null;

  return {
    id,
    name,
    sent,
    delivered,
    deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : null,
    returns,
    returnRate: sent > 0 ? Math.round((returns / sent) * 100) : null,
    avgDelayDays,
    avgFee,
    cashIn,
  };
}

export async function getCarrierStats(range: Range): Promise<CarrierStatRow[]> {
  const [forcelog, ozon] = await Promise.all([
    rowFor(
      "forcelog",
      "Forcelog",
      "FORCELOG",
      { statusCode: { in: categoryById("delivered").codes } },
      { statusCode: { in: categoryById("cancelled").codes } },
      range
    ),
    rowFor(
      "ozon",
      "Ozon Express",
      "OZON",
      { status: { in: ozonCategoryById("delivered").statuses } },
      { status: { in: ozonCategoryById("cancelled").statuses } },
      range
    ),
  ]);
  return [forcelog, ozon];
}
