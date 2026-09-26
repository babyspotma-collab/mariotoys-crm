import { prisma } from "@/lib/db";
import { getTracking } from "@/lib/forcelog";
import { normalizeMoroccanPhone } from "@/lib/phone";

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
        {!parcel ? (
          <p className="text-sm text-danger">
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
            <dd>{Number(parcel.price)} DH</dd>
            <dt className="text-muted">Statut</dt>
            <dd>{parcel.status || "—"}</dd>
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
                <p className="font-medium">{String((event as any).STATUS ?? (event as any).status ?? "—")}</p>
                <p className="text-xs text-muted">
                  {String((event as any).DATE ?? (event as any).date ?? (event as any).CREATION_TIME ?? "")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
