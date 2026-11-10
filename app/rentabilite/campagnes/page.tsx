import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import Pill from "@/components/Pill";
import Segmented from "@/components/Segmented";
import { prisma } from "@/lib/db";
import { formatDh, formatInt } from "@/lib/format";
import { getSettings, getSyncStatus } from "@/lib/profit/settings";
import { similarity, tokens } from "@/lib/profit/text";
import CampaignTargets, { type Suggestion } from "../_components/CampaignTargets";
import { ProfitNav, SyncLine } from "../_components/ui";

export const dynamic = "force-dynamic";

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(d);

// Association des campagnes Meta Ads à des produits ou collections Shopify : la
// dépense d'une campagne est ensuite répartie entre ses produits selon leur CA.
export default async function CampagnesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const showAll = searchParams.f === "all";
  const since = new Date(`${ymd(new Date(Date.now() - 29 * 86_400_000))}T00:00:00Z`);
  const [campaigns, spend, links, products, collections, settings, status] = await Promise.all([
    prisma.metaCampaign.findMany(),
    prisma.metaSpendDaily.groupBy({ by: ["campaignId"], where: { date: { gte: since } }, _sum: { spend: true } }),
    prisma.campaignLink.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.shopifyVariant.findMany({ where: { productStatus: "ACTIVE" }, distinct: ["productId"], select: { productId: true, productTitle: true } }),
    prisma.shopifyCollection.findMany(),
    getSettings(),
    getSyncStatus(),
  ]);
  const spendBy = new Map(spend.map((s) => [s.campaignId, Number(s._sum.spend ?? 0)]));
  const accountName = new Map(settings.metaAccounts.map((a) => [a.id, a.name]));
  const linksBy = new Map<string, typeof links>();
  for (const l of links) linksBy.set(l.campaignId, [...(linksBy.get(l.campaignId) ?? []), l]);

  const productTokens = products.map((p) => ({ p, t: tokens(p.productTitle) }));
  const collectionTokens = collections.map((c) => ({ c, t: tokens(c.title) }));
  // Suggestions : produits / collections dont le nom ressemble à celui de la campagne.
  const suggest = (name: string, taken: Set<string>): Suggestion[] => {
    const t = tokens(name.replace(/\b(copie|campagne|test|scale|2k\d\d|\d{4})\b/gi, " "));
    if (!t.length) return [];
    const scored = [
      ...productTokens.map(({ p, t: pt }) => ({ s: { type: "PRODUCT" as const, id: p.productId, title: p.productTitle }, ...similarity(t, pt) })),
      ...collectionTokens.map(({ c, t: ct }) => ({ s: { type: "COLLECTION" as const, id: c.id, title: c.title }, ...similarity(t, ct) })),
    ].filter((x) => x.common >= Math.min(2, t.length) && x.score >= 0.3 && !taken.has(x.s.id));
    return scored.sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.s);
  };

  const rows = campaigns
    .map((c) => ({ c, spend: spendBy.get(c.id) ?? 0, links: linksBy.get(c.id) ?? [] }))
    .filter((r) => showAll || r.spend > 0 || r.links.length > 0)
    .sort((a, b) => b.spend - a.spend || a.c.name.localeCompare(b.c.name));
  const unlinkedWithSpend = rows.filter((r) => r.spend > 0 && r.links.length === 0).length;

  return (
    <>
      <PageHeader title="Rentabilité" subtitle="Campagnes Meta · association aux produits" />
      <ProfitNav active="/rentabilite/campagnes" />
      <Segmented
        label="Filtre"
        items={[
          { href: "/rentabilite/campagnes", label: "Avec dépense (30 j)", active: !showAll },
          { href: "/rentabilite/campagnes?f=all", label: "Toutes", count: campaigns.length, active: showAll },
        ]}
      />
      <SyncLine status={status} />
      <p className="text-xs text-muted">
        La dépense d&apos;une campagne est répartie entre ses produits associés selon leur chiffre d&apos;affaires. Les suggestions (cadre pointillé) viennent du nom de
        la campagne : un clic pour les accepter.{unlinkedWithSpend > 0 ? ` ${unlinkedWithSpend} campagne(s) avec dépense ne sont associées à rien.` : ""}
      </p>

      {rows.length === 0 ? (
        <EmptyState title="Aucune campagne">
          {campaigns.length === 0 ? "Les campagnes Meta n'ont pas encore été récupérées : vérifiez META_ACCESS_TOKEN puis « Actualiser » sur la vue d'ensemble." : "Aucune dépense sur les 30 derniers jours."}
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line-soft">
          {rows.map(({ c, spend: s, links: l }) => (
            <li key={c.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.status === "ACTIVE" && <Pill tone="green">Active</Pill>}
                  {s > 0 && l.length === 0 && <Pill tone="amber">Non associée</Pill>}
                </div>
                <div className="text-xs text-muted tabular-nums">
                  {accountName.get(c.accountId) ?? c.accountId} · 30 j : {s.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} {c.currency}
                  {s > 0 ? ` (${formatDh(s * (c.currency === "MAD" ? 1 : settings.usdToMad))})` : ""}
                </div>
              </div>
              <CampaignTargets
                campaignId={c.id}
                links={l.map((x) => ({ id: x.id, type: x.targetType, title: x.targetTitle }))}
                suggestions={l.length ? [] : suggest(c.name, new Set(l.map((x) => x.targetId)))}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{formatInt(campaigns.length)} campagne(s) connue(s) sur {settings.metaAccounts.map((a) => a.name).join(", ")}.</p>
    </>
  );
}
