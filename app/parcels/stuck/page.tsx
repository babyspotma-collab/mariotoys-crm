import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import RelaunchButton from "@/components/RelaunchButton";
import { relaunch } from "./actions";

export const dynamic = "force-dynamic";

// Un colis est considéré "bloqué" si son statut Forcelog n'a pas changé
// depuis N jours (forcelogStatusChangedAt, distinct de forcelogSyncedAt qui
// bouge à chaque tentative de sync, réussie ou non — voir sync-tracking),
// ou si les tentatives de sync échouent de façon répétée.
const STUCK_AFTER_DAYS = 3;
const STUCK_AFTER_FAILS = 3;

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function StuckPage() {
  const threshold = new Date(Date.now() - STUCK_AFTER_DAYS * 24 * 60 * 60 * 1000);

  const stuckOrders = await prisma.order.findMany({
    where: {
      status: "CONFIRMEE",
      forcelogCode: { not: null },
      OR: [
        { forcelogStatusChangedAt: null },
        { forcelogStatusChangedAt: { lt: threshold } },
        { forcelogSyncFailCount: { gte: STUCK_AFTER_FAILS } },
      ],
    },
    orderBy: { forcelogStatusChangedAt: "asc" },
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="stuck" />

      <p className="text-sm text-muted mb-8">
        Statut inchangé depuis plus de {STUCK_AFTER_DAYS} jours, ou au moins{" "}
        {STUCK_AFTER_FAILS} échecs de synchronisation consécutifs.
      </p>

      {stuckOrders.length === 0 && (
        <p className="text-sm text-muted">Aucun colis bloqué pour l&apos;instant.</p>
      )}

      <div className="flex flex-col gap-2">
        {stuckOrders.map((order) => (
          <a
            key={order.id}
            href={`/parcels/${encodeURIComponent(order.forcelogCode!)}`}
            className="block bg-white border border-line rounded-2xl p-4 hover:border-sage-dark transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  #{order.orderNumber} — {order.customerName}
                </p>
                <p className="text-xs text-muted">
                  {order.city} · <span className="font-mono">{order.forcelogCode}</span>
                </p>
              </div>
              <div className="text-right">
                <span className="badge bg-slate/20 text-slate">
                  {order.forcelogStatus || "Statut inconnu"}
                </span>
                <p className="text-xs text-muted mt-1">
                  {order.forcelogStatusChangedAt
                    ? `Inchangé depuis ${daysSince(order.forcelogStatusChangedAt)} j.`
                    : "Statut jamais confirmé"}
                </p>
                {order.forcelogSyncFailCount >= STUCK_AFTER_FAILS && (
                  <p className="text-xs text-danger mt-0.5">
                    {order.forcelogSyncFailCount} échecs de sync
                  </p>
                )}
                <div className="mt-2">
                  <RelaunchButton code={order.forcelogCode!} action={relaunch} />
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
