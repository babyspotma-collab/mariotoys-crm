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
  const [parcels, counts] = await Promise.all([
    prisma.parcel.findMany({
      where: { carrier: "FORCELOG", statusCode: { in: CATEGORY.codes } },
      include: { order: true },
      orderBy: { carrierCreatedAt: "desc" },
    }),
    getParcelCategoryCounts(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <ParcelsSubNav active="noAnswer" counts={counts} />

      {parcels.length === 0 && (
        <p className="text-sm text-muted">Aucun colis sans réponse pour l&apos;instant.</p>
      )}

      <div className="flex flex-col gap-2">
        {parcels.map((parcel) => (
          <div key={parcel.id} className="bg-white border border-line rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <a
                href={`/parcels/forcelog/${encodeURIComponent(parcel.code)}`}
                className="hover:opacity-70 transition-opacity"
              >
                <p className="text-sm font-medium">
                  {parcel.order ? `#${parcel.order.orderNumber} — ` : ""}
                  {parcel.receiver}
                </p>
                <p className="text-xs text-muted">
                  {parcel.cityName} · <span className="font-mono">{parcel.code}</span>
                </p>
              </a>
              <div className="text-right">
                <span className="badge bg-slate/20 text-slate">{parcel.status}</span>
                <div className="mt-2">
                  <RelaunchButton code={parcel.code} action={relaunch} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
