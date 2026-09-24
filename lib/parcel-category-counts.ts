import { prisma } from "@/lib/db";
import { PARCEL_CATEGORIES, ALL_CATEGORIZED_CODES, type ParcelCategoryId } from "./parcel-categories";

export type ParcelCategoryCounts = Record<ParcelCategoryId | "all" | "other", number>;

/** Un seul groupBy sur forcelogStatusCode, réparti ensuite entre les catégories — utilisé pour les compteurs affichés sur chaque onglet. */
export async function getParcelCategoryCounts(): Promise<ParcelCategoryCounts> {
  const rows = await prisma.order.groupBy({
    by: ["forcelogStatusCode"],
    where: { status: "CONFIRMEE", forcelogCode: { not: null } },
    _count: true,
  });

  const counts = {} as ParcelCategoryCounts;
  for (const cat of PARCEL_CATEGORIES) {
    counts[cat.id] = rows
      .filter((r) => r.forcelogStatusCode && cat.codes.includes(r.forcelogStatusCode))
      .reduce((sum, r) => sum + r._count, 0);
  }
  counts.other = rows
    .filter((r) => r.forcelogStatusCode && !ALL_CATEGORIZED_CODES.includes(r.forcelogStatusCode))
    .reduce((sum, r) => sum + r._count, 0);
  counts.all = rows.reduce((sum, r) => sum + r._count, 0);

  return counts;
}
