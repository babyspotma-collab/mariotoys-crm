import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";
import { categoryById } from "@/lib/parcel-categories";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";

export const dynamic = "force-dynamic";

const CATEGORY = categoryById("outOfZone");

export default async function OutOfZonePage() {
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
      <ParcelsSubNav active="outOfZone" counts={counts} />
      <OrderParcelList orders={orders} emptyMessage="Aucun colis hors zone pour l'instant." />
    </main>
  );
}
