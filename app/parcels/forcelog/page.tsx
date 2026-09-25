import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";

export const dynamic = "force-dynamic";

// Lit la base (synchronisée toutes les 2h, voir sync-tracking.yml) plutôt
// que l'API publique Forcelog GetParcels en direct : cette dernière s'est
// révélée structurellement cassée (pagination ignorée, ne renvoie qu'un
// petit pool aléatoire d'une vingtaine de colis quels que soient les
// paramètres) — vérifié en pratique, voir lib/forcelog.ts. Même source de
// vérité que les onglets par catégorie ci-dessous.
export default async function ParcelsPage() {
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: { status: "CONFIRMEE", carrier: "FORCELOG", forcelogCode: { not: null } },
      orderBy: { forcelogStatusChangedAt: "desc" },
    }),
    getParcelCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="all" counts={counts} />
      <OrderParcelList orders={orders} emptyMessage="Aucun colis Forcelog pour l'instant." />
    </main>
  );
}
