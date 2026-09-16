import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import RelaunchButton from "@/components/RelaunchButton";
import { relaunch } from "./actions";

export const dynamic = "force-dynamic";

// Statut Forcelog exact "Pas de réponse" (deux STATUS_CODE partagent ce
// libellé côté Forcelog) — trouvé dans le <select id="f_statut"> réel de
// leur dashboard web, synchronisé par scripts/sync-forcelog-web.js
// (l'API publique ne permet pas de filtrer par statut de façon fiable).
const NO_ANSWER_CODES = ["NO_ANSWER", "NO_ANSWER_SMS"];

export default async function StuckPage() {
  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMEE", forcelogStatusCode: { in: NO_ANSWER_CODES } },
    orderBy: { forcelogStatusChangedAt: "desc" },
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="stuck" />

      <p className="text-sm text-muted mb-8">
        Colis dont le statut Forcelog exact est "Pas de réponse".
      </p>

      {orders.length === 0 && (
        <p className="text-sm text-muted">Aucun colis "Pas de réponse" pour l&apos;instant.</p>
      )}

      <div className="flex flex-col gap-2">
        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-white border border-line rounded-2xl p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <a
                href={`/parcels/${encodeURIComponent(order.forcelogCode!)}`}
                className="hover:opacity-70 transition-opacity"
              >
                <p className="text-sm font-medium">
                  #{order.orderNumber} — {order.customerName}
                </p>
                <p className="text-xs text-muted">
                  {order.city} · <span className="font-mono">{order.forcelogCode}</span>
                </p>
              </a>
              <div className="text-right">
                <span className="badge bg-slate/20 text-slate">{order.forcelogStatus}</span>
                <div className="mt-2">
                  <RelaunchButton code={order.forcelogCode!} action={relaunch} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
