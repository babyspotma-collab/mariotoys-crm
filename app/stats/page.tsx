import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import MonthFilter from "@/components/MonthFilter";
import { monthRange, monthLabel } from "@/lib/date-range";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const { start, end, month } = monthRange(searchParams.month);
  const where = { createdAt: { gte: start, lt: end } };

  const [byStatus, confirmedRevenue, topCities] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where, _count: true, _sum: { totalPrice: true } }),
    prisma.order.aggregate({
      where: { ...where, status: "CONFIRMEE" },
      _sum: { totalPrice: true },
    }),
    prisma.order.groupBy({
      by: ["city"],
      where,
      _count: true,
      orderBy: { _count: { city: "desc" } },
      take: 5,
    }),
  ]);

  const totalOrders = byStatus.reduce((sum, s) => sum + s._count, 0);
  const cancelled = byStatus.find((s) => s.status === "ANNULEE")?._count ?? 0;
  const cancelRate = totalOrders > 0 ? Math.round((cancelled / totalOrders) * 100) : 0;

  const statusLabels: Record<string, string> = {
    NOUVELLE: "Nouvelles",
    CONFIRMEE: "Confirmées",
    ANNULEE: "Annulées",
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="stats" />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <MonthFilter month={month} action="/stats" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Commandes — {monthLabel(month)}</p>
          <p className="text-2xl font-semibold">{totalOrders}</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">CA confirmé</p>
          <p className="text-2xl font-semibold">{Number(confirmedRevenue._sum.totalPrice ?? 0)} DH</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Taux d&apos;annulation</p>
          <p className="text-2xl font-semibold">{cancelRate}%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-medium mb-3">Répartition par statut</h2>
          <div className="flex flex-col gap-2">
            {byStatus.map((row) => (
              <div
                key={row.status}
                className="bg-white border border-line rounded-2xl p-4 flex items-center justify-between"
              >
                <p className="text-sm font-medium">{statusLabels[row.status] ?? row.status}</p>
                <div className="text-right">
                  <p className="text-sm font-semibold">{row._count}</p>
                  <p className="text-xs text-muted">{Number(row._sum.totalPrice ?? 0)} DH</p>
                </div>
              </div>
            ))}
            {byStatus.length === 0 && <p className="text-sm text-muted">Aucune commande.</p>}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium mb-3">Top villes</h2>
          <div className="flex flex-col gap-2">
            {topCities.map((row) => (
              <div
                key={row.city}
                className="bg-white border border-line rounded-2xl p-4 flex items-center justify-between"
              >
                <p className="text-sm font-medium">{row.city}</p>
                <p className="text-sm font-semibold">{row._count}</p>
              </div>
            ))}
            {topCities.length === 0 && <p className="text-sm text-muted">Aucune commande.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
