import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";
import UploadPhotosForm from "./UploadPhotosForm";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    EN_ATTENTE: "bg-slate/20 text-slate",
    EN_COURS: "bg-sage/20 text-sage-dark",
    IMAGES_PRETES: "bg-sage/20 text-sage-dark",
    CREE: "bg-sage/20 text-sage-dark",
    ERREUR: "bg-danger/10 text-danger",
  };
  const labels: Record<string, string> = {
    EN_ATTENTE: "En attente",
    EN_COURS: "En cours",
    IMAGES_PRETES: "Visuels prêts",
    CREE: "Créé",
    ERREUR: "Erreur",
  };
  return <span className={`badge ${styles[status] ?? ""}`}>{labels[status] ?? status}</span>;
}

export default async function ProductJobsPage() {
  const jobs = await prisma.productJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="productJobs" />
      <h1 className="text-xl font-semibold mb-1">Création produits</h1>
      <p className="text-sm text-muted mb-8">
        Dépose des photos produit ci-dessous — le worker sur PC génère les visuels via Gemini,
        puis la création du produit Shopify (fiche + brouillon) se fait dans une session à part.
      </p>

      <UploadPhotosForm />

      <div className="flex flex-col gap-3">
        {jobs.length === 0 && <p className="text-sm text-muted">Aucun job pour l&apos;instant.</p>}

        {jobs.map((job) => (
          <div key={job.id} className="bg-white border border-line rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-medium">{job.originalFilename}</p>
                <p className="text-sm text-muted">
                  Coût : {job.cost ? `${Number(job.cost)} DH` : "—"} ·{" "}
                  {job.createdAt.toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <StatusBadge status={job.status} />
            </div>

            <div className="flex gap-3 flex-wrap">
              <a href={job.originalPhotoUrl} target="_blank" rel="noreferrer">
                <img
                  src={job.originalPhotoUrl}
                  alt={job.originalFilename}
                  className="w-20 h-20 object-cover rounded-lg border border-line"
                />
              </a>
              {Array.isArray(job.generatedImageUrls) &&
                (job.generatedImageUrls as string[]).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt={`Visuel généré ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-sage-dark"
                    />
                  </a>
                ))}
            </div>

            {job.status === "CREE" && job.shopifyProductUrl && (
              <a
                href={job.shopifyProductUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-sage-dark underline mt-3 inline-block"
              >
                Voir le produit Shopify →
              </a>
            )}

            {job.status === "ERREUR" && job.errorMessage && (
              <p className="text-xs text-danger bg-danger/10 rounded-lg p-3 mt-3">
                {job.errorMessage}
              </p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
