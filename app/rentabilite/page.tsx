import { Warning } from "@phosphor-icons/react/dist/ssr";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import PeriodFilter from "@/components/PeriodFilter";
import Pill from "@/components/Pill";
import StatCard from "@/components/StatCard";
import { periodParams, periodRange } from "@/lib/date-range";
import { formatDh, formatInt } from "@/lib/format";
import type { CampaignRow, ProductRow } from "@/lib/profit/compute";
import { loadProfitReport } from "@/lib/profit/report";
import RefreshButton from "./_components/RefreshButton";
import { CostSource, ProfitNav, Signed, SyncLine, pct } from "./_components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rentabilité : bénéfice réel de la période (CA réel - achat - pub Meta -
// livraison - pertes sur retours). Calcul : lib/profit/compute.ts.
export default async function ProfitPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const range = periodRange(searchParams);
  const keep = periodParams(range);
  const { report, belowCost, settings, status, counts } = await loadProfitReport(range);
  const { kpi, alerts } = report;
  const showAll = searchParams.all === "1";
  const products = showAll ? report.products : report.products.slice(0, 40);
  const allHref = `/rentabilite?${new URLSearchParams({ ...keep, all: "1" })}`;

  const stockAge = status.stock ? (Date.now() - Date.parse(status.stock.at)) / 3600_000 : null;
  const alertCount =
    alerts.lossSales.length + belowCost.length + alerts.missingCost.length + alerts.toClassify.length + alerts.grosMissing.length +
    alerts.unprofitableCampaigns.length + alerts.unlinkedCampaigns.length + alerts.missingRates.length;

  return (
    <>
      <PageHeader title="Rentabilité" subtitle={`Bénéfice réel · ${range.label}`} actions={<RefreshButton />} />
      <ProfitNav active="/rentabilite" />
      <PeriodFilter action="/rentabilite" keep={{}} range={range} presets={["7d", "30d", "month", "custom"]} />
      <SyncLine status={status} />

      {/* ── Chiffres clés ─────────────────────────────────────────── */}
      <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Chiffre d'affaires" value={formatDh(kpi.ca)} sub={`${formatInt(kpi.salesCount)} commandes livrées + en cours`} />
        <StatCard
          label="Coût d'achat des ventes"
          value={formatDh(kpi.cogs)}
          sub={kpi.missingCostCa > 0 ? <span className="text-pill-amber-fg">{formatDh(kpi.missingCostCa)} de CA sans prix d'achat</span> : "tous les coûts connus"}
        />
        <StatCard label="Marge brute" value={formatDh(kpi.grossMargin)} sub={`${pct(kpi.ca > 0 ? kpi.grossMargin / kpi.ca : null)} du CA`} />
        <StatCard
          label="Pub Meta"
          value={formatDh(kpi.ads)}
          sub={`taux ${settings.usdToMad.toLocaleString("fr-FR")} · ${report.unattributedAds > 0 ? `${formatDh(report.unattributedAds)} non attribuée` : "toute attribuée"}`}
        />
        <StatCard label="Livraison" value={formatDh(kpi.delivery)} sub="transporteurs et livreurs Casa" />
        <StatCard label="Pertes sur retours" value={formatDh(kpi.returnLoss)} sub={`${formatInt(kpi.returnCount)} retours · ${settings.damagedReturnPct} % abîmés`} />
        <div className={`card flex min-w-0 flex-col p-4 ${kpi.net < 0 ? "border-accent/40" : ""}`}>
          <div className="text-[13px] font-medium text-muted">Bénéfice net</div>
          <div className={`mt-1 truncate text-[26px] font-semibold leading-tight tracking-tight tabular-nums ${kpi.net < 0 ? "text-accent" : ""}`}>{formatDh(kpi.net)}</div>
          <div className="mt-0.5 truncate text-[13px] text-muted">après achat, pub, livraison, retours</div>
        </div>
        <StatCard label="Marge nette" value={pct(kpi.marginPct)} sub="bénéfice net ÷ CA" />
      </section>
      {kpi.missingCostCa > 0 && (
        <p className="-mt-2 text-xs text-pill-amber-fg">
          Bénéfice surestimé : les ventes sans prix d&apos;achat sont comptées à 0 DH d&apos;achat ({counts.articles} articles ALBASEET+ reçus,{" "}
          {counts.linkedVariants} variantes Shopify associées sur {counts.variants}).
        </p>
      )}

      {/* ── Alertes ───────────────────────────────────────────────── */}
      <section aria-labelledby="h-alerts" className="flex flex-col gap-3">
        <h2 id="h-alerts" className="text-[15px] font-semibold">
          Alertes {alertCount > 0 && <span className="text-muted">· {alertCount}</span>}
        </h2>
        <div className="card divide-y divide-line-soft">
          {stockAge === null || stockAge > 48 ? (
            <AlertRow title={stockAge === null ? "Aucune donnée ALBASEET+ reçue" : "Données ALBASEET+ anciennes"} tone="red">
              {stockAge === null ? "L'appli de stock n'a encore rien envoyé à /api/stock-sync." : `Dernier envoi il y a ${Math.round(stockAge)} h.`}
            </AlertRow>
          ) : null}
          {status.meta && !status.meta.ok && <AlertRow title="Dépenses Meta non synchronisées" tone="red">{status.meta.message}</AlertRow>}
          {alerts.lossSales.length > 0 && (
            <AlertRow title="Vendu sous le prix d'achat" count={alerts.lossSales.length} tone="red">
              <ul className="flex flex-col gap-1">
                {alerts.lossSales.slice(0, 12).map((l, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-3">
                    <span className="min-w-0">{l.title} <span className="text-muted">· {l.orderNumber}{l.quantity > 1 ? ` · ×${l.quantity}` : ""}</span></span>
                    <span className="tabular-nums">payé {formatDh(l.paid)} · coût {formatDh(l.unitCost)} <span className="text-muted">({l.costLabel})</span></span>
                  </li>
                ))}
              </ul>
            </AlertRow>
          )}
          {belowCost.length > 0 && (
            <AlertRow title="Prix Shopify sous le coût d'achat" count={belowCost.length} tone="red">
              <ul className="flex flex-col gap-1">
                {belowCost.slice(0, 12).map((b) => (
                  <li key={b.variantId} className="flex flex-wrap justify-between gap-x-3">
                    <span className="min-w-0">{b.title}</span>
                    <span className="tabular-nums">prix {formatDh(b.price)} · coût {formatDh(b.unitCost)} <span className="text-muted">({b.costLabel})</span></span>
                  </li>
                ))}
              </ul>
            </AlertRow>
          )}
          {alerts.missingCost.length > 0 && (
            <AlertRow title="Produits vendus sans prix d'achat" count={alerts.missingCost.length} tone="amber" href="/rentabilite/articles?f=sold">
              <ul className="flex flex-col gap-1">
                {alerts.missingCost.slice(0, 10).map((m) => (
                  <li key={m.key} className="flex flex-wrap justify-between gap-x-3">
                    <span className="min-w-0">{m.title} <span className="text-muted">· {m.reason}</span></span>
                    <span className="tabular-nums">{formatInt(m.quantity)} vendu(s) · {formatDh(m.ca)}</span>
                  </li>
                ))}
              </ul>
            </AlertRow>
          )}
          {alerts.toClassify.length > 0 && (
            <AlertRow title="Articles vendus à classer (local ou importé)" count={alerts.toClassify.length} tone="amber" href="/rentabilite/classement?type=NON_CLASSE">
              {alerts.toClassify.slice(0, 8).map((a) => `${a.designation} (${a.quantity})`).join(" · ")}
            </AlertRow>
          )}
          {alerts.grosMissing.length > 0 && (
            <AlertRow title="Importés sans prix de gros (prix d'achat utilisé)" count={alerts.grosMissing.length} tone="amber" href="/rentabilite/classement?type=IMPORTE">
              {alerts.grosMissing.slice(0, 8).map((a) => `${a.designation} (${a.quantity})`).join(" · ")}
            </AlertRow>
          )}
          {alerts.unprofitableCampaigns.length > 0 && (
            <AlertRow title="Campagnes non rentables (ROAS réel < 1)" count={alerts.unprofitableCampaigns.length} tone="red" href="/rentabilite/campagnes">
              {alerts.unprofitableCampaigns.slice(0, 8).map((c) => `${c.name} (${c.roas?.toFixed(2).replace(".", ",")})`).join(" · ")}
            </AlertRow>
          )}
          {alerts.unlinkedCampaigns.length > 0 && (
            <AlertRow title="Campagnes avec dépense mais sans produit associé" count={alerts.unlinkedCampaigns.length} tone="amber" href="/rentabilite/campagnes">
              {alerts.unlinkedCampaigns.slice(0, 8).map((c) => `${c.name} (${formatDh(c.spendMad)})`).join(" · ")}
            </AlertRow>
          )}
          {alerts.missingRates.map((m) => (
            <AlertRow key={m.carrier} title={`Tarifs ${m.carrier === "OZON" ? "Ozon Express" : "Forcelog"} non renseignés`} tone="amber" href="/rentabilite/reglages">
              {m.orders} colis comptés à 0 DH de livraison sur la période.
            </AlertRow>
          ))}
          {alertCount === 0 && stockAge !== null && stockAge <= 48 && (!status.meta || status.meta.ok) && (
            <p className="p-4 text-sm text-muted">Aucune alerte sur cette période.</p>
          )}
        </div>
      </section>

      {/* ── Par produit ───────────────────────────────────────────── */}
      <section aria-labelledby="h-products" className="flex flex-col gap-3">
        <h2 id="h-products" className="text-[15px] font-semibold">
          Par produit <span className="text-muted">· {formatInt(report.products.length)}</span>
        </h2>
        {report.products.length === 0 ? (
          <EmptyState title="Aucune vente">Aucune commande livrée ou en cours sur cette période.</EmptyState>
        ) : (
          <ProductTable rows={products} unattributed={report.unattributedAds} />
        )}
        {!showAll && report.products.length > products.length && (
          <a href={allHref} className="btn-secondary w-fit">
            Voir les {formatInt(report.products.length)} produits
          </a>
        )}
      </section>

      {/* ── Par campagne Meta ─────────────────────────────────────── */}
      <section aria-labelledby="h-campaigns" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="h-campaigns" className="text-[15px] font-semibold">
            Par campagne Meta <span className="text-muted">· {formatInt(report.campaigns.length)}</span>
          </h2>
          <a href="/rentabilite/campagnes" className="text-[13px] font-medium text-body no-underline hover:text-ink">
            Associer les campagnes
          </a>
        </div>
        {report.campaigns.length === 0 ? (
          <EmptyState title="Aucune dépense Meta">
            {status.meta ? "Aucune dépense sur cette période." : "Les dépenses Meta n'ont pas encore été récupérées (jeton META_ACCESS_TOKEN)."}
          </EmptyState>
        ) : (
          <CampaignTable rows={report.campaigns} />
        )}
        <p className="text-xs text-muted">
          Marge générée = CA − achat − livraison − retours des produits associés (partagée entre campagnes selon leur dépense). ROAS réel = marge ÷ dépense : rentable à partir de 1.
        </p>
      </section>
    </>
  );
}

function AlertRow({ title, count, tone, href, children }: { title: string; count?: number; tone: "red" | "amber"; href?: string; children: React.ReactNode }) {
  return (
    <details className="group p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
        <Warning size={16} weight="fill" className={tone === "red" ? "text-accent" : "text-pill-amber-fg"} aria-hidden="true" />
        <span className="min-w-0 flex-1">{title}</span>
        {count !== undefined && <Pill tone={tone}>{formatInt(count)}</Pill>}
      </summary>
      <div className="mt-3 flex flex-col gap-2 text-[13px] text-body">
        {children}
        {href && (
          <a href={href} className="w-fit text-[13px] font-medium text-ink">
            Corriger →
          </a>
        )}
      </div>
    </details>
  );
}

function ProductTable({ rows, unattributed }: { rows: ProductRow[]; unattributed: number }) {
  return (
    <div className="card overflow-hidden">
      {/* Mobile : une carte par produit */}
      <ul className="divide-y divide-line-soft md:hidden">
        {rows.map((p) => (
          <li key={p.key} className="flex flex-col gap-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-sm font-medium">{p.title}</span>
              <Signed value={p.net} className="shrink-0 text-sm font-semibold" />
            </div>
            <div className="text-xs text-muted tabular-nums">
              {formatInt(p.qtySold)} vendu(s){p.qtyReturned ? ` · ${formatInt(p.qtyReturned)} retour(s)` : ""} · CA {formatDh(p.ca)} · achat {formatDh(p.cogs)}
              {p.ads > 0 ? ` · pub ${formatDh(p.ads)}` : ""} · {pct(p.marginPct)}
            </div>
            <CostSource label={p.costLabel} flag={p.missingCostQty > 0 ? "SANS_PRIX" : p.costFlag} />
          </li>
        ))}
        {unattributed > 0 && (
          <li className="flex justify-between gap-3 p-4 text-sm">
            <span className="text-muted">Pub non attribuée</span>
            <Signed value={-unattributed} className="font-semibold" />
          </li>
        )}
      </ul>
      {/* Ordinateur : tableau */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Produit</th>
              <th className="px-3 py-2.5 text-right font-medium">Qté</th>
              <th className="px-3 py-2.5 text-right font-medium">CA</th>
              <th className="px-3 py-2.5 text-right font-medium">Prix d&apos;achat</th>
              <th className="px-3 py-2.5 text-right font-medium">Marge brute</th>
              <th className="px-3 py-2.5 text-right font-medium">Livr. + retours</th>
              <th className="px-3 py-2.5 text-right font-medium">Part de pub</th>
              <th className="px-3 py-2.5 text-right font-medium">Bénéfice net</th>
              <th className="px-4 py-2.5 text-right font-medium">Marge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((p) => (
              <tr key={p.key} className="align-top">
                <td className="max-w-[320px] px-4 py-2.5">
                  <div className="font-medium">{p.title}</div>
                  <CostSource label={p.costLabel} flag={p.missingCostQty > 0 ? "SANS_PRIX" : p.costFlag} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatInt(p.qtySold)}
                  {p.qtyReturned > 0 && <div className="text-xs text-muted">{formatInt(p.qtyReturned)} ret.</div>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatDh(p.ca)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {p.unitCost === null ? <span className="text-pill-amber-fg">—</span> : formatDh(p.unitCost)}
                  {p.missingCostQty > 0 && p.unitCost !== null && <div className="text-xs text-pill-amber-fg">{p.missingCostQty} sans prix</div>}
                </td>
                <td className="px-3 py-2.5 text-right"><Signed value={p.ca - p.cogs} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatDh(p.delivery + p.returnLoss)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.ads > 0 ? formatDh(p.ads) : "—"}</td>
                <td className="px-3 py-2.5 text-right font-semibold"><Signed value={p.net} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{pct(p.marginPct)}</td>
              </tr>
            ))}
            {unattributed > 0 && (
              <tr>
                <td className="px-4 py-2.5 text-muted" colSpan={6}>Pub non attribuée (campagnes sans produit associé ou sans vente)</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatDh(unattributed)}</td>
                <td className="px-3 py-2.5 text-right font-semibold"><Signed value={-unattributed} /></td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoasPill({ c }: { c: CampaignRow }) {
  if (c.roas === null) return <span className="text-xs text-muted">{c.unattributedReason}</span>;
  return <Pill tone={c.roas >= 1 ? "green" : "red"}>{c.roas.toFixed(2).replace(".", ",")}</Pill>;
}

function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  const spendLabel = (c: CampaignRow) => `${c.spend.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${c.currency}`;
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-line-soft md:hidden">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 text-sm font-medium">{c.name}</span>
              <RoasPill c={c} />
            </div>
            <div className="text-xs text-muted tabular-nums">
              {formatDh(c.spendMad)} ({spendLabel(c)}) · marge {formatDh(c.margin)} · net <Signed value={c.net} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Campagne</th>
              <th className="px-3 py-2.5 text-right font-medium">Dépense</th>
              <th className="px-3 py-2.5 text-right font-medium">Associations</th>
              <th className="px-3 py-2.5 text-right font-medium">Marge générée</th>
              <th className="px-3 py-2.5 text-right font-medium">Bénéfice net</th>
              <th className="px-4 py-2.5 text-right font-medium">ROAS réel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="max-w-[320px] px-4 py-2.5 font-medium">{c.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatDh(c.spendMad)}
                  <div className="text-xs text-muted">{spendLabel(c)}</div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.linkedCount || <span className="text-pill-amber-fg">aucune</span>}</td>
                <td className="px-3 py-2.5 text-right"><Signed value={c.margin} /></td>
                <td className="px-3 py-2.5 text-right font-semibold"><Signed value={c.net} /></td>
                <td className="px-4 py-2.5 text-right"><RoasPill c={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
