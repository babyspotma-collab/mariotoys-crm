import { listProducts } from "@/lib/shopify-admin";
import PageHeader from "@/components/PageHeader";
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
    <div className="flex max-w-3xl flex-col gap-5 md:gap-6">
      <PageHeader
        back={{ href: "/", label: "Commandes" }}
        title="Nouvelle commande"
        subtitle="Pour une commande prise par téléphone ou WhatsApp. Elle suit ensuite le même parcours que les commandes Shopify."
      />

      {productsError && <p className="alert-error">Catalogue Shopify indisponible : {productsError}</p>}

      <NewOrderForm products={products} />
    </div>
  );
}
