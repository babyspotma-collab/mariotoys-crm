import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import OzonParcelsSubNav from "@/components/OzonParcelsSubNav";
import OzonParcelList from "@/components/OzonParcelList";
import { getOzonCategoryCounts } from "@/lib/ozon-category-counts";

export const dynamic = "force-dynamic";

export default async function OzonAllPage() {
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: { status: "CONFIRMEE", carrier: "OZON", ozonCode: { not: null } },
      orderBy: { ozonStatusChangedAt: "desc" },
    }),
    getOzonCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <OzonParcelsSubNav active="all" counts={counts} />
      <OzonParcelList orders={orders} emptyMessage="Aucun colis Ozon Express pour l'instant." />
    </main>
  );
}
