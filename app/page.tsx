import { prisma } from "@/lib/db";
import { logout } from "./actions";
import { cancelOrder } from "./orders/actions";

export const dynamic = "force-dynamic";

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

export default async function DashboardPage() {
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
  ]);

  const countFor = (status: string) => counts.find((c) => c.status === status)?._count ?? 0;

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold">Mediva CRM — Commandes</h1>
        <div className="flex items-center gap-4">
          <a href="/parcels" className="text-sm text-muted hover:text-ink">
            Suivi Forcelog
          </a>
          <a href="/products/new" className="text-sm text-muted hover:text-ink">
            + Nouveau produit
          </a>
          <a href="/orders/new" className="btn-primary">
            + Nouvelle commande
          </a>
          <form action={logout}>
            <button className="text-sm text-muted hover:text-ink">Se déconnecter</button>
          </form>
        </div>
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

      <div className="flex flex-col gap-4">
        {orders.length === 0 && (
          <p className="text-sm text-muted">Aucune commande pour l&apos;instant.</p>
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
                  {order.address}, {order.city} · {order.phone}
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
