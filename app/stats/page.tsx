import { prisma } from "@/lib/db";
import MonthFilter from "@/components/MonthFilter";
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

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold tracking-tight">Statistiques</h1>
          <p className="text-sm text-muted">Ventes et livraisons, par transporteur</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthFilter month={month} action="/stats" />
          <div role="group" aria-label="Transporteur" className="inline-flex gap-0.5 rounded-[10px] bg-segment p-[3px]">
            {(["all", "forcelog", "ozon"] as const).map((c) => (
              <a
                key={c}
                href={`/stats?month=${month}&carrier=${c}`}
                aria-pressed={carrier === c}
                className={`flex h-8 items-center rounded-lg px-4 text-[13px] no-underline ${
                  carrier === c ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-body"
                }`}
              >
                {c === "all" ? "Tous" : c === "forcelog" ? "Forcelog" : "Ozon Express"}
              </a>
            ))}
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-3.5">
        <h2 className="text-[15px] font-semibold">Ventes — {monthLabel(month)}</h2>
        <div className="grid grid-cols-4 gap-4">
          {sales.map((k) => (
            <div key={k.label} className="card flex flex-col gap-2 p-5">
              <div className="text-[13px] text-muted">{k.label}</div>
              <div className="text-[28px] font-semibold tracking-tight">{k.value}</div>
              <div className="text-xs text-muted">{k.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <h2 className="text-[15px] font-semibold">Livraison par transporteur</h2>
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1.3fr)_repeat(8,minmax(0,1fr))] items-center gap-2 border-b border-line-soft px-5 text-[12px] font-medium uppercase tracking-wide text-muted h-11">
            <div>Transporteur</div>
            <div className="text-right">Expédiés</div>
            <div className="text-right">Livrés</div>
            <div className="text-right">Taux livr.</div>
            <div className="text-right">Retours</div>
            <div className="text-right">Taux retour</div>
            <div className="text-right">Délai moy.</div>
            <div className="text-right">Frais / colis</div>
            <div className="text-right">Encaissé</div>
          </div>
          {visibleCarrierRows.map((r) => (
            <div
              key={r.id}
              className="grid min-h-[60px] grid-cols-[minmax(0,1.3fr)_repeat(8,minmax(0,1fr))] items-center gap-2 border-b border-line-soft px-5 py-2 text-sm last:border-b-0"
            >
              <div className="flex items-center gap-2.5 font-semibold">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: r.id === "forcelog" ? "#C8381F" : "#2F5E9E" }}
                />
                {r.name}
              </div>
              <div className="text-right">{formatInt(r.sent)}</div>
              <div className="text-right">{formatInt(r.delivered)}</div>
              <div className="text-right font-semibold">{r.deliveryRate ?? "—"}{r.deliveryRate !== null ? " %" : ""}</div>
              <div className="text-right">{formatInt(r.returns)}</div>
              <div className="text-right">{r.returnRate ?? "—"}{r.returnRate !== null ? " %" : ""}</div>
              <div className="text-right text-body">{r.avgDelayDays !== null ? `${r.avgDelayDays.toFixed(1)} j` : "—"}</div>
              <div className="text-right text-body">{r.avgFee !== null ? formatDh(r.avgFee) : "—"}</div>
              <div className="text-right font-semibold">{r.cashIn !== null ? formatDh(r.cashIn) : "—"}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <section className="card flex flex-col gap-[18px] p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Statut des colis</h2>
            <span className="text-xs text-muted">
              {carrier === "all" ? "Tous transporteurs" : carrier === "forcelog" ? "Forcelog" : "Ozon Express"} ·{" "}
              {statusEntries.reduce((s, e) => s + e.value, 0)} colis
            </span>
          </div>
          {statusEntries.length === 0 && <p className="text-sm text-muted">Aucun colis ce mois-ci.</p>}
          {statusEntries.map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-body">{s.label}</span>
                <span className="font-semibold">{formatInt(s.value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-cream-dark">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${(s.value / statusMax) * 100}%`, background: STATUS_COLORS[s.id] }}
                />
              </div>
            </div>
          ))}
        </section>

        <section className="card flex flex-col gap-[18px] p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Top villes</h2>
            <span className="text-xs text-muted">Commandes du mois</span>
          </div>
          {topCities.length === 0 && <p className="text-sm text-muted">Aucune commande.</p>}
          {topCities.map((c) => (
            <div key={c.city} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span className="text-body">{c.city}</span>
                <span className="font-semibold">{formatInt(c._count)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-cream-dark">
                <div className="h-2 rounded-full bg-ink" style={{ width: `${(c._count / cityMax) * 100}%` }} />
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
