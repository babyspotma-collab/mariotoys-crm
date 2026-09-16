import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getParcels, getTracking, type ParcelSummary } from "@/lib/forcelog";

// Forcelog n'a pas de webhooks : ce statut est synchronisé par appel
// périodique à cet endpoint. Déclenché par GitHub Actions toutes les 2h
// (.github/workflows/sync-tracking.yml) plutôt que par le cron natif
// Vercel, limité à 1x/jour sur le plan Hobby. Protégé par CRON_SECRET,
// envoyé en Authorization: Bearer <secret> — peu importe l'appelant, la
// vérification est la même.
//
// IMPORTANT : GetParcel (lookup par code unique) échoue systématiquement
// côté Forcelog en pratique ("Parcel code Not Found", vérifié sur un
// échantillon de 20 colis réels — pas juste occasionnel). On synchronise
// donc via GetParcels (liste), qui fonctionne, mais dont la pagination
// est cassée (PAGE ignoré) : chaque appel ne renvoie qu'un sous-ensemble
// d'une vingtaine de colis, qui varie selon les paramètres de date/limite
// passés, de façon non garantie. On multiplie les appels avec des
// paramètres différents par run pour maximiser la couverture, et on ne
// touche qu'aux commandes dont le code apparaît dans au moins un des
// résultats — les autres restent inchangées (pas de faux "échec" pour
// une commande simplement pas tombée dans l'échantillon de ce run).
const SAMPLE_QUERIES: { limit: number; dateFrom?: string; dateTo?: string }[] = [
  { limit: 20 },
  { limit: 20, dateFrom: "2025-01-01", dateTo: "2026-12-31" },
  { limit: 100, dateFrom: "2026-01-01", dateTo: "2026-12-31" },
  { limit: 100, dateFrom: "2025-01-01", dateTo: "2025-12-31" },
];

async function collectKnownParcels(): Promise<{ byCode: Map<string, ParcelSummary>; callsFailed: number }> {
  const byCode = new Map<string, ParcelSummary>();
  const results = await Promise.allSettled(
    SAMPLE_QUERIES.map((q) => getParcels({ limit: q.limit, dateFrom: q.dateFrom, dateTo: q.dateTo }))
  );

  let callsFailed = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      callsFailed++;
      continue;
    }
    for (const parcel of result.value.parcels) {
      if (parcel.code) byCode.set(parcel.code, parcel);
    }
  }
  return { byCode, callsFailed };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { status: "CONFIRMEE", forcelogCode: { not: null } },
    });

    const { byCode, callsFailed } = await collectKnownParcels();
    const allCallsFailed = callsFailed === SAMPLE_QUERIES.length;

    let matched = 0;
    let unmatched = 0;

    await Promise.all(
      orders.map(async (order) => {
        const code = order.forcelogCode!;
        const parcel = byCode.get(code);

        if (!parcel) {
          unmatched++;
          // Vu dans aucun des échantillons de ce run : on ne sait pas si
          // Forcelog a un souci ou si on n'est simplement pas tombé
          // dessus. On n'incrémente le compteur d'échec QUE si tous les
          // appels GetParcels ont eux-mêmes échoué (vrai échec de sync).
          if (allCallsFailed) {
            await prisma.order.update({
              where: { id: order.id },
              data: { forcelogSyncFailCount: { increment: 1 }, forcelogSyncedAt: new Date() },
            });
          }
          return;
        }

        matched++;
        const statusChanged = parcel.statusCode !== order.forcelogStatusCode;

        // GetTracking reste tenté par colis (best effort) pour
        // l'historique affiché sur la fiche détail — son échec (fréquent,
        // même bug connu que GetParcel) ne doit pas affecter le statut
        // principal ni le compteur d'échec, qui reposent uniquement sur
        // GetParcels ci-dessus.
        let history: unknown = order.forcelogTrackingHistory ?? undefined;
        try {
          const tracking = await getTracking(code);
          history = tracking["GET-TRACKING"]?.HISTORY ?? history;
        } catch {
          // ignoré, on garde l'historique précédent
        }

        await prisma.order.update({
          where: { id: order.id },
          data: {
            forcelogStatus: parcel.status,
            forcelogStatusCode: parcel.statusCode,
            forcelogTrackingHistory: history as any,
            forcelogSyncedAt: new Date(),
            forcelogStatusChangedAt: statusChanged ? new Date() : order.forcelogStatusChangedAt,
            forcelogSyncFailCount: 0,
          },
        });
      })
    );

    return NextResponse.json({ total: orders.length, matched, unmatched, callsFailed });
  } catch (err) {
    console.error("sync-tracking error:", err);
    return NextResponse.json({ error: "Échec de synchronisation" }, { status: 500 });
  }
}
