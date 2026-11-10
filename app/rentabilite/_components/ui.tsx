import Segmented from "@/components/Segmented";
import Pill, { type PillTone } from "@/components/Pill";
import type { CostFlag, CostTypeName } from "@/lib/profit/cost";
import { formatDateTimeMa } from "@/lib/format";
import type { SyncName, SyncStatus } from "@/lib/profit/settings";

// Petits éléments partagés par les écrans Rentabilité.

const TABS = [
  { href: "/rentabilite", label: "Vue d'ensemble" },
  { href: "/rentabilite/articles", label: "Articles" },
  { href: "/rentabilite/classement", label: "Classement" },
  { href: "/rentabilite/campagnes", label: "Campagnes" },
  { href: "/rentabilite/reglages", label: "Réglages" },
];

export function ProfitNav({ active }: { active: string }) {
  return <Segmented label="Rentabilité" items={TABS.map((t) => ({ ...t, active: t.href === active }))} />;
}

/** "12,3 %" ; "—" si inconnu. */
export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

/** Montant signé, en rouge s'il est négatif. */
export function Signed({ value, className = "" }: { value: number; className?: string }) {
  const n = Math.round(value);
  return <span className={`tabular-nums ${n < 0 ? "text-accent" : ""} ${className}`}>{`${n.toLocaleString("fr-FR")} DH`}</span>;
}

const TYPE_TONE: Record<CostTypeName, PillTone> = { LOCAL: "green", IMPORTE: "blue", NON_CLASSE: "amber" };
const TYPE_SHORT: Record<CostTypeName, string> = { LOCAL: "Local", IMPORTE: "Importé", NON_CLASSE: "Non classé" };

export function CostTypePill({ type }: { type: CostTypeName }) {
  return <Pill tone={TYPE_TONE[type]}>{TYPE_SHORT[type]}</Pill>;
}

/** Type + source du coût retenu (ex. « Importé · prix de gros »), en couleur d'alerte si besoin. */
export function CostSource({ label, flag }: { label: string | null; flag: CostFlag | null }) {
  if (!label) return <span className="text-xs text-muted">aucun article ALBASEET+</span>;
  return <span className={`text-xs ${flag ? "text-pill-amber-fg" : "text-muted"}`}>{label}</span>;
}

const SYNC_LABEL: Record<SyncName, string> = { stock: "Stock ALBASEET+", catalog: "Catalogue Shopify", meta: "Dépenses Meta" };

export function SyncLine({ status }: { status: Partial<Record<SyncName, SyncStatus>> }) {
  return (
    <ul className="flex flex-col gap-1 text-xs text-muted md:flex-row md:flex-wrap md:gap-x-5">
      {(["stock", "catalog", "meta"] as SyncName[]).map((name) => {
        const s = status[name];
        const tone = !s ? "bg-zinc-300" : s.ok ? "bg-emerald-500" : "bg-accent";
        return (
          <li key={name} className="flex min-w-0 items-center gap-1.5" title={s?.message}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
            <span className="truncate">
              {SYNC_LABEL[name]} : {s ? `${formatDateTimeMa(new Date(s.at))}${s.ok ? "" : " — échec"}` : "jamais reçu"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
