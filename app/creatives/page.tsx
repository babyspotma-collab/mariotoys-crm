import { prisma } from "@/lib/db";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import Pill, { type PillTone } from "@/components/Pill";
import WorkerBanner from "@/components/WorkerBanner";
import { formatDateTimeMa } from "@/lib/format";
import { getWorkerStatus } from "@/lib/creatives";
import CreativeForm from "./CreativeForm";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, { tone: PillTone; label: string }> = {
  EN_ATTENTE: { tone: "gray", label: "En attente" },
  EN_COURS: { tone: "blue", label: "En cours" },
  TERMINEE: { tone: "green", label: "Terminée" },
  PARTIELLE: { tone: "amber", label: "Partielle" },
  ECHEC: { tone: "red", label: "Échec" },
};

export default async function CreativesPage() {
  const [requests, worker] = await Promise.all([
    prisma.creativeRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { images: { select: { status: true } } },
    }),
    getWorkerStatus(),
  ]);

  return (
    <>
      <PageHeader
        title="Créatives"
        subtitle="Déposez une photo produit : 5 publicités marketing sont générées avec Gemini."
      />

      <WorkerBanner initial={worker} />

      <CreativeForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Demandes récentes</h2>

        {requests.length === 0 ? (
          <EmptyState title="Aucune créative pour l'instant">Les demandes apparaîtront ici.</EmptyState>
        ) : (
          <ul className="card divide-y divide-line-soft">
            {requests.map((r) => {
              const pill = STATUS_PILL[r.status] ?? { tone: "gray" as const, label: r.status };
              const counted = r.images.filter((i) => i.status !== "IGNOREE");
              const done = counted.filter((i) => i.status === "TERMINEE").length;
              return (
                <li key={r.id}>
                  <a href={`/creatives/${r.id}`} className="flex gap-3.5 p-4 no-underline hover:bg-cream md:items-center md:gap-5 md:px-5">
                    <img
                      src={r.sourcePhotoUrl}
                      alt=""
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-[10px] border border-line-soft bg-cream object-cover md:h-[60px] md:w-[60px]"
                    />
                    <div className="flex min-w-0 flex-grow flex-col gap-1">
                      <div className="truncate text-sm font-medium">{r.productName}</div>
                      <div className="text-[13px] tabular-nums text-muted">
                        {done}/{counted.length} images · {formatDateTimeMa(r.createdAt)}
                      </div>
                    </div>
                    <div className="shrink-0 self-center">
                      <Pill tone={pill.tone}>{pill.label}</Pill>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
