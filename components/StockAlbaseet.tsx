import { CheckCircle, MapPin, Warning } from "@phosphor-icons/react/dist/ssr";
import { readAlbaseetSale, readStockInfo } from "@/lib/stock-albaseet";
import { formatDateTimeMa } from "@/lib/format";

type Item = { stockInfo: unknown; albaseetSale: unknown; stockCheckedAt: Date | null };

// Où se trouve un article commandé (dépôts ALBASEET+) et s'il a déjà été vendu
// dans un magasin — données envoyées par le logiciel de stock du PC de bureau.
export default function StockAlbaseet({ item }: { item: Item }) {
  const vente = readAlbaseetSale(item.albaseetSale);
  const stock = readStockInfo(item.stockInfo);

  if (vente) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-pill-green-bg px-3 py-2 text-[13px] text-pill-green-fg">
        <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Vendu dans ALBASEET+ — article sorti du stock</div>
          <div>
            Facture n°{vente.facture} · {vente.depot} · {vente.date}
            {vente.vendeur ? ` · ${vente.vendeur}` : ""}
          </div>
        </div>
      </div>
    );
  }
  if (!stock) {
    return <div className="text-[13px] text-muted">Emplacement pas encore connu (logiciel de stock pas encore passé).</div>;
  }
  if (!stock.relie) {
    return (
      <div className="flex items-start gap-2 text-[13px] text-pill-amber-fg">
        <Warning size={16} className="mt-0.5 shrink-0" />
        <span>Produit pas encore relié à ALBASEET+ (onglet Shopify du logiciel de stock).</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      {stock.articles.map((a, k) => {
        const depots = a.depots.filter((d) => d.quantite > 0).sort((x, y) => Number(y.enLigne) - Number(x.enLigne) || y.quantite - x.quantite);
        return (
          <div key={k}>
            <div className="text-muted">
              ALBASEET+ : <span className="font-medium text-body">{a.nom}</span>
              {a.code ? <span className="font-mono"> · {a.code}</span> : null}
            </div>
            {depots.length === 0 ? (
              <div className="mt-1 font-medium text-accent">Aucun stock dans aucun dépôt</div>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {depots.map((d) => (
                  <li
                    key={d.depot}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${d.enLigne ? "bg-pill-green-bg text-pill-green-fg" : "bg-cream text-body"}`}
                    title={d.enLigne ? "Dépôt compté pour la vente en ligne" : "Dépôt non compté pour la vente en ligne"}
                  >
                    <MapPin size={13} weight="fill" />
                    {d.depot} <span className="font-semibold tabular-nums">{d.quantite}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <div className="text-xs text-muted">Pas encore vendu dans ALBASEET+{item.stockCheckedAt ? ` · vérifié ${formatDateTimeMa(item.stockCheckedAt)}` : ""}</div>
    </div>
  );
}
