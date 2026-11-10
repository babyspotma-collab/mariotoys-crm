import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import Pill from "@/components/Pill";
import SearchForm from "@/components/SearchForm";
import Segmented from "@/components/Segmented";
import { prisma } from "@/lib/db";
import { formatDh, formatInt } from "@/lib/format";
import { splitItemTitle } from "@/lib/profit/compute";
import { resolveCost } from "@/lib/profit/cost";
import { plain, textKey } from "@/lib/profit/text";
import ArticleLinkEditor from "../_components/ArticleLinkEditor";
import { CostSource, CostTypePill, ProfitNav } from "../_components/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const FILTERS = [
  { id: "sold", label: "Vendus sans prix d'achat" },
  { id: "unlinked", label: "Non associés" },
  { id: "name", label: "À vérifier" },
  { id: "linked", label: "Associés" },
  { id: "all", label: "Tous" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const METHOD: Record<string, { label: string; tone: "green" | "blue" | "amber" | "gray" }> = {
  BARCODE: { label: "Code-barres", tone: "green" },
  DESIGNATION: { label: "SKU = désignation", tone: "green" },
  SKU: { label: "SKU", tone: "green" },
  NAME: { label: "Nom · à vérifier", tone: "amber" },
  MANUAL: { label: "Manuel", tone: "blue" },
};

// Associations variante Shopify -> article ALBASEET+ (prix d'achat). Les liens
// automatiques (code-barres, SKU, nom) se corrigent ici ; un choix manuel n'est
// jamais remplacé par l'automatique.
export default async function ArticlesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const filter = (FILTERS.some((f) => f.id === searchParams.f) ? searchParams.f : "sold") as Filter;
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const since = new Date(Date.now() - 90 * 86_400_000);

  const [variants, links, articles, soldItems] = await Promise.all([
    prisma.shopifyVariant.findMany({ orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }] }),
    prisma.articleLink.findMany(),
    prisma.albaseetArticle.findMany({ select: { code: true, designation: true, barcode: true, costType: true, prixAchat: true, prixGros: true } }),
    prisma.orderItem.findMany({
      where: { order: { status: "CONFIRMEE", createdAt: { gte: since } } },
      select: { title: true, quantity: true, shopifyVariantId: true },
    }),
  ]);
  const linkBy = new Map(links.map((l) => [l.variantId, l]));
  const articleBy = new Map(articles.map((a) => [a.code, a]));

  // Quantités vendues sur 90 jours par variante (variante enregistrée, sinon retrouvée par le titre).
  const byTitle = new Map<string, string[]>();
  for (const v of variants) byTitle.set(textKey(v.productTitle), [...(byTitle.get(textKey(v.productTitle)) ?? []), v.id]);
  const sold = new Map<string, number>();
  for (const it of soldItems) {
    const ids = it.shopifyVariantId ? [it.shopifyVariantId] : (byTitle.get(textKey(splitItemTitle(it.title).base)) ?? []).slice(0, 1);
    for (const id of ids) sold.set(id, (sold.get(id) ?? 0) + it.quantity);
  }

  const rows = variants.map((v) => {
    const link = linkBy.get(v.id);
    const a = link?.albaseetCode ? articleBy.get(link.albaseetCode) : undefined;
    const cost = a ? resolveCost(a.costType, { prixAchat: a.prixAchat === null ? null : Number(a.prixAchat), prixGros: a.prixGros === null ? null : Number(a.prixGros) }) : null;
    return { v, link, a, cost, sold: sold.get(v.id) ?? 0 };
  });

  const counts: Record<Filter, number> = { sold: 0, unlinked: 0, name: 0, linked: 0, all: rows.length };
  const match = (r: (typeof rows)[number], f: Filter) =>
    f === "all" ||
    (f === "sold" && r.sold > 0 && r.cost?.unitCost == null) ||
    (f === "unlinked" && !r.a) ||
    (f === "name" && r.link?.method === "NAME") ||
    (f === "linked" && !!r.a);
  for (const r of rows) for (const f of ["sold", "unlinked", "name", "linked"] as Filter[]) if (match(r, f)) counts[f]++;

  const words = plain(q).split(" ").filter(Boolean);
  let shown = rows.filter((r) => match(r, filter));
  if (words.length) {
    shown = shown.filter((r) => {
      const hay = plain([r.v.productTitle, r.v.variantTitle, r.v.sku, r.v.barcode, r.a?.code, r.a?.designation].filter(Boolean).join(" "));
      return words.every((w) => hay.includes(w));
    });
  }
  if (filter === "sold") shown.sort((a, b) => b.sold - a.sold);
  const totalPages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const pageRows = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const url = (p: Record<string, string>) => `/rentabilite/articles?${new URLSearchParams({ f: filter, ...(q ? { q } : {}), ...p })}`;

  return (
    <>
      <PageHeader title="Rentabilité" subtitle="Articles · association ALBASEET+ ↔ Shopify" />
      <ProfitNav active="/rentabilite/articles" />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="Filtre"
          className="w-full overflow-x-auto md:w-fit"
          items={FILTERS.map((f) => ({ href: `/rentabilite/articles?${new URLSearchParams({ f: f.id, ...(q ? { q } : {}) })}`, label: f.label, count: counts[f.id], active: f.id === filter }))}
        />
        <SearchForm action="/rentabilite/articles" hidden={{ f: filter }} defaultValue={q} placeholder="Produit, SKU, code-barres, article…" label="Rechercher" />
      </div>
      <p className="text-xs text-muted">
        {formatInt(articles.length)} articles ALBASEET+ reçus · {formatInt(rows.length)} variantes Shopify. Association automatique : code-barres, puis SKU, puis nom (à vérifier). « Vendus » = sur les 90 derniers jours.
      </p>

      {pageRows.length === 0 ? (
        <EmptyState title="Rien à afficher">{filter === "sold" ? "Toutes les variantes vendues ont un prix d'achat." : "Aucune variante ne correspond."}</EmptyState>
      ) : (
        <ul className="card divide-y divide-line-soft">
          {pageRows.map(({ v, link, a, cost, sold: qty }) => (
            <li key={v.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start">
              <div className="flex min-w-0 gap-3">
                {v.imageUrl ? (
                  <img src={`${v.imageUrl}${v.imageUrl.includes("?") ? "&" : "?"}width=96`} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" loading="lazy" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-cream-dark" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium">{v.productTitle}{v.variantTitle ? <span className="text-muted"> — {v.variantTitle}</span> : null}</div>
                  <div className="text-xs text-muted">
                    {formatDh(v.price)}
                    {v.sku ? ` · SKU ${v.sku}` : ""}
                    {v.barcode ? ` · ${v.barcode}` : ""}
                    {qty > 0 ? ` · ${formatInt(qty)} vendu(s)` : ""}
                    {v.productStatus !== "ACTIVE" ? ` · ${v.productStatus === "DRAFT" ? "brouillon" : "archivé"}` : ""}
                  </div>
                </div>
              </div>
              <div className="min-w-0 text-sm">
                {a ? (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{a.designation}</span>
                      <CostTypePill type={a.costType} />
                    </div>
                    <div className="text-xs text-muted">
                      {a.code}
                      {a.barcode ? ` · ${a.barcode}` : ""} · {cost?.unitCost == null ? "sans prix" : formatDh(cost.unitCost)}
                    </div>
                    <CostSource label={cost?.label ?? null} flag={cost?.flag ?? null} />
                  </>
                ) : (
                  <span className="text-xs text-muted">{link?.method === "MANUAL" ? "Aucun article (choix manuel)" : "Aucun article associé"}</span>
                )}
                {link && (
                  <div className="mt-1">
                    <Pill tone={METHOD[link.method]?.tone ?? "gray"}>
                      {METHOD[link.method]?.label ?? link.method}
                      {link.method === "NAME" && link.score ? ` ${Math.round(link.score * 100)} %` : ""}
                    </Pill>
                  </div>
                )}
              </div>
              <ArticleLinkEditor variantId={v.id} method={link?.method ?? null} hasCode={!!a} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} hrefFor={(p) => url({ page: String(p) })} />
    </>
  );
}
