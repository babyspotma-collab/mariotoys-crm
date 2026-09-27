import { prisma } from "@/lib/db";
import MonthFilter from "@/components/MonthFilter";
import PageHeader from "@/components/PageHeader";
import Segmented from "@/components/Segmented";
import { monthRange, monthLabel } from "@/lib/date-range";
import { formatDh, formatInt } from "@/lib/format";
import { getCarrierStats } from "@/lib/carrier-stats";
import { PARCEL_CATEGORIES } from "@/lib/parcel-categories";
import { OZON_CATEGORIES } from "@/lib/ozon-categories";

export const dynamic = "force-dynamic";

type CarrierFilter = "all" | "forcelog" | "ozon";

const STATUS_BUCKETS = ["delivered", "ongoing", "cancelled", "noAnswer", "other"] as const;
type StatusBucket = (typeof STATUS_BUCKETS)[number];
const STATUS_LABELS: Record<StatusBucket, string> = {
  delivered: "Livré",
  ongoing: "En cours de livraison",
  cancelled: "Refusé ou annulé",
  noAnswer: "Sans réponse",
  other: "Non catégorisé",
};
const STATUS_COLORS: Record<StatusBucket, string> = {
  delivered: "#2F7A45",
  ongoing: "#2F5E9E",
  cancelled: "#B3432C",
  noAnswer: "#A87A1E",
  other: "#8A857C",
};

async function statusBreakdown(carrier: CarrierFilter, range: { start: Date; end: Date }) {
  const dateFilter = { carrierCreatedAt: { gte: range.start, lt: range.end } };
  const totals: Record<StatusBucket, number> = {
    delivered: 0,
    ongoing: 0,
    cancelled: 0,
    noAnswer: 0,
    other: 0,
  };

  if (carrier !== "ozon") {
    const rows = await prisma.parcel.groupBy({
      by: ["statusCode"],
      where: { carrier: "FORCELOG", ...dateFilter },
      _count: true,
    });
    for (const r of rows) {
      const code = r.statusCode;
      if (code && PARCEL_CATEGORIES.find((c) => c.id === "delivered")!.codes.includes(code)) totals.delivered += r._count;
      else if (
        code &&
        ["shipped", "delivering", "relaunchNewClient"].some((id) =>
          PARCEL_CATEGORIES.find((c) => c.id === id)!.codes.includes(code)
        )
      )
        totals.ongoing += r._count;
      else if (code && PARCEL_CATEGORIES.find((c) => c.id === "cancelled")!.codes.includes(code)) totals.cancelled += r._count;
      else if (code && PARCEL_CATEGORIES.find((c) => c.id === "noAnswer")!.codes.includes(code)) totals.noAnswer += r._count;
      else totals.other += r._count; // hors zone + non catégorisé
    }
  }

  if (carrier !== "forcelog") {
    const rows = await prisma.parcel.groupBy({
      by: ["status"],
      where: { carrier: "OZON", ...dateFilter },
      _count: true,
    });
    for (const r of rows) {
      const status = r.status;
      if (OZON_CATEGORIES.find((c) => c.id === "delivered")!.statuses.includes(status)) totals.delivered += r._count;
      else if (["shipped", "delivering"].some((id) => OZON_CATEGORIES.find((c) => c.id === id)!.statuses.includes(status)))
        totals.ongoing += r._count;
      else if (OZON_CATEGORIES.find((c) => c.id === "cancelled")!.statuses.includes(status)) totals.cancelled += r._count;
      else if (OZON_CATEGORIES.find((c) => c.id === "noAnswer")!.statuses.includes(status)) totals.noAnswer += r._count;
      else totals.other += r._count;
    }
  }

  return totals;
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: { month?: string; carrier?: string };
}) {
  const { start, end, month } = monthRange(searchParams.month);
  const range = { start, end };
  const where = { createdAt: { gte: start, lt: end } };
  const carrier: CarrierFilter =
    searchParams.carrier === "forcelog" || searchParams.carrier === "ozon" ? searchParams.carrier : "all";

  const [byStatus, confirmedRevenue, topCities, carrierRows, statusTotals] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where, _count: true }),
    prisma.order.aggregate({ where: { ...where, status: "CONFIRMEE" }, _sum: { totalPrice: true } }),
    prisma.order.groupBy({ by: ["city"], where, _count: true, orderBy: { _count: { city: "desc" } }, take: 5 }),
    getCarrierStats(range),
    statusBreakdown(carrier, range),
  ]);

  const totalOrders = byStatus.reduce((sum, s) => sum + s._count, 0);
  const confirmed = byStatus.find((s) => s.status === "CONFIRMEE")?._count ?? 0;
  const confirmationRate = totalOrders > 0 ? Math.round((confirmed / totalOrders) * 100) : 0;
  const confirmedTotal = Number(confirmedRevenue._sum.totalPrice ?? 0);
  const avgBasket = confirmed > 0 ? Math.round(confirmedTotal / confirmed) : 0;

  const sales = [
    { label: "Commandes", value: formatInt(totalOrders), sub: `${totalOrders - confirmed} encore à confirmer` },
    { label: "CA confirmé", value: formatDh(confirmedTotal), sub: `${confirmed} commandes confirmées` },
    { label: "Taux de confirmation", value: `${confirmationRate} %`, sub: "Confirmées / reçues" },
    { label: "Panier moyen", value: formatDh(avgBasket), sub: "Sur les commandes confirmées" },
  ];

  const visibleCarrierRows = carrier === "all" ? carrierRows : carrierRows.filter((r) => r.id === carrier);
  const statusEntries = STATUS_BUCKETS.map((b) => ({ id: b, label: STATUS_LABELS[b], value: statusTotals[b] })).filter(
    (s) => s.value > 0
  );
  const statusMax = Math.max(1, ...statusEntries.map((s) => s.value));
  const cityMax = Math.max(1, ...topCities.map((c) => c._count));

  const carrierLabel = carrier === "all" ? "Tous transporteurs" : carrier === "forcelog" ? "Forcelog" : "Ozon Express";
  const statusTotal = statusEntries.reduce((sum, e) => sum + e.value, 0);

  return (
    <>
      <PageHeader
        title="Statistiques"
        subtitle={monthLabel(month)}
        actions={<MonthFilter month={month} action="/stats" />}
      />

      <Segmented
        label="Transporteur"
        items={(["all", "forcelog", "ozon"] as const).map((c) => ({
          href: `/stats?month=${month}&carrier=${c}`,
          label: c === "all" ? "Tous" : c === "forcelog" ? "Forcelog" : "Ozon Express",
          active: carrier === c,
        }))}
      />

      <section aria-label="Ventes" className="card grid grid-cols-2 md:grid-cols-4">
        {sales.map((k, i) => (
          <div
            key={k.label}
            className={`flex flex-col gap-1 p-4 md:px-6 md:py-5 ${i % 2 === 0 ? "border-r border-line-soft" : ""} ${
              i < 2 ? "border-b border-line-soft md:border-b-0" : ""
            } ${i === 1 ? "md:border-r" : ""}`}
          >
            <span className="text-[13px] text-muted">{k.label}</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums md:text-[28px]">{k.value}</span>
            <span className="text-xs text-muted">{k.sub}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Livraison par transporteur</h2>
        <div className={`grid grid-cols-1 gap-4 ${visibleCarrierRows.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {visibleCarrierRows.map((r) => {
            const metrics: [string, string][] = [
              ["Expédiés", formatInt(r.sent)],
              ["Livrés", formatInt(r.delivered)],
              ["Retours", `${formatInt(r.returns)}${r.returnRate !== null ? ` (${r.returnRate} %)` : ""}`],
              ["Délai moyen", r.avgDelayDays !== null ? `${r.avgDelayDays.toFixed(1)} j` : "-"],
              ["Frais par colis", r.avgFee !== null ? formatDh(r.avgFee) : "-"],
              ["Encaissé", r.cashIn !== null ? formatDh(r.cashIn) : "-"],
            ];
            return (
              <article key={r.id} className="card flex flex-col gap-5 p-4 md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-semibold">{r.name}</h3>
                  <div className="text-right">
                    <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
                      {r.deliveryRate !== null ? `${r.deliveryRate} %` : "-"}
                    </div>
                    <div className="mt-1 text-xs text-muted">taux de livraison</div>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-soft pt-4 text-sm sm:grid-cols-3">
                  {metrics.map(([label, value]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="card flex flex-col gap-4 p-4 md:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Statut des colis</h2>
            <span className="text-xs text-muted">
              {carrierLabel}, {formatInt(statusTotal)} colis
            </span>
          </div>
          {statusEntries.length === 0 && <p className="text-sm text-muted">Aucun colis ce mois-ci.</p>}
          {statusEntries.map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-body">{s.label}</span>
                <span className="font-semibold tabular-nums">{formatInt(s.value)}</span>
              </div>
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${Math.max(2, (s.value / statusMax) * 100)}%`, background: STATUS_COLORS[s.id] }}
              />
            </div>
          ))}
        </section>

        <section className="card flex flex-col gap-4 p-4 md:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Top villes</h2>
            <span className="text-xs text-muted">Commandes du mois</span>
          </div>
          {topCities.length === 0 && <p className="text-sm text-muted">Aucune commande.</p>}
          {topCities.map((c) => (
            <div key={c.city} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-body">{c.city}</span>
                <span className="font-semibold tabular-nums">{formatInt(c._count)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-ink" style={{ width: `${Math.max(2, (c._count / cityMax) * 100)}%` }} />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
