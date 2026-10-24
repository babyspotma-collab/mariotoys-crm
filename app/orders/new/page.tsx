import PageHeader from "@/components/PageHeader";
import NewOrderForm from "./NewOrderForm";

export default function NewOrderPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-5 md:gap-6">
      <PageHeader
        back={{ href: "/orders", label: "Commandes" }}
        title="Nouvelle commande"
        subtitle="Pour une commande prise par téléphone ou WhatsApp. Elle suit ensuite le même parcours que les commandes Shopify."
      />

      <NewOrderForm />
    </div>
  );
}
