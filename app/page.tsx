import { prisma } from "@/lib/db";
import { cancelOrder, confirmOrder, startLocalDelivery } from "./orders/actions";
import { Phone, Plus, XCircle } from "@phosphor-icons/react/dist/ssr";
import AutoConfirmPanel from "@/components/AutoConfirmPanel";
import CasaMenu from "@/components/CasaMenu";
import ConfirmButton from "@/components/ConfirmButton";
import EmptyState from "@/components/EmptyState";
import MoreMenu from "@/components/MoreMenu";
import PageHeader from "@/components/PageHeader";
import PeriodFilter from "@/components/PeriodFilter";
import Pagination from "@/components/Pagination";
import Pill, { type PillTone } from "@/components/Pill";
import SearchForm from "@/components/SearchForm";
import Segmented from "@/components/Segmented";
import { periodParams, periodRange } from "@/lib/date-range";
import { formatDateTimeMa, formatDh } from "@/lib/format";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { findAutoConfirmations } from "@/lib/auto-confirm";
import { LOCAL_STATUS, isLocalStatus } from "@/lib/local-delivery";
import { cancelConfirmMessage } from "@/lib/order-cancel";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;
type Tab = "todo" | "noparcel" | "ok" | "all";
const TABS: Tab[] = ["todo", "noparcel", "ok", "all"];

// Cycle : À confirmer (NOUVELLE) -> Confirmée (CONFIRMEE, comptée dans les
// statistiques) -> Colis créé (CONFIRMEE + colis chez le transporteur).
// "Colis créé" n'est pas un statut en base : on le déduit du colis.
// Une commande remise à un livreur de l'entreprise (Livraison Casa, page
// /livraisons) n'a pas de colis transporteur et n'en attend pas : elle ne
// compte pas dans "Confirmées sans colis".
const NO_PARCEL = { forcelogCode: null, ozonCode: null, parcels: { none: {} }, localDelivery: false };

const STATUS_PILL: Record<string, { tone: PillTone; label: string }> = {
  NOUVELLE: { tone: "gray", label: "Nouvelle" },
  CONFIRMEE: { tone: "green", label: "Confirmée" },
  ANNULEE: { tone: "red", label: "Annulée" },
};

function orderNumberLabel(orderNumber: string) {
  // Les commandes Shopify stockent déjà orderNumber au format "#7325" —
  // ne jamais re-préfixer un second "#" (bug corrigé : "##7325").
  return orderNumber;
}

// Menu ⋯ "Annuler la commande" (commandes NOUVELLE et CONFIRMEE). La
// confirmation prévient si un colis existe chez le transporteur (le CRM ne
// l'annule pas) et si la commande est retirée de Livraisons Casa.
function CancelMenu({
  order,
  hasCarrierParcel,
}: {
  order: { id: string; orderNumber: string; customerName: string; localDelivery: boolean; localCourier: string | null };
  hasCarrierParcel: boolean;
}) {
  return (
    <MoreMenu rowAnchored>
      <form action={cancelOrder.bind(null, order.id)}>
        <ConfirmButton
          message={cancelConfirmMessage({
            orderNumber: orderNumberLabel(order.orderNumber),
            customerName: order.customerName,
            hasCarrierParcel,
            localDelivery: order.localDelivery,
            localCourier: order.localCourier,
          })}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-accent hover:bg-pill-red-bg"
        >
          <XCircle size={16} aria-hidden="true" />
          Annuler la commande
        </ConfirmButton>
      </form>
    </MoreMenu>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string; tab?: string; q?: string; page?: string };
}) {
  const range = periodRange(searchParams);
  const { start, end } = range;
  const periodKeep = periodParams(range);
  const dateFilter = { createdAt: { gte: start, lt: end } };
  const tab: Tab = TABS.find((t) => t === searchParams.tab) ?? "todo";
  const q = searchParams.q?.trim();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const listWhere = {
    ...dateFilter,
    ...(tab === "todo"
      ? { status: "NOUVELLE" as const }
      : tab === "noparcel"
        ? { status: "CONFIRMEE" as const, ...NO_PARCEL }
        : tab === "ok"
          ? { status: "CONFIRMEE" as const }
          : {}),
    ...(q
      ? {
          OR: [
            { customerName: { contains: q, mode: "insensitive" as const } },
            { orderNumber: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [orders, listTotal, counts, noParcelCount, auto] = await Promise.all([
    prisma.order.findMany({
      where: listWhere,
      include: { items: true, parcels: { select: { id: true }, take: 1 } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where: listWhere }),
    prisma.order.groupBy({ by: ["status"], where: dateFilter, _count: true }),
    prisma.order.count({ where: { ...dateFilter, status: "CONFIRMEE", ...NO_PARCEL } }),
    findAutoConfirmations(),
  ]);
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  const countFor = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;
  const totalOrders = counts.reduce((sum, c) => sum + c._count, 0);
  const confirmedCount = countFor("CONFIRMEE");
  const confirmationRate = totalOrders > 0 ? Math.round((confirmedCount / totalOrders) * 100) : 0;

  const tabs = [
    { id: "todo" as const, label: "À confirmer", count: countFor("NOUVELLE") },
    { id: "noparcel" as const, label: "Confirmées sans colis", count: noParcelCount },
    { id: "ok" as const, label: "Confirmées", count: confirmedCount },
    { id: "all" as const, label: "Toutes", count: totalOrders },
  ];

  // Toute URL construite ici repart de la page 1, sauf si "page" est passé
  // explicitement (liens Précédent / Suivant).
  const url = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { tab, ...periodKeep, q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/?${params.toString()}`;
  };
  const tabHref = (id: Tab) => url({ tab: id });

  return (
    <>
      <PageHeader
        title="Commandes"
        subtitle={`${range.label} · ${totalOrders} commandes, ${confirmationRate} % confirmées`}
        actions={
          <>
            <a href="/orders/new" className="btn-primary hidden md:inline-flex">
              <Plus size={16} weight="bold" aria-hidden="true" />
              Nouvelle commande
            </a>
          </>
        }
      />

      <AutoConfirmPanel toConfirm={auto.toConfirm} toReview={auto.toReview} />

      <PeriodFilter action="/" keep={{ tab, q }} range={range} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="Filtrer les commandes"
          items={tabs.map((t) => ({ href: tabHref(t.id), label: t.label, count: t.count, active: tab === t.id }))}
        />
        <SearchForm
          action="/"
          hidden={{ ...periodKeep, tab }}
          defaultValue={q}
          label="Rechercher une commande"
          placeholder="Client ou n° de commande"
        />
      </div>

      {orders.length === 0 ? (
        q ? (
          <EmptyState title={`Aucun résultat pour « ${q} »`}>
            <a href={url({ q: undefined })} className="font-medium text-ink underline underline-offset-4">
              Effacer la recherche
            </a>
          </EmptyState>
        ) : tab === "todo" ? (
          <EmptyState title="Aucune commande à confirmer">Tout est à jour sur cette période.</EmptyState>
        ) : tab === "noparcel" ? (
          <EmptyState title="Aucune commande en attente de colis">Toutes les commandes confirmées ont leur colis.</EmptyState>
        ) : (
          <EmptyState title="Aucune commande">Rien sur cette période dans cet onglet.</EmptyState>
        )
      ) : (
        <ul className="card divide-y divide-line-soft">
          {orders.map((order) => {
            const pill = STATUS_PILL[order.status] ?? { tone: "gray" as const, label: order.status };
            const itemsLabel = order.items.map((i) => `${i.title} ×${i.quantity}`).join(", ");
            const isNew = order.status === "NOUVELLE";
            const hasParcel = !!(order.forcelogCode || order.ozonCode || order.parcels.length);
            const phone = normalizeMoroccanPhone(order.phone);
            return (
              <li
                key={order.id}
                className="relative flex flex-col gap-3 p-4 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_96px_272px] xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_96px_320px] lg:items-center lg:gap-5 lg:px-5 lg:py-3.5"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold lg:font-medium">
                      {order.customerName}
                      {order.source === "MANUEL" && <span className="ml-2 text-xs font-normal text-muted">Manuel</span>}
                    </div>
                    {/* Numéro du client toujours visible, juste sous le nom (cliquable : appel) */}
                    <a
                      href={`tel:${phone}`}
                      className="mt-0.5 block truncate text-[13px] font-medium tabular-nums text-body no-underline hover:underline"
                    >
                      {phone}
                    </a>
                    <div className="mt-0.5 truncate text-[13px] tabular-nums text-muted">
                      <span className="lg:hidden">{order.city} · </span>
                      {orderNumberLabel(order.orderNumber)}, {formatDateTimeMa(order.createdAt)}
                    </div>
                    {order.autoConfirmedAt && (
                      <div className="mt-1 text-xs font-medium text-pill-green-fg">Confirmée automatiquement (colis envoyé)</div>
                    )}
                  </div>
                  <div className="shrink-0 font-semibold tabular-nums lg:hidden">{formatDh(order.totalPrice)}</div>
                </div>
                <div className="hidden truncate text-sm text-body lg:block">{order.city}</div>
                <div className="line-clamp-2 text-[13px] text-body lg:line-clamp-1 lg:text-sm">{itemsLabel}</div>
                <div className="hidden text-right text-sm font-semibold tabular-nums lg:block">{formatDh(order.totalPrice)}</div>

                <div className="flex items-center gap-2 lg:justify-end lg:gap-1">
                  {isNew ? (
                    <>
                      <a
                        href={`tel:${phone}`}
                        aria-label={`Appeler ${order.customerName} au ${phone}`}
                        title={phone}
                        className="btn-secondary w-11 px-0 lg:hidden"
                      >
                        <Phone size={18} aria-hidden="true" />
                      </a>
                      {/* Confirmer = statut seulement, aucun envoi au transporteur */}
                      <form action={confirmOrder.bind(null, order.id)} className="flex flex-1 lg:flex-none">
                        <button type="submit" className="btn-primary w-full lg:h-9 lg:px-3.5 lg:text-[13px]">
                          Confirmer
                        </button>
                      </form>
                      {/* Livraison Casa = confirme ET remet à un livreur, sans colis transporteur */}
                      <CasaMenu action={startLocalDelivery.bind(null, order.id)} compact />
                      <CancelMenu order={order} hasCarrierParcel={hasParcel} />
                    </>
                  ) : order.status === "CONFIRMEE" && order.localDelivery ? (
                    // Remise à un livreur de l'entreprise : badge vers /livraisons à la
                    // place de "Créer le colis" (couleur = statut local de la livraison).
                    <a
                      href="/livraisons"
                      className="block min-w-0 max-w-[190px] no-underline"
                      title={isLocalStatus(order.localStatus) ? `Livraison Casa : ${LOCAL_STATUS[order.localStatus].label}` : "Livraison Casa"}
                    >
                      <Pill tone={isLocalStatus(order.localStatus) ? LOCAL_STATUS[order.localStatus].tone : "gray"}>
                        Casa · {order.localCourier ?? "?"}
                      </Pill>
                    </a>
                  ) : order.status === "CONFIRMEE" && !hasParcel ? (
                    <>
                      <a href={`/orders/${order.id}/confirm`} className="btn-primary flex-1 lg:h-9 lg:flex-none lg:px-3.5 lg:text-[13px]">
                        Créer le colis
                      </a>
                      <CasaMenu action={startLocalDelivery.bind(null, order.id)} compact />
                    </>
                  ) : order.status === "CONFIRMEE" ? (
                    <Pill tone="green">Colis créé</Pill>
                  ) : (
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  )}
                  {/* Une commande confirmée peut être annulée, quelle que soit sa situation
                      (à créer, colis créé, badge Casa). Le colis éventuel chez le
                      transporteur n'est pas touché : le message le rappelle. */}
                  {order.status === "CONFIRMEE" && <CancelMenu order={order} hasCarrierParcel={hasParcel} />}
                </div>

                {order.forcelogError && (
                  <p className="alert-error text-xs lg:col-span-full">Erreur Forcelog : {order.forcelogError}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => url({ page: String(p) })} />

      {/* Mobile : bouton flottant au-dessus de la barre d'onglets */}
      <a
        href="/orders/new"
        aria-label="Nouvelle commande"
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-lg shadow-zinc-900/20 transition active:scale-95 md:hidden"
      >
        <Plus size={24} weight="bold" aria-hidden="true" />
      </a>
    </>
  );
}
