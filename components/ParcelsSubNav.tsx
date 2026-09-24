import { PARCEL_CATEGORIES, type ParcelCategoryId } from "@/lib/parcel-categories";
import type { ParcelCategoryCounts } from "@/lib/parcel-category-counts";

export type ParcelsSubTab = ParcelCategoryId | "all" | "other";

export default function ParcelsSubNav({
  active,
  counts,
}: {
  active: ParcelsSubTab;
  counts: ParcelCategoryCounts;
}) {
  const tabs = [
    { id: "all" as const, label: "Tous les colis", href: "/parcels", count: counts.all },
    ...PARCEL_CATEGORIES.map((c) => ({ id: c.id, label: c.label, href: c.href, count: counts[c.id] })),
    { id: "other" as const, label: "Autre", href: "/parcels/other", count: counts.other },
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
