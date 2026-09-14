import { listProducts } from "@/lib/shopify-admin";
import NewOrderForm from "./NewOrderForm";

export default async function NewOrderPage() {
  let products: Awaited<ReturnType<typeof listProducts>> = [];
  let productsError: string | null = null;
  try {
    products = await listProducts();
  } catch (err) {
    productsError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <p className="text-xs text-muted mb-2">
        <a href="/">← Retour au dashboard</a>
      </p>
      <h1 className="text-xl font-semibold mb-1">Nouvelle commande manuelle</h1>
      <p className="text-sm text-muted mb-8">
        Pour une commande prise par téléphone ou WhatsApp — elle suivra ensuite le même workflow
        que les commandes Shopify.
      </p>

      {productsError && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3 mb-6">
          Impossible de charger le catalogue Shopify : {productsError}
        </p>
      )}

      <NewOrderForm products={products} />
    </main>
  );
}
