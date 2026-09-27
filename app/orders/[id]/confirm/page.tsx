import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCities as getForcelogCities } from "@/lib/forcelog";
import { getCities as getOzonCities } from "@/lib/ozon";
import { normalizeMoroccanPhone } from "@/lib/phone";
import PageHeader from "@/components/PageHeader";
import { formatDateTimeMa, formatDh } from "@/lib/format";
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
    <>
      <PageHeader
        back={{ href: "/", label: "Commandes" }}
        title={`Commande ${order.orderNumber}`}
        subtitle={
          <>
            <span className="tabular-nums">Passée le {formatDateTimeMa(order.createdAt)}</span>
            <span className="mt-1 block">Vérifiez les informations, choisissez le transporteur, puis créez le colis.</span>
          </>
        }
      />

      {forcelogCitiesError && (
        <p className="alert-error">
          Liste des villes Forcelog indisponible : {forcelogCitiesError}. Rechargez la page pour réessayer.
        </p>
      )}
      {ozonCitiesError && (
        <p className="alert-error">
          Liste des villes Ozon Express indisponible : {ozonCitiesError}. Rechargez la page pour réessayer.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <aside className="card p-4 md:p-5 lg:sticky lg:top-9 lg:order-2">
          <h2 className="text-sm font-semibold">Articles commandés</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0 text-body">
                  {item.title} <span className="text-muted">×{item.quantity}</span>
                </span>
                <span className="shrink-0 tabular-nums text-body">{formatDh(Number(item.price) * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-line-soft pt-3">
            <span className="text-sm text-muted">Total</span>
            <span className="text-lg font-semibold tabular-nums">{formatDh(order.totalPrice)}</span>
          </div>
        </aside>

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
    </>
  );
}
