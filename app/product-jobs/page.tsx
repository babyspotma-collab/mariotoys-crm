import { prisma } from "@/lib/db";
import { ArrowClockwise, ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import Pill, { type PillTone } from "@/components/Pill";
import AutoRefresh from "@/components/AutoRefresh";
import WorkerIndicator, { STEP_LABELS } from "@/components/WorkerIndicator";
import { fixUtf8Filename } from "@/lib/filename";
import { STUCK_AFTER_MS } from "@/lib/product-jobs";
import { retryJob } from "./actions";
import UploadPhotosForm from "./UploadPhotosForm";
import { formatDh } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, { tone: PillTone; label: string }> = {
  EN_ATTENTE: { tone: "gray", label: "En attente" },
  EN_COURS: { tone: "blue", label: "En cours" },
  CREE: { tone: "green", label: "Créé en brouillon" },
  CREE_A_COMPLETER: { tone: "amber", label: "À compléter" },
  ERREUR: { tone: "red", label: "Erreur" },
};

export default async function ProductJobsPage() {
  const jobs = await prisma.productJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Création produits"
        subtitle="Déposez vos photos : prix et référence sont lus sur l'image, la fiche est créée en brouillon sur Shopify."
      />

      <WorkerIndicator />
      {/* État du worker et avancement des jobs rafraîchis toutes les 15 s */}
      <AutoRefresh seconds={15} />

      <UploadPhotosForm />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:justify-between">
          <h2 className="text-[15px] font-semibold">Traitements récents</h2>
          <span className="text-xs text-muted">Le PC doit être allumé pour que le traitement avance</span>
        </div>

        {jobs.length === 0 ? (
          <EmptyState title="Aucun traitement pour l'instant">Les photos envoyées apparaîtront ici.</EmptyState>
        ) : (
          <ul className="card divide-y divide-line-soft">
            {jobs.map((job) => {
              const base = STATUS_PILL[job.status] ?? { tone: "gray" as const, label: job.status };
              // En cours : on affiche l'étape envoyée par le worker.
              const pill =
                job.status === "EN_COURS" && job.step && STEP_LABELS[job.step]
                  ? { tone: base.tone, label: `En cours : ${STEP_LABELS[job.step]}` }
                  : base;
              const filename = fixUtf8Filename(job.originalFilename);
              // Relancer : job en erreur, ou bloqué "En cours" (worker arrêté en route).
              const canRetry =
                job.status === "ERREUR" ||
                (job.status === "EN_COURS" && !!job.claimedAt && Date.now() - job.claimedAt.getTime() > STUCK_AFTER_MS);
              const retry = canRetry && (
                <form action={retryJob.bind(null, job.id)}>
                  <button type="submit" className="btn-secondary h-9 px-3 text-[13px] md:h-8">
                    <ArrowClockwise size={14} aria-hidden="true" />
                    Relancer
                  </button>
                </form>
              );
              const meta =
                job.status === "ERREUR"
                  ? job.errorMessage ?? "Erreur inconnue"
                  : job.cost
                    ? `Coût ${formatDh(job.cost)}, vente ${formatDh(job.sellPrice)}${job.sku ? ` · SKU ${job.sku}` : ""}`
                    : job.status === "CREE_A_COMPLETER"
                      ? `Prix et SKU introuvables sur la photo${job.missingFields.length ? ` (${job.missingFields.join(", ")})` : ""}`
                      : "En attente de traitement par le worker";
              const images = Array.isArray(job.generatedImageUrls) ? (job.generatedImageUrls as string[]) : [];
              const thumb = images[0] ?? job.originalPhotoUrl;

              return (
                <li key={job.id} className="flex gap-3.5 p-4 md:items-center md:gap-5 md:px-5">
                  <img
                    src={thumb}
                    alt={filename}
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-[10px] border border-line-soft bg-cream object-cover md:h-[60px] md:w-[60px]"
                  />
                  <div className="flex min-w-0 flex-grow flex-col gap-1">
                    <div className="truncate text-sm font-medium">{filename}</div>
                    <div className={`text-[13px] tabular-nums md:truncate ${job.status === "ERREUR" ? "text-pill-red-fg" : "text-muted"}`}>
                      {meta}
                    </div>
                    {job.note && <div className="text-xs text-pill-amber-fg md:line-clamp-2">{job.note}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-3 md:hidden">
                      <Pill tone={pill.tone}>{pill.label}</Pill>
                      {retry}
                      {job.shopifyProductUrl && (
                        <a href={job.shopifyProductUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold no-underline">
                          {job.status === "CREE_A_COMPLETER" ? "Ajouter le prix" : "Voir sur Shopify"}
                          <ArrowSquareOut size={14} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="hidden shrink-0 md:block">
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  </div>
                  <div className="hidden w-[150px] shrink-0 justify-end md:flex">
                    {retry}
                    {job.shopifyProductUrl && (
                      <a href={job.shopifyProductUrl} target="_blank" rel="noreferrer" className="btn-ghost h-9 px-3 text-[13px]">
                        {job.status === "CREE_A_COMPLETER" ? "Ajouter le prix" : "Voir sur Shopify"}
                        <ArrowSquareOut size={14} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
