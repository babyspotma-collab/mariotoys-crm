import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import OzonParcelsSubNav from "@/components/OzonParcelsSubNav";
import OzonParcelList from "@/components/OzonParcelList";
import { ALL_OZON_CATEGORIZED_STATUSES } from "@/lib/ozon-categories";
import { getOzonCategoryCounts } from "@/lib/ozon-category-counts";

export const dynamic = "force-dynamic";

export default async function OzonOtherPage() {
  const [parcels, counts] = await Promise.all([
    prisma.parcel.findMany({
      where: { carrier: "OZON", status: { notIn: ALL_OZON_CATEGORIZED_STATUSES } },
      include: { order: true },
      orderBy: { carrierCreatedAt: "desc" },
    }),
    getOzonCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <OzonParcelsSubNav active="other" counts={counts} />
      <p className="text-xs text-muted mb-6">
        Statuts Ozon ne correspondant à aucune des 5 catégories ci-dessus
        (ex : Nouveau Colis, Attente De Ramassage, Reporté, Livré...).
      </p>
      <OzonParcelList parcels={parcels} emptyMessage="Aucun colis dans cette catégorie pour l'instant." />
    </main>
  );
}
