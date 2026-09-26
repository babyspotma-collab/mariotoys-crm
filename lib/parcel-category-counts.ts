import { prisma } from "@/lib/db";
import { PARCEL_CATEGORIES, ALL_CATEGORIZED_CODES, type ParcelCategoryId } from "./parcel-categories";

export type ParcelCategoryCounts = Record<ParcelCategoryId | "all" | "uncategorized", number>;

/** Un seul groupBy sur Parcel.statusCode (carrier FORCELOG), réparti ensuite entre les catégories — utilisé pour les compteurs affichés sur chaque onglet. */
export async function getParcelCategoryCounts(): Promise<ParcelCategoryCounts> {
  const rows = await prisma.parcel.groupBy({
    by: ["statusCode"],
    where: { carrier: "FORCELOG" },
    _count: true,
  });

  const counts = {} as ParcelCategoryCounts;
  for (const cat of PARCEL_CATEGORIES) {
    counts[cat.id] = rows
      .filter((r) => r.statusCode && cat.codes.includes(r.statusCode))
      .reduce((sum, r) => sum + r._count, 0);
  }
  counts.uncategorized = rows
    .filter((r) => !r.statusCode || !ALL_CATEGORIZED_CODES.includes(r.statusCode))
    .reduce((sum, r) => sum + r._count, 0);
  counts.all = rows.reduce((sum, r) => sum + r._count, 0);

  return counts;
}
