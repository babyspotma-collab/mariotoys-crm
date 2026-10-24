// Liaison avec le logiciel de stock ALBASEET+ (programme local du PC de bureau).
// Formats échangés via app/api/worker/stock/* et affichés sur la fiche commande.

export type StockDepot = { depot: string; quantite: number; enLigne: boolean };
export type StockArticle = { nom: string; code: string | null; depots: StockDepot[] };
export type StockInfo = { relie: boolean; articles: StockArticle[] };
// id = identifiant interne de la facture ALBASEET+ (renvoyé tel quel au programme pour qu'il ne la réattribue jamais)
export type AlbaseetSale = { id: string; facture: string; depot: string; date: string; vendeur: string | null };
export type StockReportItem = { id: string; stockInfo: StockInfo; albaseetSale: AlbaseetSale | null };

const MAX_ITEMS = 2000;

function str(v: unknown, champ: string): string {
  if (typeof v !== "string") throw new Error(`${champ} : texte attendu`);
  return v.slice(0, 500);
}

function num(v: unknown, champ: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${champ} : nombre attendu`);
  return v;
}

// Validation stricte de ce qu'envoie le programme local : on ne stocke que les
// champs connus, jamais l'objet brut.
export function parseStockReport(body: unknown): StockReportItem[] {
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error("items : liste attendue");
  if (items.length > MAX_ITEMS) throw new Error(`items : ${MAX_ITEMS} au maximum`);
  return items.map((raw, n) => {
    const r = raw as Record<string, any>;
    const s = r?.stockInfo;
    if (!s || !Array.isArray(s.articles)) throw new Error(`items[${n}].stockInfo invalide`);
    const stockInfo: StockInfo = {
      relie: Boolean(s.relie),
      articles: s.articles.slice(0, 20).map((a: any, k: number) => ({
        nom: str(a?.nom, `items[${n}].articles[${k}].nom`),
        code: a?.code == null ? null : str(a.code, "code"),
        depots: (Array.isArray(a?.depots) ? a.depots : []).slice(0, 50).map((d: any) => ({
          depot: str(d?.depot, "depot"),
          quantite: num(d?.quantite, "quantite"),
          enLigne: Boolean(d?.enLigne),
        })),
      })),
    };
    const v = r?.albaseetSale;
    const albaseetSale: AlbaseetSale | null =
      v == null
        ? null
        : {
            id: str(v.id, "id"),
            facture: str(v.facture, "facture"),
            depot: str(v.depot, "depot"),
            date: str(v.date, "date"),
            vendeur: v.vendeur == null ? null : str(v.vendeur, "vendeur"),
          };
    return { id: str(r?.id, `items[${n}].id`), stockInfo, albaseetSale };
  });
}

// Lecture tolérante de ce qui est en base (Json) pour l'affichage.
export function readStockInfo(v: unknown): StockInfo | null {
  const s = v as StockInfo | null;
  return s && Array.isArray(s.articles) ? s : null;
}

export function readAlbaseetSale(v: unknown): AlbaseetSale | null {
  const s = v as AlbaseetSale | null;
  return s && typeof s.facture === "string" ? s : null;
}
