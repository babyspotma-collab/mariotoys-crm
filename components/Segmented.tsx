// Sélecteur à onglets unique pour tout le CRM (filtres de statut,
// transporteur…). Chaque option est un lien : l'état vit dans l'URL.
export type SegmentedItem = { href: string; label: string; count?: number; active: boolean };

export default function Segmented({ items, label }: { items: SegmentedItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="flex w-full gap-0.5 overflow-x-auto rounded-[10px] bg-segment p-1 md:w-fit"
    >
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`flex h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[13px] no-underline transition-colors md:h-8 md:flex-none ${
            item.active ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-body hover:text-ink"
          }`}
        >
          {item.label}
          {item.count !== undefined && (
            <span className={`tabular-nums ${item.active ? "text-muted" : "text-zinc-400"}`}>{item.count}</span>
          )}
        </a>
      ))}
    </nav>
  );
}
