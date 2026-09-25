import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";
import { categoryById } from "@/lib/parcel-categories";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";

export const dynamic = "force-dynamic";

const CATEGORY = categoryById("cancelled");

export default async function CancelledPage() {
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: { status: "CONFIRMEE", forcelogStatusCode: { in: CATEGORY.codes } },
      orderBy: { forcelogStatusChangedAt: "desc" },
    }),
    getParcelCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="cancelled" counts={counts} />
      <OrderParcelList orders={orders} emptyMessage="Aucun colis refusé ou annulé pour l'instant." />
    </main>
  );
}
