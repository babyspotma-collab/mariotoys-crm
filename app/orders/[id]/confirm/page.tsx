import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCities as getForcelogCities } from "@/lib/forcelog";
import { getCities as getOzonCities } from "@/lib/ozon";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { existingParcelCode } from "@/lib/existing-parcel";
import { buildProductNature } from "@/lib/parcel-limits";
import PageHeader from "@/components/PageHeader";
import { formatDateTimeMa, formatDh } from "@/lib/format";
import { confirmOrder } from "@/app/orders/actions";
import ConfirmForm from "./ConfirmForm";

export default async function ConfirmOrderPage({ params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: true },
  });

  if (!order) notFound();
  if (order.status === "ANNULEE") redirect("/");

  // Récapitulatif des articles, commun aux trois états de la fiche.
  const summary = (
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
  );
  const placedAt = <span className="tabular-nums">Passée le {formatDateTimeMa(order.createdAt)}</span>;

  // Un colis existe déjà (ex. créé chez le transporteur malgré une erreur
  // d'affichage) : on montre son numéro au lieu du formulaire, pour ne
  // jamais en créer un second.
  const existing = await existingParcelCode(order);
  if (existing) {
    const carrierPath = order.ozonCode === existing ? "ozon" : "forcelog";
    return (
      <>
        <PageHeader back={{ href: "/", label: "Commandes" }} title={`Commande ${order.orderNumber}`} subtitle="Colis créé" />
        <div className="card flex flex-col gap-3 p-4 md:p-6">
          <p className="text-sm">
            Cette commande a déjà un colis :{" "}
            <a
              href={`/parcels/${carrierPath}/${encodeURIComponent(existing)}`}
              className="font-mono font-semibold underline underline-offset-4"
            >
              {existing}
            </a>
          </p>
          <p className="text-sm text-muted">Aucun nouveau colis ne peut être créé pour cette commande.</p>
        </div>
      </>
    );
  }

  // Étape 1 : la commande n'est pas encore confirmée. Confirmer ne fait que
  // changer son statut (statistiques) ; le colis se crée à l'étape 2.
  if (order.status === "NOUVELLE") {
    const phone = normalizeMoroccanPhone(order.phone);
    const details: [string, React.ReactNode][] = [
      ["Client", order.customerName],
      [
        "Téléphone",
        <a key="tel" href={`tel:${phone}`} className="tabular-nums underline-offset-4 hover:underline">
          {phone}
        </a>,
      ],
      ["Ville", order.city || "-"],
      ["Adresse", order.address || "-"],
      ...(order.comment ? ([["Commentaire", order.comment]] as [string, string][]) : []),
    ];
    return (
      <>
        <PageHeader
          back={{ href: "/", label: "Commandes" }}
          title={`Commande ${order.orderNumber}`}
          subtitle={
            <>
              {placedAt}
              <span className="mt-1 block">À confirmer. Le colis se crée après la confirmation.</span>
            </>
          }
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          {summary}
          <section className="card flex flex-col lg:order-1">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2 md:p-6">
              {details.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <form
              action={confirmOrder.bind(null, order.id)}
              className="flex gap-2 rounded-b-[14px] border-t border-line p-4 md:px-6"
            >
              <button type="submit" className="btn-primary flex-1 md:flex-none">
                Confirmer la commande
              </button>
              <a href="/" className="btn-ghost">
                Plus tard
              </a>
            </form>
          </section>
        </div>
      </>
    );
  }

  // Étape 2 : commande confirmée, sans colis -> formulaire de colis.
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

  // Courte et ≤ 100 caractères (limite Forcelog / Ozon), voir lib/parcel-limits.ts.
  const defaultProductNature = buildProductNature(order.items);

  return (
    <>
      <PageHeader
        back={{ href: "/", label: "Commandes" }}
        title={`Commande ${order.orderNumber}`}
        subtitle={
          <>
            {placedAt}
            <span className="mt-1 block">Commande confirmée. Choisissez le transporteur puis créez le colis.</span>
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
        {summary}

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
