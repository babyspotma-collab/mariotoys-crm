import { getParcel, getTracking } from "@/lib/forcelog";
import { normalizeMoroccanPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default async function ParcelDetailPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code);

  let parcel: Record<string, unknown> | null = null;
  let parcelError: string | null = null;
  try {
    const raw = await getParcel(code);
    parcel = raw["GET-PARCEL"];
  } catch (err) {
    parcelError = err instanceof Error ? err.message : String(err);
  }

  let history: Array<Record<string, unknown>> = [];
  let trackingError: string | null = null;
  try {
    const raw = await getTracking(code);
    history = raw["GET-TRACKING"]?.HISTORY ?? [];
  } catch (err) {
    trackingError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <p className="text-xs text-muted mb-2">
        <a href="/parcels/forcelog">← Retour aux colis</a>
      </p>
      <h1 className="text-xl font-semibold mb-1 font-mono">{code}</h1>

      <div className="flex gap-2 mb-8">
        <a href={`/parcels/forcelog/${encodeURIComponent(code)}/return`} className="btn-danger">
          Demander un retour
        </a>
        <a href={`/parcels/forcelog/${encodeURIComponent(code)}/claim`} className="btn-primary">
          Réclamation
        </a>
      </div>

      <section className="bg-white border border-line rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Détails du colis</h2>
        {parcelError ? (
          <p className="text-sm text-danger">
            Indisponible pour l&apos;instant : {parcelError}
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Destinataire</dt>
            <dd>{String(parcel?.RECEIVER ?? "—")}</dd>
            <dt className="text-muted">Téléphone</dt>
            <dd>{parcel?.PHONE ? normalizeMoroccanPhone(String(parcel.PHONE)) : "—"}</dd>
            <dt className="text-muted">Ville</dt>
            <dd>{String(parcel?.CITY_NAME ?? "—")}</dd>
            <dt className="text-muted">Adresse</dt>
            <dd>{String(parcel?.ADDRESS ?? "—")}</dd>
            <dt className="text-muted">Montant COD</dt>
            <dd>{String(parcel?.PRICE ?? "—")} DH</dd>
            <dt className="text-muted">Statut</dt>
            <dd>{String(parcel?.STATUS ?? "—")}</dd>
            <dt className="text-muted">Situation</dt>
            <dd>{String(parcel?.SITUATION ?? "—")}</dd>
          </dl>
        )}
      </section>

      <section className="bg-white border border-line rounded-2xl p-6">
        <h2 className="text-sm font-semibold mb-4">Historique de suivi</h2>
        {trackingError ? (
          <p className="text-sm text-danger">Indisponible pour l&apos;instant : {trackingError}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted">Aucun événement pour l&apos;instant.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {history.map((event, i) => (
              <li key={i} className="text-sm border-l-2 border-line pl-3">
                <p className="font-medium">{String(event.STATUS ?? event.status ?? "—")}</p>
                <p className="text-xs text-muted">
                  {String(event.DATE ?? event.date ?? event.CREATION_TIME ?? "")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
