import { prisma } from "@/lib/db";
import { getTracking } from "@/lib/ozon";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { formatDh } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OzonParcelDetailPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);

  const parcel = await prisma.parcel.findUnique({
    where: { carrier_code: { carrier: "OZON", code } },
  });

  let tracking: Awaited<ReturnType<typeof getTracking>> | null = null;
  let trackingError: string | null = null;
  try {
    tracking = await getTracking(code);
  } catch (err) {
    trackingError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-2 text-xs text-muted">
        <a href="/parcels?carrier=ozon" className="no-underline hover:underline">← Retour aux colis</a>
      </p>
      <h1 className="mb-8 font-mono text-xl font-semibold">{code}</h1>

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
        ) : !tracking || tracking.history.length === 0 ? (
          <p className="text-sm text-muted">Aucun événement pour l&apos;instant.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {tracking.history.map((event, i) => (
              <li key={i} className="border-l-2 border-line pl-3 text-sm">
                <p className="font-medium">{event.status}</p>
                <p className="text-xs text-muted">{event.timeStr}</p>
                {event.comment && <p className="mt-1 text-xs text-muted">{event.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
