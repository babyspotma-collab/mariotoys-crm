import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";

export const dynamic = "force-dynamic";

// Lit Parcel (synchronisé toutes les 2h depuis le dashboard web Forcelog,
// voir scripts/sync-forcelog-web.js) — la vraie liste complète de tout ce
// qui existe chez Forcelog depuis le 1er septembre 2026, pas seulement ce
// qui a été créé via ce CRM. L'API publique GetParcels s'est révélée
// structurellement cassée (pagination ignorée, ne renvoie qu'un petit
// pool aléatoire) — vérifié en pratique, voir lib/forcelog.ts.
export default async function ParcelsPage() {
  const [parcels, counts] = await Promise.all([
    prisma.parcel.findMany({
      where: { carrier: "FORCELOG" },
      include: { order: true },
      orderBy: { carrierCreatedAt: "desc" },
    }),
    getParcelCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="all" counts={counts} />
      <OrderParcelList parcels={parcels} emptyMessage="Aucun colis Forcelog pour l'instant." />
    </main>
  );
}
