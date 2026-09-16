import type { Order } from "@prisma/client";

export default function OrderParcelList({
  orders,
  emptyMessage,
}: {
  orders: Order[];
  emptyMessage: string;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {orders.map((order) => (
        <a
          key={order.id}
          href={`/parcels/${encodeURIComponent(order.forcelogCode!)}`}
          className="block bg-white border border-line rounded-2xl p-4 hover:border-sage-dark transition-colors"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                #{order.orderNumber} — {order.customerName}
              </p>
              <p className="text-xs text-muted">
                {order.city} · <span className="font-mono">{order.forcelogCode}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="badge bg-slate/20 text-slate">
                {order.forcelogStatus || "Statut inconnu"}
              </span>
              <p className="text-sm font-semibold mt-1">{Number(order.totalPrice)} DH</p>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
