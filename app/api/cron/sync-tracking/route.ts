import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getParcel } from "@/lib/forcelog";

// Forcelog n'a pas de webhooks : ce cron (voir vercel.json, toutes les
// 20 min) interroge leur API pour chaque commande confirmée et met à
// jour le statut connu. Protégé par CRON_SECRET (Vercel l'envoie
// automatiquement en Authorization: Bearer <secret> pour ses propres
// cron jobs quand la variable d'env est définie).
//
// NB: le nom exact du champ de statut dans la réponse GetParcel n'est
// pas garanti par la doc fournie — plusieurs variantes sont tentées.
function extractStatus(parcel: Record<string, unknown>): string | null {
  for (const key of ["STATUS", "Status", "status", "PARCEL_STATUS"]) {
    const value = parcel[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
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

    const results = await Promise.allSettled(
      orders.map(async (order) => {
        const parcel = await getParcel(order.forcelogCode!);
        const status = extractStatus(parcel);
        await prisma.order.update({
          where: { id: order.id },
          data: {
            forcelogStatus: status ?? order.forcelogStatus,
            forcelogSyncedAt: new Date(),
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
