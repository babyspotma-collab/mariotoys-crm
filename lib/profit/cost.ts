// Coût d'achat retenu pour un article ALBASEET+, selon son type (choisi à la main
// sur /rentabilite/classement) et les prix en vigueur à une date donnée.
// Module pur, testé par cost.check.ts.
//
//   LOCAL (acheté localement) -> prix d'achat
//   IMPORTE                   -> prix de gros ; à défaut prix d'achat + alerte « prix de gros manquant »
//   NON_CLASSE                -> prix d'achat + alerte « à classer »
// Un prix à 0 ou vide est considéré comme absent.

export type CostTypeName = "LOCAL" | "IMPORTE" | "NON_CLASSE";
export type CostFlag = "A_CLASSER" | "GROS_MANQUANT" | "SANS_PRIX";
export type Prices = { prixAchat: number | null; prixGros: number | null };
export type PricePoint = Prices & { effectiveAt: Date };
export type CostArticle = Prices & { code: string; designation: string; costType: CostTypeName };

export type CostResult = {
  unitCost: number | null;
  source: "PRIX_ACHAT" | "PRIX_GROS" | null;
  costType: CostTypeName;
  flag: CostFlag | null;
  label: string; // ex. "Importé · prix de gros"
};

export const COST_TYPE_LABEL: Record<CostTypeName, string> = {
  LOCAL: "Acheté localement",
  IMPORTE: "Importé",
  NON_CLASSE: "Non classé",
};

const SHORT: Record<CostTypeName, string> = { LOCAL: "Local", IMPORTE: "Importé", NON_CLASSE: "Non classé" };

export const FLAG_LABEL: Record<CostFlag, string> = {
  A_CLASSER: "à classer",
  GROS_MANQUANT: "prix de gros manquant",
  SANS_PRIX: "sans prix d'achat",
};

const price = (v: number | null | undefined): number | null => (v === null || v === undefined || !Number.isFinite(v) || v <= 0 ? null : v);

/**
 * Prix en vigueur à la date `at` : dernier point de l'historique antérieur ou égal ;
 * si l'article n'était pas encore connu à cette date, le plus ancien prix connu ;
 * sans historique, les prix actuels.
 */
export function pricesAt(history: PricePoint[] | undefined, current: Prices, at: Date): Prices {
  if (!history || history.length === 0) return current;
  let found: PricePoint | null = null;
  for (const p of history) {
    if (p.effectiveAt.getTime() <= at.getTime()) {
      if (!found || p.effectiveAt.getTime() >= found.effectiveAt.getTime()) found = p;
    }
  }
  if (!found) found = history.reduce((a, b) => (b.effectiveAt.getTime() < a.effectiveAt.getTime() ? b : a));
  return { prixAchat: found.prixAchat, prixGros: found.prixGros };
}

export function resolveCost(costType: CostTypeName, prices: Prices): CostResult {
  const achat = price(prices.prixAchat);
  const gros = price(prices.prixGros);
  const base = { costType };
  if (costType === "IMPORTE") {
    if (gros !== null) return { ...base, unitCost: gros, source: "PRIX_GROS", flag: null, label: "Importé · prix de gros" };
    if (achat !== null) {
      return { ...base, unitCost: achat, source: "PRIX_ACHAT", flag: "GROS_MANQUANT", label: "Importé · prix d'achat (prix de gros manquant)" };
    }
  } else if (achat !== null) {
    return costType === "LOCAL"
      ? { ...base, unitCost: achat, source: "PRIX_ACHAT", flag: null, label: "Local · prix d'achat" }
      : { ...base, unitCost: achat, source: "PRIX_ACHAT", flag: "A_CLASSER", label: "Non classé · prix d'achat (à classer)" };
  }
  return { ...base, unitCost: null, source: null, flag: "SANS_PRIX", label: `${SHORT[costType]} · sans prix d'achat` };
}
