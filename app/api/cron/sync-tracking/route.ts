import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getParcel, getTracking } from "@/lib/forcelog";

// Forcelog n'a pas de webhooks : ce statut est synchronisé par appel
// périodique à cet endpoint. Déclenché par GitHub Actions toutes les 2h
// (.github/workflows/sync-tracking.yml) plutôt que par le cron natif
// Vercel, limité à 1x/jour sur le plan Hobby. Protégé par CRON_SECRET,
// envoyé en Authorization: Bearer <secret> — peu importe l'appelant, la
// vérification est la même.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { status: "CONFIRMEE", forcelogCode: { not: null } },
    });

    const results = await Promise.allSettled(
      orders.map(async (order) => {
        const code = order.forcelogCode!;
        const [parcel, tracking] = await Promise.allSettled([getParcel(code), getTracking(code)]);

        const status =
          parcel.status === "fulfilled"
            ? String(parcel.value["GET-PARCEL"]?.STATUS ?? "")
            : null;
        const history =
          tracking.status === "fulfilled" ? tracking.value["GET-TRACKING"]?.HISTORY ?? null : null;

        // "Échec" = l'appel GetParcel lui-même a levé une erreur (ex: "Parcel
        // code Not Found", observé même sur des colis valides côté Forcelog).
        // Compteur remis à 0 dès qu'un appel réussit, incrémenté sinon — sert
        // à repérer les colis "bloqués" (voir /parcels/stuck).
        const parcelFailed = parcel.status === "rejected";
        // Changement réel de statut (couvre aussi le tout premier statut connu,
        // puisque forcelogStatus démarre à null) : seul cas où on retimestampe
        // forcelogStatusChangedAt — forcelogSyncedAt, lui, bouge à chaque run.
        const statusChanged = Boolean(status) && status !== order.forcelogStatus;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            forcelogStatus: status || order.forcelogStatus,
            forcelogTrackingHistory: (history ?? order.forcelogTrackingHistory ?? undefined) as any,
            forcelogSyncedAt: new Date(),
            forcelogStatusChangedAt: statusChanged ? new Date() : order.forcelogStatusChangedAt,
            forcelogSyncFailCount: parcelFailed ? { increment: 1 } : 0,
          },
        });
      })
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    return NextResponse.json({ synced: orders.length - failed, failed });
  } catch (err) {
    console.error("sync-tracking error:", err);
    return NextResponse.json({ error: "Échec de synchronisation" }, { status: 500 });
  }
}
