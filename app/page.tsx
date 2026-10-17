import { redirect } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import PeriodFilter from "@/components/PeriodFilter";
import StatCard from "@/components/StatCard";
import { periodParams, periodRange } from "@/lib/date-range";
import { formatDh, formatInt } from "@/lib/format";
import { getHomeStats, type CarrierSummary } from "@/lib/home-stats";

export const dynamic = "force-dynamic";

// Accueil : vue d'ensemble de la période choisie (par défaut le mois en cours,
// comme les pages Commandes et Colis) — commandes, top 5 villes Shopify,
// Forcelog, Ozon Express et Livraison Casablanca. La liste des commandes est
// sur /orders.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  // Anciens liens de la liste des commandes ("/?tab=ok&q=…", favoris, retours
  // enregistrés avant l'Accueil) : redirigés vers /orders avec les mêmes paramètres.
  if (searchParams.tab || searchParams.q || searchParams.page) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v) params.set(k, v);
    redirect(`/orders?${params.toString()}`);
  }

  const range = periodRange(searchParams);
  const keep = periodParams(range);
  const stats = await getHomeStats(range);
  const { orders, shopifyCities, forcelog, ozon, casa } = stats;

  // Liens vers les pages détaillées, en gardant la période choisie.
  const to = (path: string, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ ...extra, ...keep });
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const cityMax = Math.max(1, ...shopifyCities.cities.map((c) => c.count));

  return (
    <>
      <PageHeader title="Accueil" subtitle={`Vue d'ensemble · ${range.label}`} />

      <PeriodFilter action="/" keep={{}} range={range} />

      {/* ── Commandes ─────────────────────────────────────────────── */}
      <section aria-labelledby="h-orders" className="flex flex-col gap-3">
        <SectionTitle id="h-orders" title="Commandes" href={to("/orders", { tab: "all" })} linkLabel="Voir les commandes" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Commandes reçues" value={formatInt(orders.total)} sub={range.label} href={to("/orders", { tab: "all" })} />
          <StatCard
            label="Commandes confirmées"
            value={formatInt(orders.confirmed)}
            sub={orders.confirmationRate === null ? "—" : `${orders.confirmationRate} % des commandes`}
            href={to("/orders", { tab: "ok" })}
          />
          <StatCard label="À confirmer" value={formatInt(orders.nouvelle)} sub="en attente" href={to("/orders", { tab: "todo" })} />
          <StatCard label="Annulées" value={formatInt(orders.annulee)} sub={orders.total > 0 ? `${Math.round((orders.annulee / orders.total) * 100)} % des commandes` : "—"} />
          <StatCard label="Chiffre d'affaires confirmé" value={formatDh(orders.confirmedAmount)} sub="commandes confirmées" />
          <StatCard label="Panier moyen" value={orders.avgBasket === null ? "—" : formatDh(orders.avgBasket)} sub="sur les confirmées" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Top 5 villes Shopify ──────────────────────────────── */}
        <section aria-labelledby="h-cities" className="flex flex-col gap-3">
          <SectionTitle id="h-cities" title="Top 5 villes · Shopify" />
          <div className="card flex flex-grow flex-col gap-3 p-4">
            {shopifyCities.cities.length === 0 ? (
              <EmptyState title="Aucune commande Shopify">Rien sur cette période.</EmptyState>
            ) : (
              <>
                <ol className="flex flex-col gap-3">
                  {shopifyCities.cities.map((c, i) => (
                    <li key={c.label} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium">
                          <span className="mr-2 tabular-nums text-muted">{i + 1}</span>
                          {c.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-body">
                          {formatInt(c.count)} <span className="text-muted">· {c.share} %</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-cream-dark" aria-hidden="true">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(3, Math.round((c.count / cityMax) * 100))}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-auto border-t border-line-soft pt-3 text-xs text-muted">
                  {formatInt(shopifyCities.total)} commandes Shopify sur la période
                  {shopifyCities.withoutCity > 0 ? ` · ${formatInt(shopifyCities.withoutCity)} sans ville` : ""}
                </p>
              </>
            )}
          </div>
        </section>

        {/* ── Livraison Casablanca ──────────────────────────────── */}
        <section aria-labelledby="h-casa" className="flex flex-col gap-3">
          <SectionTitle id="h-casa" title="Livraison Casablanca" href="/livraisons" linkLabel="Voir les livraisons" />
          <div className="card flex flex-grow flex-col gap-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <Figure label="Chez les livreurs" value={formatInt(casa.pendingCount)} sub="commandes en cours" />
              <Figure label="À récupérer" value={formatDh(casa.pendingAmount)} sub="encore chez les livreurs" />
            </div>

            {casa.couriers.length > 0 && (
              <ul className="flex flex-col divide-y divide-line-soft rounded-[10px] border border-line-soft">
                {casa.couriers.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{c.name}</span>
                    <span className="shrink-0 tabular-nums text-body">
                      {formatInt(c.count)} <span className="text-muted">· {formatDh(c.amount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-auto grid grid-cols-2 gap-4 border-t border-line-soft pt-3">
              <Figure label="Livrées" value={formatInt(casa.deliveredCount)} sub={`${formatDh(casa.deliveredAmount)} · ${range.label}`} small />
              <Figure label="Retours" value={formatInt(casa.returnedCount)} sub={`${formatDh(casa.returnedAmount)} · ${range.label}`} small />
            </div>
          </div>
        </section>
      </div>

      {/* ── Transporteurs ─────────────────────────────────────────── */}
      <section aria-labelledby="h-carriers" className="flex flex-col gap-3">
        <SectionTitle id="h-carriers" title="Transporteurs" href={to("/stats")} linkLabel="Statistiques détaillées" />
        <div className="grid gap-3 md:grid-cols-2">
          <CarrierCard name="Forcelog" s={forcelog} href="/parcels" />
          <CarrierCard name="Ozon Express" s={ozon} href="/parcels" />
        </div>
        <p className="text-xs text-muted">
          Colis créés pendant la période ({range.label.toLowerCase()}). « Encaissé » = factures de règlement du transporteur sur la période.
        </p>
      </section>
    </>
  );
}

function SectionTitle({ id, title, href, linkLabel }: { id: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[15px] font-semibold">
        {title}
      </h2>
      {href && linkLabel && (
        <a href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-body no-underline hover:text-ink">
          {linkLabel}
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function Figure({ label, value, sub, small = false }: { label: string; value: React.ReactNode; sub?: React.ReactNode; small?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`truncate font-semibold tabular-nums ${small ? "text-xl" : "text-[26px] leading-tight tracking-tight"}`}>{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

function CarrierCard({ name, s, href }: { name: string; s: CarrierSummary; href: string }) {
  return (
    <div className="card flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{name}</h3>
        <a href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-body no-underline hover:text-ink">
          Colis
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>

      {s.sent === 0 && s.cashIn === null ? (
        <p className="text-sm text-muted">Aucun colis sur cette période.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Figure label="Colis envoyés" value={formatInt(s.sent)} />
            <Figure label="Montant livré" value={formatDh(s.deliveredAmount)} sub="livraisons payées à la livraison" />
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-line-soft pt-3">
            <Figure label="Livrés" value={formatInt(s.delivered)} sub={s.deliveryRate === null ? "—" : `${s.deliveryRate} %`} small />
            <Figure label="En cours" value={formatInt(s.ongoing)} small />
            <Figure label="Retours" value={formatInt(s.returns)} sub={s.returnRate === null ? "—" : `${s.returnRate} %`} small />
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-3 text-sm">
            <span className="text-muted">Encaissé (factures)</span>
            <span className="font-semibold tabular-nums">{s.cashIn === null ? "—" : formatDh(s.cashIn)}</span>
          </div>
        </>
      )}
    </div>
  );
}
