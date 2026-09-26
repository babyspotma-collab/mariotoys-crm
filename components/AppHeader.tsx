import Image from "next/image";
import { logout } from "@/app/actions";

// URL stable du logo Mario Toys (fichier "Brand assets" hébergé sur le CDN
// Shopify de la boutique, cdn.shopify.com — pas de signature/expiration).
// Codée en dur plutôt qu'interrogée via l'API à chaque rendu : l'image ne
// change quasiment jamais, autant éviter la latence/le risque d'échec réseau.
const LOGO_URL =
  "https://cdn.shopify.com/s/files/1/0668/6579/1069/files/Logo_Mario_Toys_Brillant.png?v=1773845006";

export type NavTab = "orders" | "parcels" | "billing" | "stats" | "productJobs";

const TABS: { id: NavTab; label: string; href: string }[] = [
  { id: "orders", label: "Commandes", href: "/" },
  { id: "parcels", label: "Colis", href: "/parcels" },
  { id: "productJobs", label: "Création produits", href: "/product-jobs" },
  { id: "billing", label: "Facturation", href: "/billing" },
  { id: "stats", label: "Statistiques", href: "/stats" },
];

export default function AppHeader({ active }: { active: NavTab }) {
  return (
    <header className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Image src={LOGO_URL} alt="Mario Toys" width={36} height={36} className="rounded-lg" />
          <h1 className="text-xl font-semibold">Mario Toys CRM</h1>
        </div>
        <form action={logout}>
          <button className="text-sm text-muted hover:text-ink">Se déconnecter</button>
        </form>
      </div>

      <nav className="flex items-center gap-1 border-b border-line">
        {TABS.map((tab) => (
          <a
            key={tab.id}
            href={tab.href}
            className={`text-sm font-medium px-4 py-2.5 -mb-px border-b-2 transition-colors ${
              active === tab.id
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
