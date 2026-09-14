export default function ProductCreatedPage({ searchParams }: { searchParams: { url?: string } }) {
  return (
    <main className="max-w-xl mx-auto px-6 py-16 text-center">
      <h1 className="text-xl font-semibold mb-3">Produit créé ✓</h1>
      <p className="text-sm text-muted mb-8">
        Le produit a été créé en brouillon sur Shopify. Vérifiez-le et publiez-le quand vous êtes
        prêt.
      </p>
      <div className="flex gap-3 justify-center">
        {searchParams.url && (
          <a href={searchParams.url} target="_blank" rel="noopener" className="btn-primary">
            Ouvrir sur Shopify
          </a>
        )}
        <a href="/products/new" className="btn-danger">
          Ajouter un autre produit
        </a>
      </div>
      <p className="mt-6">
        <a href="/" className="text-sm text-muted hover:text-ink">
          ← Retour au dashboard
        </a>
      </p>
    </main>
  );
}
