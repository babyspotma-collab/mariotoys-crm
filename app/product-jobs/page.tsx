import { prisma } from "@/lib/db";
import Pill, { type PillTone } from "@/components/Pill";
import UploadPhotosForm from "./UploadPhotosForm";
import { formatDh } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, { tone: PillTone; label: string }> = {
  EN_ATTENTE: { tone: "gray", label: "En attente" },
  EN_COURS: { tone: "blue", label: "Génération en cours" },
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
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight">Création produits</h1>
        <p className="text-sm text-muted">
          Dépose tes photos : prix d&apos;achat et référence sont lus sur l&apos;image, les visuels et la fiche sont créés
          automatiquement en brouillon.
        </p>
      </div>

      <UploadPhotosForm />

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Traitements récents</h2>
          <span className="text-xs text-muted">Le PC doit être allumé pour que le traitement avance</span>
        </div>

        <div className="card overflow-hidden">
          {jobs.length === 0 && <p className="px-5 py-6 text-sm text-muted">Aucun job pour l&apos;instant.</p>}

          {jobs.map((job) => {
            const pill = STATUS_PILL[job.status] ?? { tone: "gray" as const, label: job.status };
            const meta =
              job.status === "ERREUR"
                ? job.errorMessage ?? "Erreur inconnue"
                : job.cost
                  ? `Coût ${formatDh(job.cost)} → vente ${formatDh(job.sellPrice)}${job.sku ? ` · SKU ${job.sku}` : ""}`
                  : job.status === "CREE_A_COMPLETER"
                    ? `Prix et SKU introuvables sur la photo${job.missingFields.length ? ` (${job.missingFields.join(", ")})` : ""}`
                    : "En attente de traitement par le worker";
            const images = Array.isArray(job.generatedImageUrls) ? (job.generatedImageUrls as string[]) : [];
            const thumb = images[0] ?? job.originalPhotoUrl;

            return (
              <div key={job.id} className="flex gap-3.5 border-b border-line-soft px-4 py-3 last:border-b-0 md:items-center md:gap-[18px] md:px-5">
                <img
                  src={thumb}
                  alt={job.originalFilename}
                  className="h-[52px] w-[52px] shrink-0 rounded-[10px] border border-line object-cover md:h-[60px] md:w-[60px]"
                />
                <div className="flex min-w-0 flex-grow flex-col gap-1.5">
                  <div className="truncate text-sm font-semibold">{job.originalFilename}</div>
                  <div className={`text-[13px] md:truncate ${job.status === "ERREUR" ? "text-accent" : "text-muted"}`}>
                    {meta}
                  </div>
                  {job.note && <div className="text-xs text-muted md:truncate">{job.note}</div>}
                  <div className="flex items-center gap-3 md:hidden">
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                    {job.shopifyProductUrl && (
                      <a href={job.shopifyProductUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold no-underline">
                        {job.status === "CREE_A_COMPLETER" ? "Ajouter le prix →" : "Voir sur Shopify →"}
                      </a>
                    )}
                  </div>
                </div>
                <div className="hidden shrink-0 md:block">
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                </div>
                <div className="hidden w-[150px] shrink-0 text-right md:block">
                  {job.shopifyProductUrl && (
                    <a href={job.shopifyProductUrl} target="_blank" rel="noreferrer" className="text-[13px] font-semibold no-underline">
                      {job.status === "CREE_A_COMPLETER" ? "Ajouter le prix →" : "Voir sur Shopify →"}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
