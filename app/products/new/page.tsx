import GenerateForm from "./GenerateForm";

export default function NewProductPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <p className="text-xs text-muted mb-2">
        <a href="/">← Retour au dashboard</a>
      </p>
      <h1 className="text-xl font-semibold mb-1">Nouveau produit</h1>
      <p className="text-sm text-muted mb-8">
        Uploadez les photos, indiquez le coût — la fiche (titre, description, collection, prix)
        est générée automatiquement, à corriger sur l&apos;écran suivant avant validation.
      </p>
      <GenerateForm />
    </main>
  );
}
