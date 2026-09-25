import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import ParcelsSubNav from "@/components/ParcelsSubNav";
import RelaunchButton from "@/components/RelaunchButton";
import { categoryById } from "@/lib/parcel-categories";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";
import { relaunch } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORY = categoryById("noAnswer");

export default async function NoAnswerPage() {
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: { status: "CONFIRMEE", forcelogStatusCode: { in: CATEGORY.codes } },
      orderBy: { forcelogStatusChangedAt: "desc" },
    }),
    getParcelCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="noAnswer" counts={counts} />

      {orders.length === 0 && (
        <p className="text-sm text-muted">Aucun colis sans réponse pour l&apos;instant.</p>
      )}

      <div className="flex flex-col gap-2">
        {orders.map((order) => (
          <div key={order.id} className="bg-white border border-line rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <a
                href={`/parcels/forcelog/${encodeURIComponent(order.forcelogCode!)}`}
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
