import { prisma } from "@/lib/db";
import Pill from "@/components/Pill";
import { formatDh, formatInt } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Valeurs réelles trouvées dans le <select id="f_statut"> de la page
// CRBT du dashboard web Forcelog (customer.forcelog.ma/index/CRBT).
const CRBT_STATUSES = ["Enregistré", "Demande Virement", "Payé"];

function formatDate(date: Date | null): string {
  if (!date) return "—";
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

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight">Facturation</h1>
          <p className="text-sm text-muted">
            {carrier === "forcelog"
              ? "Bordereaux de règlement Forcelog, synchronisés toutes les 2 h"
              : "Bordereaux de règlement Ozon Express, synchronisés toutes les 2 h"}
          </p>
        </div>
        <div role="group" aria-label="Transporteur" className="flex gap-0.5 rounded-[10px] bg-segment p-[3px] md:inline-flex">
          {(["forcelog", "ozon"] as const).map((c) => (
            <a
              key={c}
              href={`/billing?carrier=${c}`}
              aria-pressed={carrier === c}
              className={`flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-[13px] no-underline md:h-8 md:flex-none ${
                carrier === c ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-body"
              }`}
            >
              {c === "forcelog" ? "Forcelog" : "Ozon Express"}
            </a>
          ))}
        </div>
      </div>

      <form className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center" action="/billing">
        <input type="hidden" name="carrier" value={carrier} />
        <select
          name="statut"
          defaultValue={searchParams.statut ?? ""}
          className="h-11 w-full rounded-[10px] border border-line-input bg-white px-3 text-base text-ink md:h-[38px] md:w-auto md:text-[13px]"
        >
          <option value="">Tous les statuts</option>
          {CRBT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            name="from"
            type="date"
            defaultValue={searchParams.from ?? ""}
            className="h-11 w-1/2 rounded-[10px] border border-line-input bg-white px-3 text-base text-ink md:h-[38px] md:w-auto md:text-[13px]"
          />
          <input
            name="to"
            type="date"
            defaultValue={searchParams.to ?? ""}
            className="h-11 w-1/2 rounded-[10px] border border-line-input bg-white px-3 text-base text-ink md:h-[38px] md:w-auto md:text-[13px]"
          />
        </div>
        <button type="submit" className="btn-secondary h-11 md:h-[38px] px-3.5 text-[13px]">
          Filtrer
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <div className="card flex flex-col gap-2 p-4 md:gap-2.5 md:p-[22px_24px]">
          <div className="text-[13px] text-muted">Montant total</div>
          <div className="text-2xl font-semibold tracking-tight md:text-[30px]">{formatDh(sums._sum.amount)}</div>
        </div>
        <div className="card flex flex-col gap-2 p-4 md:gap-2.5 md:p-[22px_24px]">
          <div className="text-[13px] text-muted">Frais de livraison</div>
          <div className="text-2xl font-semibold tracking-tight md:text-[30px]">{formatDh(sums._sum.feesAmount)}</div>
        </div>
        <div className="card col-span-2 flex flex-col gap-2 p-4 md:col-span-1 md:gap-2.5 md:p-[22px_24px]">
          <div className="text-[13px] text-muted">Colis facturés</div>
          <div className="text-2xl font-semibold tracking-tight md:text-[30px]">{formatInt(sums._sum.parcelsCount)}</div>
        </div>
      </div>

      {invoices.length > 0 ? (
        <>
          {/* Mobile : une carte par bordereau */}
          <div className="flex flex-col gap-3 md:hidden">
            {invoices.map((inv) => (
              <div key={inv.ref} className="card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[13px] font-medium leading-snug">{inv.ref}</span>
                  <Pill tone={inv.statut === "Payé" ? "green" : "amber"}>{inv.statut}</Pill>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted">Créé le</div>
                    <div className="text-body">{formatDate(inv.cDate)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted">Payé le</div>
                    <div className="text-body">{formatDate(inv.payDate)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted">Colis</div>
                    <div className="text-body">{formatInt(inv.parcelsCount)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted">Frais</div>
                    <div className="text-body">{formatDh(inv.feesAmount)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-line-soft pt-2.5">
                  <span className="text-[13px] text-muted">Montant</span>
                  <span className="text-lg font-semibold">{formatDh(inv.amount)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop : tableau */}
          <div className="card hidden overflow-hidden md:block">
            <div className="grid grid-cols-[minmax(0,2fr)_120px_120px_90px_140px_150px_100px] items-center gap-3 border-b border-line-soft px-5 text-[12px] font-medium uppercase tracking-wide text-muted h-11">
              <div>Bordereau</div>
              <div>Créé le</div>
              <div>Payé le</div>
              <div className="text-right">Colis</div>
              <div className="text-right">Frais</div>
              <div className="text-right">Montant</div>
              <div className="text-right">Statut</div>
            </div>
            {invoices.map((inv) => (
              <div
                key={inv.ref}
                className="grid min-h-[60px] grid-cols-[minmax(0,2fr)_120px_120px_90px_140px_150px_100px] items-center gap-3 border-b border-line-soft px-5 py-2 text-sm last:border-b-0"
              >
                <div className="truncate font-mono text-[13px]">{inv.ref}</div>
                <div className="text-body">{formatDate(inv.cDate)}</div>
                <div className="text-body">{formatDate(inv.payDate)}</div>
                <div className="text-right">{formatInt(inv.parcelsCount)}</div>
                <div className="text-right text-body">{formatDh(inv.feesAmount)}</div>
                <div className="text-right font-semibold">{formatDh(inv.amount)}</div>
                <div className="text-right">
                  <Pill tone={inv.statut === "Payé" ? "green" : "amber"}>{inv.statut}</Pill>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="card flex flex-col items-center gap-2 border-dashed border-line-dashed p-14 text-center">
          <div className="text-base font-semibold">Aucun bordereau pour ces filtres</div>
          <p className="max-w-[460px] text-sm leading-relaxed text-muted">
            Aucun bordereau {carrier === "forcelog" ? "Forcelog" : "Ozon Express"} ne correspond aux filtres sélectionnés.
          </p>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <a
            href={qs({ page: Math.max(1, page - 1) })}
            className={`text-sm no-underline ${page <= 1 ? "pointer-events-none text-muted opacity-40" : "text-ink hover:underline"}`}
          >
            ← Précédent
          </a>
          <span className="text-xs text-muted">
            Page {page} / {totalPages}
          </span>
          <a
            href={qs({ page: Math.min(totalPages, page + 1) })}
            className={`text-sm no-underline ${page >= totalPages ? "pointer-events-none text-muted opacity-40" : "text-ink hover:underline"}`}
          >
            Suivant →
          </a>
        </div>
      )}
    </>
  );
}
