import { prisma } from "@/lib/db";
import { OZON_CATEGORIES, ALL_OZON_CATEGORIZED_STATUSES, type OzonCategoryId } from "./ozon-categories";

export type OzonCategoryCounts = Record<OzonCategoryId | "all" | "uncategorized", number>;

/** Un seul groupBy sur Parcel.status (carrier OZON), réparti ensuite entre les catégories — utilisé pour les compteurs affichés sur chaque onglet. */
export async function getOzonCategoryCounts(): Promise<OzonCategoryCounts> {
  const rows = await prisma.parcel.groupBy({
    by: ["status"],
    where: { carrier: "OZON" },
    _count: true,
  });

  const counts = {} as OzonCategoryCounts;
  for (const cat of OZON_CATEGORIES) {
    counts[cat.id] = rows
      .filter((r) => cat.statuses.includes(r.status))
      .reduce((sum, r) => sum + r._count, 0);
  }
  counts.uncategorized = rows
    .filter((r) => !ALL_OZON_CATEGORIZED_STATUSES.includes(r.status))
    .reduce((sum, r) => sum + r._count, 0);
  counts.all = rows.reduce((sum, r) => sum + r._count, 0);

  return counts;
}
