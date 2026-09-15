import { getParcels } from "@/lib/forcelog";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";

export const dynamic = "force-dynamic";

export default async function ParcelsPage() {
  let total = 0;
  let parcels: Awaited<ReturnType<typeof getParcels>>["parcels"] = [];
  let error: string | null = null;

  try {
    const result = await getParcels({ limit: 100 });
    total = result.total;
    parcels = result.parcels;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="all" />
      <p className="text-sm text-muted mb-8">
        {total > 0 ? `${total} colis au total` : "Liste en direct depuis Forcelog."}
      </p>

      {error && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Impossible de charger les colis Forcelog : {error}
        </p>
      )}

      {!error && parcels.length === 0 && (
        <p className="text-sm text-muted">Aucun colis pour l&apos;instant.</p>
      )}

      <div className="flex flex-col gap-3">
        {parcels.map((p) => (
          <a
            key={p.code}
            href={`/parcels/${encodeURIComponent(p.code)}`}
            className="block bg-white border border-line rounded-2xl p-5 hover:border-sage-dark transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {p.orderNum} — {p.receiver}
                </p>
                <p className="text-sm text-muted">
                  {p.cityName} · {p.address}
                </p>
                <p className="text-xs text-muted mt-1 font-mono">{p.code}</p>
              </div>
              <div className="text-right">
                <span className="badge bg-slate/20 text-slate">{p.status || "Statut inconnu"}</span>
                <p className="text-sm font-semibold mt-1">{p.price} DH</p>
                <p className="text-xs text-muted">{p.createdAt}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
