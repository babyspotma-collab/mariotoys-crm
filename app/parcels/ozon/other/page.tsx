import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import OzonParcelsSubNav from "@/components/OzonParcelsSubNav";
import OzonParcelList from "@/components/OzonParcelList";
import { ALL_OZON_CATEGORIZED_STATUSES } from "@/lib/ozon-categories";
import { getOzonCategoryCounts } from "@/lib/ozon-category-counts";

export const dynamic = "force-dynamic";

export default async function OzonOtherPage() {
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: "CONFIRMEE",
        carrier: "OZON",
        ozonCode: { not: null },
        ozonStatus: { not: null, notIn: ALL_OZON_CATEGORIZED_STATUSES },
      },
      orderBy: { ozonStatusChangedAt: "desc" },
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
      <OzonParcelList orders={orders} emptyMessage="Aucun colis dans cette catégorie pour l'instant." />
    </main>
  );
}
