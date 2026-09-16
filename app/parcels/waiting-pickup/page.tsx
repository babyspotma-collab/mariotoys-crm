import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";

export const dynamic = "force-dynamic";

export default async function WaitingPickupPage() {
  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMEE", forcelogStatusCode: "WAITING_PICKUP" },
    orderBy: { forcelogStatusChangedAt: "desc" },
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="waitingPickup" />
      <p className="text-sm text-muted mb-8">
        Colis en attente d&apos;être récupérés par le livreur.
      </p>
      <OrderParcelList orders={orders} emptyMessage="Aucun colis en attente de ramassage." />
    </main>
  );
}
