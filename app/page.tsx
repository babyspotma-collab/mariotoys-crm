import { prisma } from "@/lib/db";
import { cancelOrder } from "./orders/actions";
import { Phone, Plus, XCircle } from "@phosphor-icons/react/dist/ssr";
import ConfirmButton from "@/components/ConfirmButton";
import EmptyState from "@/components/EmptyState";
import MonthFilter from "@/components/MonthFilter";
import MoreMenu from "@/components/MoreMenu";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import Pill, { type PillTone } from "@/components/Pill";
import SearchForm from "@/components/SearchForm";
import Segmented from "@/components/Segmented";
import { monthLabel, monthRange } from "@/lib/date-range";
import { formatDh } from "@/lib/format";
import { normalizeMoroccanPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;
type Tab = "todo" | "ok" | "all";

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { month?: string; tab?: string; q?: string; page?: string };
}) {
  const { start, end, month } = monthRange(searchParams.month);
  const dateFilter = { createdAt: { gte: start, lt: end } };
  const tab: Tab = searchParams.tab === "ok" || searchParams.tab === "all" ? searchParams.tab : "todo";
  const q = searchParams.q?.trim();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const listWhere = {
    ...dateFilter,
    ...(tab === "todo" ? { status: "NOUVELLE" as const } : tab === "ok" ? { status: "CONFIRMEE" as const } : {}),
    ...(q
      ? {
          OR: [
            { customerName: { contains: q, mode: "insensitive" as const } },
            { orderNumber: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [orders, listTotal, counts] = await Promise.all([
    prisma.order.findMany({
      where: listWhere,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where: listWhere }),
    prisma.order.groupBy({ by: ["status"], where: dateFilter, _count: true }),
  ]);
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  const countFor = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;
  const totalOrders = counts.reduce((sum, c) => sum + c._count, 0);
  const confirmedCount = countFor("CONFIRMEE");
  const confirmationRate = totalOrders > 0 ? Math.round((confirmedCount / totalOrders) * 100) : 0;

  const tabs = [
    { id: "todo" as const, label: "À confirmer", count: countFor("NOUVELLE") },
    { id: "ok" as const, label: "Confirmées", count: confirmedCount },
    { id: "all" as const, label: "Toutes", count: totalOrders },
  ];

  // Toute URL construite ici repart de la page 1, sauf si "page" est passé
  // explicitement (liens Précédent / Suivant).
  const url = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { tab, month: searchParams.month, q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/?${params.toString()}`;
  };
  const tabHref = (id: Tab) => url({ tab: id });
  const shortDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <>
      <PageHeader
        title="Commandes"
        subtitle={`${totalOrders} commandes · ${confirmationRate} % confirmées`}
        actions={
          <>
            <MonthFilter month={month} action="/" />
            <a href="/orders/new" className="btn-primary hidden md:inline-flex">
              <Plus size={16} weight="bold" aria-hidden="true" />
              Nouvelle commande
            </a>
          </>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="Filtrer les commandes"
          items={tabs.map((t) => ({ href: tabHref(t.id), label: t.label, count: t.count, active: tab === t.id }))}
        />
        <SearchForm
          action="/"
          hidden={{ month, tab }}
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
          <EmptyState title="Aucune commande à confirmer">Tout est à jour pour {monthLabel(month).toLowerCase()}.</EmptyState>
        ) : (
          <EmptyState title="Aucune commande">Rien pour {monthLabel(month).toLowerCase()} dans cet onglet.</EmptyState>
        )
      ) : (
        <ul className="card divide-y divide-line-soft">
          {orders.map((order) => {
            const pill = STATUS_PILL[order.status] ?? { tone: "gray" as const, label: order.status };
            const itemsLabel = order.items.map((i) => `${i.title} ×${i.quantity}`).join(", ");
            const isNew = order.status === "NOUVELLE";
            const phone = normalizeMoroccanPhone(order.phone);
            return (
              <li
                key={order.id}
                className="flex flex-col gap-3 p-4 md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1.6fr)_96px_172px] md:items-center md:gap-5 md:px-5 md:py-3.5"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold md:font-medium">
                      {order.customerName}
                      {order.source === "MANUEL" && <span className="ml-2 text-xs font-normal text-muted">Manuel</span>}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] tabular-nums text-muted">
                      <span className="md:hidden">{order.city} · </span>
                      {orderNumberLabel(order.orderNumber)}, {shortDate(order.createdAt)}
                      <span className="hidden md:inline"> · {phone}</span>
                    </div>
                  </div>
                  <div className="shrink-0 font-semibold tabular-nums md:hidden">{formatDh(order.totalPrice)}</div>
                </div>
                <div className="hidden truncate text-sm text-body md:block">{order.city}</div>
                <div className="line-clamp-2 text-[13px] text-body md:line-clamp-1 md:text-sm">{itemsLabel}</div>
                <div className="hidden text-right text-sm font-semibold tabular-nums md:block">{formatDh(order.totalPrice)}</div>

                <div className="flex items-center gap-2 md:justify-end md:gap-1">
                  {isNew ? (
                    <>
                      <a
                        href={`tel:${phone}`}
                        aria-label={`Appeler ${order.customerName} au ${phone}`}
                        title={phone}
                        className="btn-secondary w-11 px-0 md:hidden"
                      >
                        <Phone size={18} aria-hidden="true" />
                      </a>
                      <a href={`/orders/${order.id}/confirm`} className="btn-primary flex-1 md:h-9 md:flex-none md:px-3.5 md:text-[13px]">
                        Confirmer
                      </a>
                      <MoreMenu>
                        <form action={cancelOrder.bind(null, order.id)}>
                          <ConfirmButton
                            message={`Annuler la commande ${orderNumberLabel(order.orderNumber)} de ${order.customerName} ?`}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-accent hover:bg-pill-red-bg"
                          >
                            <XCircle size={16} aria-hidden="true" />
                            Annuler la commande
                          </ConfirmButton>
                        </form>
                      </MoreMenu>
                    </>
                  ) : (
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  )}
                </div>

                {order.forcelogError && (
                  <p className="alert-error text-xs md:col-span-full">Erreur Forcelog : {order.forcelogError}</p>
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
