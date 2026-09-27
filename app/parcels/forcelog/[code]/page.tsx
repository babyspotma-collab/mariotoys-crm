import { prisma } from "@/lib/db";
import { getTracking } from "@/lib/forcelog";
import ParcelView from "@/components/ParcelView";

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

  const base = `/parcels/forcelog/${encodeURIComponent(code)}`;

  return (
    <ParcelView
      carrier="forcelog"
      code={code}
      parcel={parcel}
      trackingError={trackingError}
      history={history.map((event) => ({
        status: String((event as any).STATUS ?? (event as any).status ?? "-"),
        time: String((event as any).DATE ?? (event as any).date ?? (event as any).CREATION_TIME ?? ""),
      }))}
      actions={
        <>
          <a href={`${base}/claim`} className="btn-secondary">
            Réclamation
          </a>
          <a href={`${base}/return`} className="btn-secondary">
            Demander un retour
          </a>
        </>
      }
    />
  );
}
