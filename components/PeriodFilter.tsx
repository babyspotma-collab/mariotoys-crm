import Segmented from "@/components/Segmented";
import type { Period, PeriodRange } from "@/lib/date-range";

const PRESETS: { id: Period; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 derniers jours" },
  { id: "month", label: "Mois en cours" },
  { id: "custom", label: "Personnalisée" },
];

// Sélecteur de période (état dans l'URL : period, from, to). "keep" = les
// autres paramètres de la page à conserver ; la page est toujours remise
// à 1 (jamais transmise).
export default function PeriodFilter({
  action,
  keep,
  range,
}: {
  action: string;
  keep: Record<string, string | undefined>;
  range: PeriodRange;
}) {
  const kept = Object.fromEntries(Object.entries(keep).filter((e): e is [string, string] => !!e[1]));
  const href = (period: Period) => {
    const params = new URLSearchParams(kept);
    if (period === "custom") {
      params.set("period", "custom");
      params.set("from", range.from);
      params.set("to", range.to);
    } else if (period !== "month") {
      params.set("period", period);
    }
    const qs = params.toString();
    return qs ? `${action}?${qs}` : action;
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <Segmented
        label="Période"
        className="w-full flex-wrap md:w-fit md:flex-nowrap [&>a]:basis-[45%] md:[&>a]:basis-auto"
        items={PRESETS.map((p) => ({ href: href(p.id), label: p.label, active: range.period === p.id }))}
      />
      {range.period === "custom" && (
        <form action={action} className="flex items-end gap-2">
          {Object.entries({ ...kept, period: "custom" }).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted md:flex-none">
            Du
            <input type="date" name="from" defaultValue={range.from} required className="input" />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted md:flex-none">
            Au
            <input type="date" name="to" defaultValue={range.to} required className="input" />
          </label>
          <button type="submit" className="btn-primary">
            OK
          </button>
        </form>
      )}
    </div>
  );
}
