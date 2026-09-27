import { prisma } from "@/lib/db";
import { getTracking } from "@/lib/forcelog";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { formatDh } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ParcelDetailPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);

  // Les détails viennent de Parcel (synchronisé toutes les 2h) plutôt que
  // de GetParcel (API publique) : ce dernier échoue quasi systématiquement
  // en pratique ("Parcel code Not Found", vérifié sur un échantillon de 20
  // colis réels) — voir lib/forcelog.ts.
  const parcel = await prisma.parcel.findUnique({
    where: { carrier_code: { carrier: "FORCELOG", code } },
  });

  let history: Array<{ STATUS?: unknown; DATE?: unknown }> = [];
  let trackingError: string | null = null;
  try {
    const raw = await getTracking(code);
    history = raw["GET-TRACKING"]?.HISTORY ?? [];
  } catch (err) {
    trackingError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-2 text-xs text-muted">
        <a href="/parcels?carrier=forcelog" className="no-underline hover:underline">← Retour aux colis</a>
      </p>
      <h1 className="mb-1 font-mono text-xl font-semibold">{code}</h1>

      <div className="mb-8 mt-4 flex gap-2">
        <a href={`/parcels/forcelog/${encodeURIComponent(code)}/return`} className="btn-danger">
          Demander un retour
        </a>
        <a href={`/parcels/forcelog/${encodeURIComponent(code)}/claim`} className="btn-primary">
          Réclamation
        </a>
      </div>

      <section className="card mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold">Détails du colis</h2>
        {!parcel ? (
          <p className="text-sm text-accent">
            Pas encore synchronisé — réessayez après le prochain passage du sync (toutes les 2h).
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Destinataire</dt>
            <dd>{parcel.receiver || "—"}</dd>
            <dt className="text-muted">Téléphone</dt>
            <dd>{parcel.phone ? normalizeMoroccanPhone(parcel.phone) : "—"}</dd>
            <dt className="text-muted">Ville</dt>
            <dd>{parcel.cityName || "—"}</dd>
            <dt className="text-muted">Montant COD</dt>
            <dd>{formatDh(parcel.price)}</dd>
            <dt className="text-muted">Statut</dt>
            <dd>{parcel.status || "—"}</dd>
          </dl>
        )}
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-sm font-semibold">Historique de suivi</h2>
        {trackingError ? (
          <p className="text-sm text-accent">Indisponible pour l&apos;instant : {trackingError}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted">Aucun événement pour l&apos;instant.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {history.map((event, i) => (
              <li key={i} className="border-l-2 border-line pl-3 text-sm">
                <p className="font-medium">{String((event as any).STATUS ?? (event as any).status ?? "—")}</p>
                <p className="text-xs text-muted">
                  {String((event as any).DATE ?? (event as any).date ?? (event as any).CREATION_TIME ?? "")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
