import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import MonthFilter from "@/components/MonthFilter";
import { monthRange, monthLabel } from "@/lib/date-range";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const { start, end, month } = monthRange(searchParams.month);

  const [totalCod, byStatus] = await Promise.all([
    prisma.order.aggregate({
      where: { status: "CONFIRMEE", createdAt: { gte: start, lt: end } },
      _sum: { totalPrice: true },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["forcelogStatus"],
      where: { status: "CONFIRMEE", createdAt: { gte: start, lt: end } },
      _sum: { totalPrice: true },
      _count: true,
      orderBy: { _count: { forcelogStatus: "desc" } },
    }),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="billing" />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <MonthFilter month={month} action="/billing" />
      </div>

      <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-8">
        Estimation calculée à partir des statuts Forcelog connus localement —
        ce n&apos;est pas un relevé de paiement officiel Forcelog (aucun
        endpoint de ce type n&apos;est disponible dans leur API).
      </p>

      <div className="bg-white border border-line rounded-2xl p-6 mb-8">
        <p className="text-xs text-muted mb-1">
          Total COD en cours — {monthLabel(month)}
        </p>
        <p className="text-3xl font-semibold">
          {Number(totalCod._sum.totalPrice ?? 0)} DH
        </p>
        <p className="text-xs text-muted mt-1">
          {totalCod._count} commande{totalCod._count > 1 ? "s" : ""} confirmée
          {totalCod._count > 1 ? "s" : ""}
        </p>
      </div>

      <h2 className="text-sm font-medium mb-3">Répartition par statut Forcelog</h2>
      {byStatus.length === 0 && (
        <p className="text-sm text-muted">Aucune commande confirmée pour ce mois.</p>
      )}
      <div className="flex flex-col gap-2">
        {byStatus.map((row) => (
          <div
            key={row.forcelogStatus ?? "inconnu"}
            className="bg-white border border-line rounded-2xl p-4 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">{row.forcelogStatus || "Statut inconnu"}</p>
              <p className="text-xs text-muted">
                {row._count} commande{row._count > 1 ? "s" : ""}
              </p>
            </div>
            <p className="text-sm font-semibold">{Number(row._sum.totalPrice ?? 0)} DH</p>
          </div>
        ))}
      </div>
    </main>
  );
}
