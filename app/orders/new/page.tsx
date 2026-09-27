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
    <div className="max-w-2xl">
      <p className="mb-2 text-xs text-muted">
        <a href="/" className="no-underline hover:underline">← Retour aux commandes</a>
      </p>
      <h1 className="mb-1 text-[22px] md:text-[28px] font-semibold tracking-tight">Nouvelle commande manuelle</h1>
      <p className="mb-8 text-sm text-muted">
        Pour une commande prise par téléphone ou WhatsApp — elle suivra ensuite le même workflow
        que les commandes Shopify.
      </p>

      {productsError && (
        <p className="mb-6 rounded-lg bg-pill-red-bg p-3 text-sm text-pill-red-fg">
          Impossible de charger le catalogue Shopify : {productsError}
        </p>
      )}

      <NewOrderForm products={products} />
    </div>
  );
}
