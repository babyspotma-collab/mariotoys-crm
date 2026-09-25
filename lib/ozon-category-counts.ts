import { prisma } from "@/lib/db";
import { OZON_CATEGORIES, ALL_OZON_CATEGORIZED_STATUSES, type OzonCategoryId } from "./ozon-categories";

export type OzonCategoryCounts = Record<OzonCategoryId | "all" | "other", number>;

/** Un seul groupBy sur ozonStatus, réparti ensuite entre les catégories — utilisé pour les compteurs affichés sur chaque onglet. */
export async function getOzonCategoryCounts(): Promise<OzonCategoryCounts> {
  const rows = await prisma.order.groupBy({
    by: ["ozonStatus"],
    where: { status: "CONFIRMEE", carrier: "OZON", ozonCode: { not: null } },
    _count: true,
  });

  const counts = {} as OzonCategoryCounts;
  for (const cat of OZON_CATEGORIES) {
    counts[cat.id] = rows
      .filter((r) => r.ozonStatus && cat.statuses.includes(r.ozonStatus))
      .reduce((sum, r) => sum + r._count, 0);
  }
  counts.other = rows
    .filter((r) => r.ozonStatus && !ALL_OZON_CATEGORIZED_STATUSES.includes(r.ozonStatus))
    .reduce((sum, r) => sum + r._count, 0);
  counts.all = rows.reduce((sum, r) => sum + r._count, 0);

  return counts;
}
