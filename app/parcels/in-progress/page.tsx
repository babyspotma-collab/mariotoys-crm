import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";

export const dynamic = "force-dynamic";

// Regroupe les 3 statuts d'acheminement pré-livraison : reçu hub, reçu
// ville, expédié vers la ville de destination.
const IN_PROGRESS_CODES = ["PICKED_UP", "RECEIVED", "SENT"];

export default async function InProgressPage() {
  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMEE", forcelogStatusCode: { in: IN_PROGRESS_CODES } },
    orderBy: { forcelogStatusChangedAt: "desc" },
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="inProgress" />
      <p className="text-sm text-muted mb-8">
        Colis en cours d&apos;acheminement (reçu hub, reçu ville, expédié vers la ville).
      </p>
      <OrderParcelList orders={orders} emptyMessage="Aucun colis en cours de livraison." />
    </main>
  );
}
