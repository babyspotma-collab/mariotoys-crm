import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import PeriodFilter from "@/components/PeriodFilter";
import Pill, { type PillTone } from "@/components/Pill";
import { periodParams, periodRange } from "@/lib/date-range";
import { formatDh, formatInt } from "@/lib/format";
import { loadToLink, type ToLinkGroup } from "@/lib/profit/to-link";
import SuggestionPicker from "../_components/SuggestionPicker";
import { ProfitNav } from "../_components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KIND: Record<ToLinkGroup["kind"], { label: string; tone: PillTone }> = {
  VARIANT: { label: "Produit Shopify sans article ALBASEET+", tone: "blue" },
  LINES: { label: "Titre tapé à la main", tone: "amber" },
  MULTI: { label: "Plusieurs produits sur une ligne", tone: "red" },
  NO_PRICE: { label: "Article sans prix dans ALBASEET+", tone: "gray" },
};

// Ventes de la période sans coût d'achat (comptées à 0 DH sur la page
// Rentabilité), les plus grosses d'abord, avec les articles ALBASEET+ les plus
// probables à valider. Rien n'est relié sans clic sur « Valider ».
export default async function ToLinkPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const range = periodRange(searchParams);
  const keep = periodParams(range);
  const groups = await loadToLink(range);
  const total = groups.reduce((s, g) => s + g.amount, 0);
  const self = `/rentabilite/a-relier?${new URLSearchParams(keep)}`;
  const orderHref = (id: string) => `/orders/${id}?from=${encodeURIComponent(self)}`;

  return (
    <>
      <PageHeader title="Rentabilité" subtitle={`Ventes sans coût d'achat · ${range.label}`} />
      <ProfitNav active="/rentabilite/a-relier" />
      <PeriodFilter action="/rentabilite/a-relier" keep={{}} range={range} presets={["7d", "30d", "month", "custom"]} />

      {groups.length === 0 ? (
        <EmptyState title="Tout est relié">Toutes les ventes de la période ont un coût d&apos;achat.</EmptyState>
      ) : (
        <>
          <p className="text-sm text-body">
            <span className="font-semibold">{formatDh(total)}</span> de ventes confirmées sans coût d&apos;achat ({formatInt(groups.length)} produit(s), retours compris). Choisis
            le bon article puis « Valider » : le coût est pris en compte tout de suite. Le % indique la ressemblance des noms, vérifie avant de valider.
          </p>
          <ul className="flex flex-col gap-3">
            {groups.map((g) => {
              const kind = KIND[g.kind];
              const otherHref = g.kind === "VARIANT" ? `/rentabilite/articles?${new URLSearchParams({ f: "all", q: g.title.slice(0, 60) })}` : orderHref(g.orders[0].id);
              return (
                <li key={g.key} className="card flex flex-col gap-3 p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium">{g.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <Pill tone={kind.tone}>{kind.label}</Pill>
                        {g.orders.slice(0, 6).map((o) => (
                          <a key={o.id} href={orderHref(o.id)} className="underline">
                            {o.orderNumber}
                          </a>
                        ))}
                        {g.orders.length > 6 && <span>+{g.orders.length - 6}</span>}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatInt(g.quantity)} vendu(s) · <span className="font-semibold">{formatDh(g.amount)}</span>
                    </span>
                  </div>

                  {g.kind === "MULTI" ? (
                    <p className="text-sm text-muted">
                      Ouvre la commande puis « Relier au catalogue » pour découper la ligne en un produit par ligne.{" "}
                      <a href={orderHref(g.orders[0].id)} className="font-medium text-body underline">
                        Ouvrir {g.orders[0].orderNumber}
                      </a>
                    </p>
                  ) : g.kind === "NO_PRICE" ? (
                    <p className="text-sm text-muted">
                      L&apos;article ALBASEET+ (code {g.articleCode}) n&apos;a ni prix d&apos;achat ni prix de gros : ajoute son prix dans ALBASEET+, il sera repris à la prochaine
                      synchro.
                    </p>
                  ) : g.suggestions.length === 0 ? (
                    <p className="text-sm text-muted">
                      Aucun article ressemblant.{" "}
                      <a href={otherHref} className="font-medium text-body underline">
                        {g.kind === "VARIANT" ? "Choisir l'article à la main" : "Relier depuis la commande"}
                      </a>
                    </p>
                  ) : (
                    <SuggestionPicker suggestions={g.suggestions} variantId={g.kind === "VARIANT" ? g.variantId : null} itemIds={g.itemIds} otherHref={otherHref} />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
