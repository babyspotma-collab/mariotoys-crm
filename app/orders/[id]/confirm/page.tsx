import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCities } from "@/lib/forcelog";
import ConfirmForm from "./ConfirmForm";

export default async function ConfirmOrderPage({ params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: true },
  });

  if (!order) notFound();
  if (order.status !== "NOUVELLE") redirect("/");

  let cities: Awaited<ReturnType<typeof getCities>> = [];
  let citiesError: string | null = null;
  try {
    cities = await getCities();
  } catch (err) {
    citiesError = err instanceof Error ? err.message : String(err);
  }

  const defaultProductNature =
    order.items.map((i) => `${i.title} x${i.quantity}`).join(", ") || "Jouet";

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <p className="text-xs text-muted mb-2">
        <a href="/">← Retour au dashboard</a>
      </p>
      <h1 className="text-xl font-semibold mb-1">
        Vérifier avant envoi — commande #{order.orderNumber}
      </h1>
      <p className="text-sm text-muted mb-8">
        Corrigez les champs si besoin (téléphone, ville, adresse), puis créez le colis Forcelog.
      </p>

      {citiesError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Impossible de charger la liste des villes Forcelog : {citiesError}. Rechargez la page
          pour réessayer.
        </p>
      )}

      <ConfirmForm
        orderId={order.id}
        cities={cities}
        initialValues={{
          receiver: order.customerName,
          phone: order.phone,
          city: order.city,
          quartier: order.quartier ?? "",
          address: order.address,
          comment: order.comment ?? "",
          productNature: defaultProductNature,
          price: Number(order.totalPrice),
          fragile: order.fragile,
        }}
      />
    </main>
  );
}
