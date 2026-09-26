import { prisma } from "@/lib/db";
import { cancelOrder } from "./orders/actions";
import AppHeader from "@/components/AppHeader";
import MonthFilter from "@/components/MonthFilter";
import { monthRange } from "@/lib/date-range";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { getCarrierRevenue } from "@/lib/carrier-revenue";

export const dynamic = "force-dynamic";

const ORDERS_SAFETY_LIMIT = 500;

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    NOUVELLE: "bg-slate/20 text-slate",
    CONFIRMEE: "bg-sage/20 text-sage-dark",
    ANNULEE: "bg-danger/10 text-danger",
  };
  const labels: Record<string, string> = {
    NOUVELLE: "Nouvelle",
    CONFIRMEE: "Confirmée",
    ANNULEE: "Annulée",
  };
  return <span className={`badge ${styles[status] ?? ""}`}>{labels[status] ?? status}</span>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const { start, end, month } = monthRange(searchParams.month);
  const dateFilter = { createdAt: { gte: start, lt: end } };

  const [orders, counts, shopifyRevenue, forcelogStats, carrierRevenue] = await Promise.all([
    prisma.order.findMany({
      where: dateFilter,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: ORDERS_SAFETY_LIMIT,
    }),
    prisma.order.groupBy({ by: ["status"], where: dateFilter, _count: true }),
    prisma.order.aggregate({
      where: { ...dateFilter, source: "SHOPIFY" },
      _sum: { totalPrice: true },
    }),
    prisma.order.groupBy({
      by: ["forcelogStatusCode"],
      where: { ...dateFilter, forcelogCode: { not: null } },
      _count: true,
      _sum: { totalPrice: true },
    }),
    getCarrierRevenue(),
  ]);

  const countFor = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;
  const totalOrders = counts.reduce((sum, c) => sum + c._count, 0);
  const confirmationRate = totalOrders > 0 ? Math.round((countFor("CONFIRMEE") / totalOrders) * 100) : 0;

  const totalShipped = forcelogStats.reduce((sum, s) => sum + s._count, 0);
  const delivered = forcelogStats.find((s) => s.forcelogStatusCode === "DELIVERED");
  const deliveryRate = totalShipped > 0 ? Math.round(((delivered?._count ?? 0) / totalShipped) * 100) : 0;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="orders" />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <MonthFilter month={month} action="/" />
        <a href="/orders/new" className="btn-primary">
          + Nouvelle commande
        </a>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Nouvelles</p>
          <p className="text-2xl font-semibold">{countFor("NOUVELLE")}</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Confirmées</p>
          <p className="text-2xl font-semibold">{countFor("CONFIRMEE")}</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Annulées</p>
          <p className="text-2xl font-semibold">{countFor("ANNULEE")}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">CA Shopify</p>
          <p className="text-2xl font-semibold">{Number(shopifyRevenue._sum.totalPrice ?? 0)} DH</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Taux de confirmation</p>
          <p className="text-2xl font-semibold">{confirmationRate}%</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Taux de livraison Forcelog</p>
          <p className="text-2xl font-semibold">{deliveryRate}%</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">CA Forcelog (colis livrés depuis le 1er sept.)</p>
          <p className="text-2xl font-semibold">{carrierRevenue.forcelog} DH</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">CA Ozon Express (colis livrés depuis le 1er sept.)</p>
          <p className="text-2xl font-semibold">{carrierRevenue.ozon} DH</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {orders.length === 0 && (
          <p className="text-sm text-muted">Aucune commande pour ce mois.</p>
        )}

        {orders.map((order) => (
          <div key={order.id} className="bg-white border border-line rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-medium">
                  #{order.orderNumber} — {order.customerName}
                  {order.source === "MANUEL" && (
                    <span className="badge bg-slate/20 text-slate ml-2 align-middle">Manuel</span>
                  )}
                </p>
                <p className="text-sm text-muted">
                  {order.address}, {order.city} · {normalizeMoroccanPhone(order.phone)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={order.status} />
                <span className="text-sm font-semibold">{Number(order.totalPrice)} DH</span>
              </div>
            </div>

            <ul className="text-sm text-muted mb-3">
              {order.items.map((item) => (
                <li key={item.id}>
                  {item.title} × {item.quantity} — {Number(item.price)} DH
                </li>
              ))}
            </ul>

            {order.forcelogCode && (
              <p className="text-xs text-muted mb-3">
                Colis Forcelog : <span className="font-mono">{order.forcelogCode}</span>
                {order.forcelogStatus ? ` — ${order.forcelogStatus}` : ""}
              </p>
            )}

            {order.forcelogError && (
              <p className="text-xs text-danger mb-3">Erreur Forcelog : {order.forcelogError}</p>
            )}

            {order.status === "NOUVELLE" && (
              <div className="flex gap-2">
                <a href={`/orders/${order.id}/confirm`} className="btn-primary">
                  Confirmer
                </a>
                <form action={cancelOrder.bind(null, order.id)}>
                  <button type="submit" className="btn-danger">
                    Annuler
                  </button>
                </form>
              </div>
            )}

            {order.status === "NOUVELLE" && order.forcelogError && (
              <p className="text-xs text-muted mt-2">
                Le colis n&apos;a pas pu être créé — cliquez sur Confirmer pour corriger et
                réessayer.
              </p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
