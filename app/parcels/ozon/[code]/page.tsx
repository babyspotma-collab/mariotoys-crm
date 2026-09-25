import { getParcelInfo, getTracking } from "@/lib/ozon";
import { normalizeMoroccanPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default async function OzonParcelDetailPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);

  let parcel: Awaited<ReturnType<typeof getParcelInfo>> = null;
  let parcelError: string | null = null;
  try {
    parcel = await getParcelInfo(code);
  } catch (err) {
    parcelError = err instanceof Error ? err.message : String(err);
  }

  let tracking: Awaited<ReturnType<typeof getTracking>> | null = null;
  let trackingError: string | null = null;
  try {
    tracking = await getTracking(code);
  } catch (err) {
    trackingError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <p className="text-xs text-muted mb-2">
        <a href="/parcels/ozon">← Retour aux colis</a>
      </p>
      <h1 className="text-xl font-semibold mb-8 font-mono">{code}</h1>

      <section className="bg-white border border-line rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Détails du colis</h2>
        {parcelError || !parcel ? (
          <p className="text-sm text-danger">
            Indisponible pour l&apos;instant : {parcelError ?? "colis introuvable"}
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Destinataire</dt>
            <dd>{parcel.receiver || "—"}</dd>
            <dt className="text-muted">Téléphone</dt>
            <dd>{parcel.phone ? normalizeMoroccanPhone(parcel.phone) : "—"}</dd>
            <dt className="text-muted">Ville</dt>
            <dd>{parcel.cityName || "—"}</dd>
            <dt className="text-muted">Adresse</dt>
            <dd>{parcel.address || "—"}</dd>
            <dt className="text-muted">Montant COD</dt>
            <dd>{parcel.price} DH</dd>
          </dl>
        )}
      </section>

      <section className="bg-white border border-line rounded-2xl p-6">
        <h2 className="text-sm font-semibold mb-4">Historique de suivi</h2>
        {trackingError ? (
          <p className="text-sm text-danger">Indisponible pour l&apos;instant : {trackingError}</p>
        ) : !tracking || tracking.history.length === 0 ? (
          <p className="text-sm text-muted">Aucun événement pour l&apos;instant.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {tracking.history.map((event, i) => (
              <li key={i} className="text-sm border-l-2 border-line pl-3">
                <p className="font-medium">{event.status}</p>
                <p className="text-xs text-muted">{event.timeStr}</p>
                {event.comment && <p className="text-xs text-muted mt-1">{event.comment}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
