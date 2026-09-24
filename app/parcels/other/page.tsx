import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";
import { ALL_CATEGORIZED_CODES } from "@/lib/parcel-categories";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";

export const dynamic = "force-dynamic";

export default async function OtherPage() {
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: "CONFIRMEE",
        forcelogCode: { not: null },
        forcelogStatusCode: { not: null, notIn: ALL_CATEGORIZED_CODES },
      },
      orderBy: { forcelogStatusChangedAt: "desc" },
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
      <OrderParcelList orders={orders} emptyMessage="Aucun colis dans cette catégorie pour l'instant." />
    </main>
  );
}
