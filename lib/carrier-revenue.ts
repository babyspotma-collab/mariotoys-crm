import { prisma } from "@/lib/db";

// "Depuis le 1er septembre 2026" — même borne que les scripts de sync
// (voir scripts/sync-forcelog-web.js / sync-ozon-web.js), calculé
// directement sur Parcel (la vraie liste transporteur, pas seulement les
// commandes du CRM) plutôt que sur Order.
const SINCE = new Date("2026-09-01T00:00:00Z");

const FORCELOG_DELIVERED_CODES = ["DELIVERED", "DELIVERED_INVOICED", "DELIVERED_NOT_INVOICED"];
const OZON_DELIVERED_STATUS = "Livré";

export async function getCarrierRevenue(): Promise<{ forcelog: number; ozon: number }> {
  const [forcelogAgg, ozonAgg] = await Promise.all([
    prisma.parcel.aggregate({
      where: {
        carrier: "FORCELOG",
        statusCode: { in: FORCELOG_DELIVERED_CODES },
        carrierCreatedAt: { gte: SINCE },
      },
      _sum: { price: true },
    }),
    prisma.parcel.aggregate({
      where: {
        carrier: "OZON",
        status: OZON_DELIVERED_STATUS,
        carrierCreatedAt: { gte: SINCE },
      },
      _sum: { price: true },
    }),
  ]);

  return {
    forcelog: Number(forcelogAgg._sum.price ?? 0),
    ozon: Number(ozonAgg._sum.price ?? 0),
  };
}
