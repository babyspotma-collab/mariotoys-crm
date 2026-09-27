import { prisma } from "@/lib/db";
import { cancelOrder } from "./orders/actions";
import MonthFilter from "@/components/MonthFilter";
import MoreMenu from "@/components/MoreMenu";
import Pill, { type PillTone } from "@/components/Pill";
import { monthLabel, monthRange } from "@/lib/date-range";
import { formatDh } from "@/lib/format";

export const dynamic = "force-dynamic";

const ORDERS_SAFETY_LIMIT = 500;
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
  searchParams: { month?: string; tab?: string; q?: string };
}) {
  const { start, end, month } = monthRange(searchParams.month);
  const dateFilter = { createdAt: { gte: start, lt: end } };
  const tab: Tab = searchParams.tab === "ok" || searchParams.tab === "all" ? searchParams.tab : "todo";
  const q = searchParams.q?.trim();

  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: {
        ...dateFilter,
        ...(tab === "todo" ? { status: "NOUVELLE" } : tab === "ok" ? { status: "CONFIRMEE" } : {}),
        ...(q
          ? {
              OR: [
                { customerName: { contains: q, mode: "insensitive" } },
                { orderNumber: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: ORDERS_SAFETY_LIMIT,
    }),
    prisma.order.groupBy({ by: ["status"], where: dateFilter, _count: true }),
  ]);

  const countFor = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;
  const totalOrders = counts.reduce((sum, c) => sum + c._count, 0);
  const confirmedCount = countFor("CONFIRMEE");
  const confirmationRate = totalOrders > 0 ? Math.round((confirmedCount / totalOrders) * 100) : 0;

  const tabs = [
    { id: "todo" as const, label: "À confirmer", count: countFor("NOUVELLE") },
    { id: "ok" as const, label: "Confirmées", count: confirmedCount },
    { id: "all" as const, label: "Toutes", count: totalOrders },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold tracking-tight">Commandes</h1>
          <p className="text-sm text-muted">
            {monthLabel(month)} · {totalOrders} commandes · {confirmationRate} % confirmées
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MonthFilter month={month} action="/" />
          <form action="/" className="flex items-center gap-3">
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="tab" value={tab} />
            <label htmlFor="q" className="sr-only">
              Rechercher une commande
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Rechercher un client, un n°…"
              className="h-10 w-[260px] rounded-[10px] border border-line-input bg-white px-3.5 text-sm text-ink"
            />
          </form>
          <a href="/orders/new" className="btn-primary">
            Nouvelle commande
          </a>
        </div>
      </div>

      <div role="tablist" aria-label="Filtrer les commandes" className="inline-flex w-fit gap-0.5 rounded-[10px] bg-segment p-[3px]">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={`/?tab=${t.id}${searchParams.month ? `&month=${searchParams.month}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            role="tab"
            aria-selected={tab === t.id}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[13px] no-underline ${
              tab === t.id ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-body"
            }`}
          >
            {t.label} <span className="font-medium text-muted">{t.count}</span>
          </a>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[96px_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,2fr)_110px_90px_92px] items-center gap-3 border-b border-line-soft px-5 text-[12px] font-medium uppercase tracking-wide text-muted h-11">
          <div>N°</div>
          <div>Client</div>
          <div>Ville</div>
          <div>Articles</div>
          <div className="text-right">Montant</div>
          <div className="text-right">Date</div>
          <div />
        </div>

        {orders.length === 0 && (
          <p className="px-5 py-6 text-sm text-muted">Aucune commande pour ce mois.</p>
        )}

        {orders.map((order) => {
          const pill = STATUS_PILL[order.status] ?? { tone: "gray" as const, label: order.status };
          const itemsLabel = order.items.map((i) => `${i.title} ×${i.quantity}`).join(", ");
          return (
            <div key={order.id} className="flex flex-col border-b border-line-soft last:border-b-0">
              <div className="grid min-h-16 grid-cols-[96px_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,2fr)_110px_90px_92px] items-center gap-3 px-5 py-3 text-sm">
                <div className="font-mono text-[13px] text-muted">{orderNumberLabel(order.orderNumber)}</div>
                <div className="min-w-0">
                  <span className="font-medium">{order.customerName}</span>
                  {order.source === "MANUEL" && (
                    <span className="ml-1.5 align-middle text-[11px] text-muted">(manuel)</span>
                  )}
                </div>
                <div className="truncate text-body">{order.city}</div>
                <div className="truncate pr-4 text-body">{itemsLabel}</div>
                <div className="text-right font-semibold">{formatDh(order.totalPrice)}</div>
                <div className="text-right text-[13px] text-muted">
                  {order.createdAt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                </div>
                <div className="flex items-center justify-end gap-1">
                  {order.status === "NOUVELLE" ? (
                    <a href={`/orders/${order.id}/confirm`} className="btn-secondary h-[34px] px-3.5 text-[13px]">
                      Confirmer
                    </a>
                  ) : (
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  )}
                  {order.status === "NOUVELLE" && (
                    <MoreMenu>
                      <form action={cancelOrder.bind(null, order.id)}>
                        <button
                          type="submit"
                          className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-accent hover:bg-cream-dark"
                        >
                          Annuler la commande
                        </button>
                      </form>
                    </MoreMenu>
                  )}
                </div>
              </div>
              {order.forcelogError && (
                <p className="px-5 pb-3 text-xs text-accent">Erreur Forcelog : {order.forcelogError}</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
