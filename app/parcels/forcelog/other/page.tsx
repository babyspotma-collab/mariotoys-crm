import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";
import { ALL_CATEGORIZED_CODES } from "@/lib/parcel-categories";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";

export const dynamic = "force-dynamic";

export default async function OtherPage() {
  const [parcels, counts] = await Promise.all([
    prisma.parcel.findMany({
      where: {
        carrier: "FORCELOG",
        OR: [{ statusCode: null }, { statusCode: { notIn: ALL_CATEGORIZED_CODES } }],
      },
      include: { order: true },
      orderBy: { carrierCreatedAt: "desc" },
    }),
    getParcelCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="other" counts={counts} />
      <p className="text-xs text-muted mb-6">
        Statuts Forcelog ne correspondant à aucune des 5 catégories ci-dessus
        (ex : Livré, Reporté, Relancer...).
      </p>
      <OrderParcelList parcels={parcels} emptyMessage="Aucun colis dans cette catégorie pour l'instant." />
    </main>
  );
}
