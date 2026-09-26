import type { Parcel, Order } from "@prisma/client";

type ParcelWithOrder = Parcel & { order: Order | null };

export default function OzonParcelList({
  parcels,
  emptyMessage,
}: {
  parcels: ParcelWithOrder[];
  emptyMessage: string;
}) {
  if (parcels.length === 0) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {parcels.map((parcel) => (
        <a
          key={parcel.id}
          href={`/parcels/ozon/${encodeURIComponent(parcel.code)}`}
          className="block bg-white border border-line rounded-2xl p-4 hover:border-sage-dark transition-colors"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {parcel.order ? `#${parcel.order.orderNumber} — ` : ""}
                {parcel.receiver}
              </p>
              <p className="text-xs text-muted">
                {parcel.cityName} · <span className="font-mono">{parcel.code}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="badge bg-slate/20 text-slate">{parcel.status || "Statut inconnu"}</span>
              <p className="text-sm font-semibold mt-1">{Number(parcel.price)} DH</p>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
