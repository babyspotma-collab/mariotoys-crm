import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCities as getForcelogCities } from "@/lib/forcelog";
import { getCities as getOzonCities } from "@/lib/ozon";
import { normalizeMoroccanPhone } from "@/lib/phone";
import ConfirmForm from "./ConfirmForm";

export default async function ConfirmOrderPage({ params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: true },
  });

  if (!order) notFound();
  if (order.status !== "NOUVELLE") redirect("/");

  // Les deux listes de villes sont chargées d'avance (transporteur choisi
  // côté client, voir ConfirmForm) — un seul échec (ex: Ozon down)
  // n'empêche pas de confirmer avec l'autre transporteur.
  let forcelogCities: Awaited<ReturnType<typeof getForcelogCities>> = [];
  let forcelogCitiesError: string | null = null;
  try {
    forcelogCities = await getForcelogCities();
  } catch (err) {
    forcelogCitiesError = err instanceof Error ? err.message : String(err);
  }

  let ozonCities: Awaited<ReturnType<typeof getOzonCities>> = [];
  let ozonCitiesError: string | null = null;
  try {
    ozonCities = await getOzonCities();
  } catch (err) {
    ozonCitiesError = err instanceof Error ? err.message : String(err);
  }

  const defaultProductNature =
    order.items.map((i) => `${i.title} x${i.quantity}`).join(", ") || "Jouet";

  return (
    <div className="max-w-2xl">
      <p className="mb-2 text-xs text-muted">
        <a href="/" className="no-underline hover:underline">← Retour aux commandes</a>
      </p>
      <h1 className="mb-1 text-[22px] md:text-[28px] font-semibold tracking-tight">
        Vérifier avant envoi — commande {order.orderNumber}
      </h1>
      <p className="text-sm text-muted mb-8">
        Corrigez les champs si besoin (téléphone, ville, adresse), choisissez le transporteur,
        puis créez le colis.
      </p>

      {forcelogCitiesError && (
        <p className="text-sm text-accent bg-pill-red-bg rounded-lg p-3 mb-6">
          Impossible de charger la liste des villes Forcelog : {forcelogCitiesError}. Rechargez la
          page pour réessayer.
        </p>
      )}
      {ozonCitiesError && (
        <p className="text-sm text-accent bg-pill-red-bg rounded-lg p-3 mb-6">
          Impossible de charger la liste des villes Ozon Express : {ozonCitiesError}. Rechargez la
          page pour réessayer.
        </p>
      )}

      <ConfirmForm
        orderId={order.id}
        forcelogCities={forcelogCities}
        ozonCities={ozonCities}
        initialValues={{
          receiver: order.customerName,
          phone: normalizeMoroccanPhone(order.phone),
          city: order.city,
          quartier: order.quartier ?? "",
          address: order.address,
          comment: order.comment ?? "",
          productNature: defaultProductNature,
          price: Number(order.totalPrice),
          fragile: order.fragile,
        }}
      />
    </div>
  );
}
