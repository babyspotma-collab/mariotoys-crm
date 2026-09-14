import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { listCollections } from "@/lib/shopify-admin";
import ReviewForm from "./ReviewForm";

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const draft = await prisma.productDraft.findUnique({ where: { id: params.id } });
  if (!draft) notFound();

  let collections: Awaited<ReturnType<typeof listCollections>> = [];
  let collectionsError: string | null = null;
  try {
    collections = await listCollections();
  } catch (err) {
    collectionsError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <p className="text-xs text-muted mb-2">
        <a href="/products/new">← Recommencer</a>
      </p>
      <h1 className="text-xl font-semibold mb-1">Vérifier avant création</h1>
      <p className="text-sm text-muted mb-8">
        Fiche générée automatiquement — corrigez ce qui est nécessaire avant de créer le produit
        (brouillon) sur Shopify.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {(draft.imagePathnames as string[]).map((pathname) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={pathname}
            src={`/api/blob?pathname=${encodeURIComponent(pathname)}`}
            alt=""
            className="aspect-square object-cover rounded-lg border border-line"
          />
        ))}
      </div>

      {collectionsError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Impossible de charger les collections Shopify : {collectionsError}
        </p>
      )}

      {draft.collectionAmbiguous && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Collection non détectée automatiquement
          {draft.collectionTitle ? ` (l'IA a suggéré « ${draft.collectionTitle} », introuvable dans le catalogue)` : ""}
          — choisissez-la manuellement ci-dessous.
        </p>
      )}

      <ReviewForm
        draftId={draft.id}
        collections={collections}
        initialValues={{
          title: draft.title,
          about: draft.about,
          features: (draft.features as string[]).join("\n"),
          sizes: (draft.sizes as string[]).join(", "),
          tags: (draft.tags as string[]).join(", "),
          price: Number(draft.price),
          compareAtPrice: Number(draft.compareAtPrice),
          collectionId: draft.collectionId ?? "",
        }}
      />
    </main>
  );
}
