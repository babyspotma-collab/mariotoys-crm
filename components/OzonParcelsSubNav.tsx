import { OZON_CATEGORIES, type OzonCategoryId } from "@/lib/ozon-categories";
import type { OzonCategoryCounts } from "@/lib/ozon-category-counts";

export type OzonParcelsSubTab = OzonCategoryId | "all" | "uncategorized";

export default function OzonParcelsSubNav({
  active,
  counts,
}: {
  active: OzonParcelsSubTab;
  counts: OzonCategoryCounts;
}) {
  const tabs = [
    { id: "all" as const, label: "Tous les colis", href: "/parcels/ozon", count: counts.all },
    ...OZON_CATEGORIES.map((c) => ({ id: c.id, label: c.label, href: c.href, count: counts[c.id] })),
    {
      id: "uncategorized" as const,
      label: "Non catégorisé",
      href: "/parcels/ozon/uncategorized",
      count: counts.uncategorized,
    },
  ];

  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {tabs.map((tab) => (
        <a
          key={tab.id}
          href={tab.href}
          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            active === tab.id ? "bg-ink text-white" : "bg-stone text-muted hover:text-ink"
          }`}
        >
          {tab.label} ({tab.count})
        </a>
      ))}
    </div>
  );
}
