import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import OzonParcelsSubNav from "@/components/OzonParcelsSubNav";
import OzonParcelList from "@/components/OzonParcelList";
import { ozonCategoryById } from "@/lib/ozon-categories";
import { getOzonCategoryCounts } from "@/lib/ozon-category-counts";

export const dynamic = "force-dynamic";

const CATEGORY = ozonCategoryById("delivering");

export default async function OzonDeliveringPage() {
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: { status: "CONFIRMEE", carrier: "OZON", ozonStatus: { in: CATEGORY.statuses } },
      orderBy: { ozonStatusChangedAt: "desc" },
    }),
    getOzonCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <OzonParcelsSubNav active="delivering" counts={counts} />
      <OzonParcelList orders={orders} emptyMessage="Aucun colis en cours de livraison pour l'instant." />
    </main>
  );
}
