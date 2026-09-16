import { prisma } from "@/lib/db";
import AppHeader from "@/components/AppHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Valeurs réelles trouvées dans le <select id="f_statut"> de la page
// CRBT du dashboard web Forcelog (customer.forcelog.ma/index/CRBT).
const CRBT_STATUSES = ["Enregistré", "Demande Virement", "Payé"];

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { statut?: string; from?: string; to?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where: Record<string, unknown> = {};
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
    const merged = { statut: searchParams.statut, from: searchParams.from, to: searchParams.to, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, String(v));
    return `/billing?${params.toString()}`;
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <AppHeader active="billing" />

      <p className="text-xs text-muted mb-8">
        Factures CRBT (bordereaux de règlement) synchronisées depuis le
        dashboard Forcelog toutes les 2h.
      </p>

      <form className="flex flex-wrap items-end gap-3 mb-8" action="/billing">
        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="statut">
            Statut
          </label>
          <select
            id="statut"
            name="statut"
            defaultValue={searchParams.statut ?? ""}
            className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">Tous</option>
            {CRBT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="from">
            Du
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={searchParams.from ?? ""}
            className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="to">
            Au
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={searchParams.to ?? ""}
            className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white"
          />
        </div>
        <button type="submit" className="text-sm text-muted hover:text-ink px-2 py-1.5">
          Filtrer
        </button>
      </form>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Montant total</p>
          <p className="text-2xl font-semibold">{Number(sums._sum.amount ?? 0)} DH</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Frais totaux</p>
          <p className="text-2xl font-semibold">{Number(sums._sum.feesAmount ?? 0)} DH</p>
        </div>
        <div className="bg-white border border-line rounded-2xl p-5">
          <p className="text-xs text-muted mb-1">Colis facturés</p>
          <p className="text-2xl font-semibold">{sums._sum.parcelsCount ?? 0}</p>
        </div>
      </div>

      {invoices.length === 0 && (
        <p className="text-sm text-muted">Aucune facture CRBT pour ces filtres.</p>
      )}

      <div className="flex flex-col gap-2">
        {invoices.map((inv) => (
          <div key={inv.ref} className="bg-white border border-line rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium font-mono">{inv.ref}</p>
                <p className="text-xs text-muted mt-1">
                  Créée le {formatDate(inv.cDate)}
                  {inv.payDate ? ` · Payée le ${formatDate(inv.payDate)}` : ""}
                </p>
              </div>
              <span className="badge bg-sage/20 text-sage-dark">{inv.statut}</span>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3 text-sm">
              <div>
                <p className="text-xs text-muted">Nb colis</p>
                <p className="font-medium">{inv.parcelsCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Frais</p>
                <p className="font-medium">
                  {inv.fees} ({Number(inv.feesAmount)} DH)
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Balance</p>
                <p className="font-medium">{Number(inv.balance)} DH</p>
              </div>
              <div>
                <p className="text-xs text-muted">Montant total</p>
                <p className="font-semibold">{Number(inv.amount)} DH</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <a
            href={qs({ page: Math.max(1, page - 1) })}
            className={`text-sm ${page <= 1 ? "text-muted pointer-events-none opacity-40" : "text-ink hover:underline"}`}
          >
            ← Précédent
          </a>
          <span className="text-xs text-muted">
            Page {page} / {totalPages}
          </span>
          <a
            href={qs({ page: Math.min(totalPages, page + 1) })}
            className={`text-sm ${page >= totalPages ? "text-muted pointer-events-none opacity-40" : "text-ink hover:underline"}`}
          >
            Suivant →
          </a>
        </div>
      )}
    </main>
  );
}
