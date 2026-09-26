import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import OzonParcelsSubNav from "@/components/OzonParcelsSubNav";
import OzonParcelList from "@/components/OzonParcelList";
import { getOzonCategoryCounts } from "@/lib/ozon-category-counts";

export const dynamic = "force-dynamic";

// Lit Parcel (synchronisé toutes les 2h depuis client.ozoneexpress.ma, voir
// scripts/sync-ozon-web.js) — Ozon n'a aucun endpoint API pour lister tous
// les colis, donc c'est la seule source pour la vraie liste complète.
export default async function OzonAllPage() {
  const [parcels, counts] = await Promise.all([
    prisma.parcel.findMany({
      where: { carrier: "OZON" },
      include: { order: true },
      orderBy: { carrierCreatedAt: "desc" },
    }),
    getOzonCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <OzonParcelsSubNav active="all" counts={counts} />
      <OzonParcelList parcels={parcels} emptyMessage="Aucun colis Ozon Express pour l'instant." />
    </main>
  );
}
