import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import Segmented from "@/components/Segmented";
import { prisma } from "@/lib/db";
import { formatInt } from "@/lib/format";
import { articleFilter, COST_TYPES, NONE } from "@/lib/profit/article-filter";
import { costTypeOf, hasSupplier, resolveCost } from "@/lib/profit/cost";
import ClassifyTable, { type ClassifyRow } from "../_components/ClassifyTable";
import { ProfitNav } from "../_components/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;
const TYPES = [
  { id: "", label: "Tous" },
  { id: "NON_CLASSE", label: "Non classés" },
  { id: "LOCAL", label: "Achetés localement" },
  { id: "IMPORTE", label: "Importés" },
];

// Classement des articles ALBASEET+ : acheté localement (coût = prix d'achat),
// importé (coût = prix de gros) ou non classé (prix d'achat + alerte). Le type
// vient du fournisseur (HUIRIN = importé, autre = local) ; le choix manuel, par
// lot, ne s'applique qu'aux articles sans fournisseur.
export default async function ClassementPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const filter = {
    q: (searchParams.q ?? "").trim().slice(0, 80),
    fournisseur: searchParams.fournisseur ?? "",
    famille: searchParams.famille ?? "",
    type: TYPES.some((t) => t.id === searchParams.type) ? searchParams.type ?? "" : "",
  };
  const kept = Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) as Record<string, string>;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const where = articleFilter(filter);

  const [total, articles, byType, fournisseurs, familles] = await Promise.all([
    prisma.albaseetArticle.count({ where }),
    prisma.albaseetArticle.findMany({ where, orderBy: [{ designation: "asc" }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    Promise.all(COST_TYPES.map(async (t) => [t, await prisma.albaseetArticle.count({ where: articleFilter({ ...filter, type: t }) })] as const)),
    prisma.albaseetArticle.groupBy({ by: ["fournisseur"], _count: true, orderBy: { fournisseur: "asc" } }),
    prisma.albaseetArticle.groupBy({ by: ["famille"], _count: true, orderBy: { famille: "asc" } }),
  ]);
  const typeCount = (id: string) => (id ? byType.find(([t]) => t === id)?.[1] ?? 0 : byType.reduce((s, [, n]) => s + n, 0));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const url = (p: Record<string, string>) => `/rentabilite/classement?${new URLSearchParams({ ...kept, ...p })}`;

  const rows: ClassifyRow[] = articles.map((a) => {
    const prixAchat = a.prixAchat === null ? null : Number(a.prixAchat);
    const prixGros = a.prixGros === null ? null : Number(a.prixGros);
    const costType = costTypeOf(a);
    const c = resolveCost(costType, { prixAchat, prixGros });
    return { code: a.code, designation: a.designation, fournisseur: a.fournisseur, famille: a.famille, prixAchat, prixGros, costType, auto: hasSupplier(a.fournisseur), costLabel: c.label, unitCost: c.unitCost, flagged: !!c.flag };
  });

  return (
    <>
      <PageHeader title="Rentabilité" subtitle="Classement · acheté localement ou importé" />
      <ProfitNav active="/rentabilite/classement" />
      <Segmented
        label="Type"
        className="w-full overflow-x-auto md:w-fit"
        items={TYPES.map((t) => ({ href: url({ type: t.id }), label: t.label, count: typeCount(t.id), active: t.id === filter.type }))}
      />
      <form action="/rentabilite/classement" className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        {filter.type && <input type="hidden" name="type" value={filter.type} />}
        <label className="text-xs text-muted">
          Recherche
          <input name="q" type="search" defaultValue={filter.q} placeholder="Désignation, code, code-barres" className="input mt-1" />
        </label>
        <label className="text-xs text-muted">
          Fournisseur
          <select name="fournisseur" defaultValue={filter.fournisseur} className="input mt-1">
            <option value="">Tous</option>
            {fournisseurs.map((f) => (
              <option key={f.fournisseur ?? NONE} value={f.fournisseur ?? NONE}>
                {f.fournisseur ?? "(sans fournisseur)"} · {f._count}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Famille
          <select name="famille" defaultValue={filter.famille} className="input mt-1">
            <option value="">Toutes</option>
            {familles.map((f) => (
              <option key={f.famille ?? NONE} value={f.famille ?? NONE}>
                {f.famille ?? "(sans famille)"} · {f._count}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary">
          Filtrer
        </button>
      </form>
      <p className="text-xs text-muted">
        {formatInt(total)} article(s). Le type vient du fournisseur de la facture d&apos;achat : HUIRIN = importé (coût = prix de gros, prix d&apos;achat s&apos;il manque), tout autre
        fournisseur = acheté localement (coût = prix d&apos;achat). Le classement à la main ne sert que pour les articles sans fournisseur (non classé = prix d&apos;achat).
      </p>

      {rows.length === 0 ? (
        <EmptyState title="Aucun article">
          {typeCount("") === 0 && !filter.q ? "L'appli de stock n'a encore envoyé aucun article ALBASEET+." : "Aucun article ne correspond à ces filtres."}
        </EmptyState>
      ) : (
        <ClassifyTable rows={rows} filter={kept} total={total} />
      )}
      <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} hrefFor={(p) => url({ page: String(p) })} />
    </>
  );
}
