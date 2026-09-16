import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";

export const dynamic = "force-dynamic";

// STATUS_CODE réels "Annulé" et "Refusé" — trouvés dans le
// <select id="f_statut"> réel du dashboard web Forcelog, synchronisés
// par scripts/sync-forcelog-web.js (l'API publique ne permet pas de
// filtrer par statut de façon fiable).
const CANCELLED_CODES = ["CANCELED", "DOESNT_ORDER", "REFUSE"];

export default async function ReturnsPage() {
  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMEE", forcelogStatusCode: { in: CANCELLED_CODES } },
    orderBy: { forcelogStatusChangedAt: "desc" },
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="returns" />

      <p className="text-sm text-muted mb-8">
        Colis dont le statut Forcelog exact est "Annulé" ou "Refusé".
      </p>

      <OrderParcelList orders={orders} emptyMessage="Aucun colis annulé ou refusé pour l'instant." />
    </main>
  );
}
