import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";
import { categoryById } from "@/lib/parcel-categories";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";

export const dynamic = "force-dynamic";

const CATEGORY = categoryById("delivering");

export default async function DeliveringPage() {
  const [parcels, counts] = await Promise.all([
    prisma.parcel.findMany({
      where: { carrier: "FORCELOG", statusCode: { in: CATEGORY.codes } },
      include: { order: true },
      orderBy: { carrierCreatedAt: "desc" },
    }),
    getParcelCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="delivering" counts={counts} />
      <OrderParcelList parcels={parcels} emptyMessage="Aucun colis en cours de livraison pour l'instant." />
    </main>
  );
}
