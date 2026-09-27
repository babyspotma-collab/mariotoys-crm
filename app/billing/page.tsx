import { prisma } from "@/lib/db";
import { CaretLeft, CaretRight, Funnel } from "@phosphor-icons/react/dist/ssr";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import Pill from "@/components/Pill";
import Segmented from "@/components/Segmented";
import { formatDh, formatInt } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Valeurs réelles trouvées dans le <select id="f_statut"> de la page
// CRBT du dashboard web Forcelog (customer.forcelog.ma/index/CRBT).
const CRBT_STATUSES = ["Enregistré", "Demande Virement", "Payé"];

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { carrier?: string; statut?: string; from?: string; to?: string; page?: string };
}) {
  const carrier: "forcelog" | "ozon" = searchParams.carrier === "ozon" ? "ozon" : "forcelog";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where: Record<string, unknown> = { carrier: carrier.toUpperCase() };
  if (searchParams.statut) where.statut = searchParams.statut;
  if (searchParams.from || searchParams.to) {
    where.cDate = {
      ...(searchParams.from ? { gte: new Date(searchParams.from) } : {}),
      ...(searchParams.to ? { lte: new Date(`${searchParams.to}T23:59:59`) } : {}),
    };
  }

  const [invoices, total, sums] = await Promise.all([
    prisma.crbtInvoice.findMany({
      where,
      orderBy: { cDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.crbtInvoice.count({ where }),
    prisma.crbtInvoice.aggregate({ where, _sum: { amount: true, feesAmount: true, parcelsCount: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { carrier, statut: searchParams.statut, from: searchParams.from, to: searchParams.to, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, String(v));
    return `/billing?${params.toString()}`;
  };

  const carrierName = carrier === "forcelog" ? "Forcelog" : "Ozon Express";
  const activeFilters = [searchParams.statut, searchParams.from, searchParams.to].filter(Boolean).length;
  const kpis = [
    { label: "Montant total", value: formatDh(sums._sum.amount) },
    { label: "Frais de livraison", value: formatDh(sums._sum.feesAmount) },
    { label: "Colis facturés", value: formatInt(sums._sum.parcelsCount) },
  ];

  return (
    <>
      <PageHeader
        title="Facturation"
        subtitle={`Bordereaux ${carrierName}, synchronisés toutes les 2 h`}
        actions={
          <Segmented
            label="Transporteur"
            className="w-fit"
            items={(["forcelog", "ozon"] as const).map((c) => ({
              href: `/billing?carrier=${c}`,
              label: c === "forcelog" ? "Forcelog" : "Ozon",
              active: carrier === c,
            }))}
          />
        }
      />

      <div className="card grid grid-cols-2 md:grid-cols-3 md:divide-x md:divide-line-soft">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`flex flex-col gap-1 p-4 md:px-6 md:py-5 ${
              i === 0 ? "border-r border-line-soft md:border-r-0" : ""
            } ${i === 2 ? "col-span-2 border-t border-line-soft md:col-span-1 md:border-t-0" : ""}`}
          >
            <span className="text-[13px] text-muted">{k.label}</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums md:text-[28px]">{k.value}</span>
          </div>
        ))}
      </div>

      <details className="group card" open={activeFilters > 0}>
        <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium md:px-5 [&::-webkit-details-marker]:hidden">
          <Funnel size={17} aria-hidden="true" className="text-muted" />
          Filtres
          {activeFilters > 0 && (
            <span className="rounded-md bg-cream-dark px-1.5 text-xs tabular-nums text-body">{activeFilters}</span>
          )}
          <CaretRight size={14} aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-90" />
        </summary>
        <form action="/billing" className="grid grid-cols-2 gap-3 border-t border-line-soft p-4 md:flex md:items-end md:px-5">
          <input type="hidden" name="carrier" value={carrier} />
          <div className="col-span-2 md:w-48">
            <label htmlFor="statut" className="label">
              Statut
            </label>
            <select id="statut" name="statut" defaultValue={searchParams.statut ?? ""} className="input">
              <option value="">Tous les statuts</option>
              {CRBT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="label">
              Du
            </label>
            <input id="from" name="from" type="date" defaultValue={searchParams.from ?? ""} className="input" />
          </div>
          <div>
            <label htmlFor="to" className="label">
              Au
            </label>
            <input id="to" name="to" type="date" defaultValue={searchParams.to ?? ""} className="input" />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="btn-primary flex-1 md:flex-none">
              Appliquer
            </button>
            {activeFilters > 0 && (
              <a href={`/billing?carrier=${carrier}`} className="btn-ghost">
                Réinitialiser
              </a>
            )}
          </div>
        </form>
      </details>

      {invoices.length > 0 ? (
        <ul className="card divide-y divide-line-soft">
          <li className="hidden h-10 grid-cols-[minmax(0,2fr)_80px_120px_130px_120px] items-center gap-5 px-5 text-xs font-medium text-muted md:grid">
            <span>Bordereau</span>
            <span className="text-right">Colis</span>
            <span className="text-right">Frais</span>
            <span className="text-right">Montant</span>
            <span className="text-right">Statut</span>
          </li>
          {invoices.map((inv) => {
            const pill = <Pill tone={inv.statut === "Payé" ? "green" : "amber"}>{inv.statut}</Pill>;
            return (
              <li
                key={inv.ref}
                className="flex flex-col gap-2 p-4 md:grid md:grid-cols-[minmax(0,2fr)_80px_120px_130px_120px] md:items-center md:gap-5 md:px-5 md:py-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-all font-mono text-[13px] font-medium md:truncate">{inv.ref}</div>
                    <div className="mt-0.5 text-xs tabular-nums text-muted">
                      Créé le {formatDate(inv.cDate)}
                      {inv.payDate && <>, payé le {formatDate(inv.payDate)}</>}
                    </div>
                  </div>
                  <span className="shrink-0 md:hidden">{pill}</span>
                </div>
                <div className="hidden text-right text-sm tabular-nums text-body md:block">{formatInt(inv.parcelsCount)}</div>
                <div className="hidden text-right text-sm tabular-nums text-body md:block">{formatDh(inv.feesAmount)}</div>
                <div className="flex items-baseline justify-between gap-3 md:block md:text-right">
                  <span className="text-[13px] tabular-nums text-muted md:hidden">
                    {formatInt(inv.parcelsCount)} colis, frais {formatDh(inv.feesAmount)}
                  </span>
                  <span className="text-lg font-semibold tabular-nums md:text-sm">{formatDh(inv.amount)}</span>
                </div>
                <div className="hidden text-right md:block">{pill}</div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="Aucun bordereau pour ces filtres">
          Aucun bordereau {carrierName} ne correspond aux filtres sélectionnés.
        </EmptyState>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-4 md:justify-center">
          {page <= 1 ? (
            <span className="btn-secondary pointer-events-none opacity-40" aria-disabled="true">
              <CaretLeft size={16} aria-hidden="true" />
              Précédent
            </span>
          ) : (
            <a href={qs({ page: page - 1 })} className="btn-secondary">
              <CaretLeft size={16} aria-hidden="true" />
              Précédent
            </a>
          )}
          <span className="text-sm tabular-nums text-muted">
            {page} / {totalPages}
          </span>
          {page >= totalPages ? (
            <span className="btn-secondary pointer-events-none opacity-40" aria-disabled="true">
              Suivant
              <CaretRight size={16} aria-hidden="true" />
            </span>
          ) : (
            <a href={qs({ page: page + 1 })} className="btn-secondary">
              Suivant
              <CaretRight size={16} aria-hidden="true" />
            </a>
          )}
        </nav>
      )}
    </>
  );
}
