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
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold tracking-tight">Facturation</h1>
          <p className="text-sm text-muted">
            {carrier === "forcelog"
              ? "Bordereaux de règlement Forcelog, synchronisés toutes les 2 h"
              : "Bordereaux de règlement Ozon Express"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form className="flex flex-wrap items-center gap-2" action="/billing">
            <input type="hidden" name="carrier" value={carrier} />
            <select
              name="statut"
              defaultValue={searchParams.statut ?? ""}
              className="h-[38px] rounded-[10px] border border-line-input bg-white px-3 text-[13px] text-ink"
            >
              <option value="">Tous les statuts</option>
              {CRBT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              name="from"
              type="date"
              defaultValue={searchParams.from ?? ""}
              className="h-[38px] rounded-[10px] border border-line-input bg-white px-3 text-[13px] text-ink"
            />
            <input
              name="to"
              type="date"
              defaultValue={searchParams.to ?? ""}
              className="h-[38px] rounded-[10px] border border-line-input bg-white px-3 text-[13px] text-ink"
            />
            <button type="submit" className="btn-secondary h-[38px] px-3.5 text-[13px]">
              Filtrer
            </button>
          </form>
          <div role="group" aria-label="Transporteur" className="inline-flex gap-0.5 rounded-[10px] bg-segment p-[3px]">
            {(["forcelog", "ozon"] as const).map((c) => (
              <a
                key={c}
                href={`/billing?carrier=${c}`}
                aria-pressed={carrier === c}
                className={`flex h-8 items-center rounded-lg px-4 text-[13px] no-underline ${
                  carrier === c ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-body"
                }`}
              >
                {c === "forcelog" ? "Forcelog" : "Ozon Express"}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card flex flex-col gap-2.5 p-[22px_24px]">
          <div className="text-[13px] text-muted">Montant total</div>
          <div className="text-[30px] font-semibold tracking-tight">{formatDh(sums._sum.amount)}</div>
        </div>
        <div className="card flex flex-col gap-2.5 p-[22px_24px]">
          <div className="text-[13px] text-muted">Frais de livraison</div>
          <div className="text-[30px] font-semibold tracking-tight">{formatDh(sums._sum.feesAmount)}</div>
        </div>
        <div className="card flex flex-col gap-2.5 p-[22px_24px]">
          <div className="text-[13px] text-muted">Colis facturés</div>
          <div className="text-[30px] font-semibold tracking-tight">{formatInt(sums._sum.parcelsCount)}</div>
        </div>
      </div>

      {invoices.length > 0 ? (
        <div className="card overflow-hidden">
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
      ) : (
        <div className="card flex flex-col items-center gap-2 border-dashed border-line-dashed p-14 text-center">
          <div className="text-base font-semibold">
            {carrier === "forcelog" ? "Aucun bordereau pour ces filtres" : "Factures Ozon Express"}
          </div>
          <p className="max-w-[460px] text-sm leading-relaxed text-muted">
            {carrier === "forcelog"
              ? "Aucun bordereau ne correspond aux filtres sélectionnés."
              : "Les bordereaux Ozon Express s'afficheront ici, synchronisés comme ceux de Forcelog, dès que la connexion Ozon sera en place."}
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
