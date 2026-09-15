export type ParcelsSubTab = "all" | "returns" | "stuck";

const SUB_TABS: { id: ParcelsSubTab; label: string; href: string }[] = [
  { id: "all", label: "Tous les colis", href: "/parcels" },
  { id: "returns", label: "Retours", href: "/parcels/returns" },
  { id: "stuck", label: "Pas de réponse", href: "/parcels/stuck" },
];

export default function ParcelsSubNav({ active }: { active: ParcelsSubTab }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {SUB_TABS.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            active === tab.id ? "bg-ink text-white" : "bg-stone text-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </a>
      ))}
    </div>
  );
}
