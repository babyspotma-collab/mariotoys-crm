import { listCollections } from "@/lib/shopify-admin";
import GenerateForm from "./GenerateForm";

export default async function NewProductPage() {
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
        <a href="/">← Retour au dashboard</a>
      </p>
      <h1 className="text-xl font-semibold mb-1">Nouveau produit</h1>
      <p className="text-sm text-muted mb-8">
        Uploadez les photos, choisissez la collection et les tailles, indiquez le coût — le titre
        et la description sont générés automatiquement (à corriger sur l&apos;écran suivant).
      </p>

      {collectionsError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Impossible de charger les collections Shopify : {collectionsError}
        </p>
      )}

      <GenerateForm collections={collections} />
    </main>
  );
}
