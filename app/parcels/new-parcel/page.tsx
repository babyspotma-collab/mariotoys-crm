import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import OrderParcelList from "@/components/OrderParcelList";

export const dynamic = "force-dynamic";

export default async function NewParcelPage() {
  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMEE", forcelogStatusCode: "NEW_PARCEL" },
    orderBy: { forcelogStatusChangedAt: "desc" },
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="newParcel" />
      <p className="text-sm text-muted mb-8">
        Colis tout juste créés côté Forcelog, pas encore pris en charge.
      </p>
      <OrderParcelList orders={orders} emptyMessage="Aucun nouveau colis pour l'instant." />
    </main>
  );
}
