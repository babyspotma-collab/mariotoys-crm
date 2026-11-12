// Colonnes ALBASEET+ de l'export Excel des commandes : une ligne par produit,
// avec les prix en vigueur à la date de la commande et le coût retenu, calculés
// par le même code que la page Rentabilité (lib/profit/compute.ts → lineResolver).
// Module pur, testé par orders-export-profit.check.ts.

import type { ProfitLine } from "@/lib/profit/compute";
import { COST_TYPE_LABEL } from "@/lib/profit/cost";

export type ProfitCells = {
  designation: string; // « Non associé » si la ligne n'est reliée à aucun article ALBASEET+
  prixAchat: number | null;
  prixGros: number | null;
  type: string | null;
  coutUnitaire: number | null;
  coutTotal: number | null;
  ca: number | null; // part de la ligne dans le montant de la commande ; vide pour un retour
  marge: number | null;
  unlinked: boolean;
};

const price = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) || v <= 0 ? null : v);

/**
 * Cellules d'une commande, ligne par ligne. Le montant de la commande est réparti
 * entre ses lignes au prorata de prix × quantité, exactement comme le CA de la
 * page Rentabilité. `returned` : rien encaissé, donc ni CA ni marge.
 */
export function profitCells(orderCa: number, lines: ProfitLine[], returned: boolean): ProfitCells[] {
  const total = lines.reduce((s, l) => s + l.value, 0);
  return lines.map((l) => {
    const share = total > 0 ? l.value / total : 1 / lines.length;
    const ca = returned ? null : orderCa * share;
    if (!l.article) {
      return { designation: "Non associé", prixAchat: null, prixGros: null, type: null, coutUnitaire: null, coutTotal: null, ca, marge: null, unlinked: true };
    }
    const unit = l.cost?.unitCost ?? null;
    const coutTotal = unit === null ? null : unit * l.it.quantity;
    return {
      designation: l.article.designation,
      prixAchat: price(l.prices?.prixAchat),
      prixGros: price(l.prices?.prixGros),
      type: COST_TYPE_LABEL[l.article.costType],
      coutUnitaire: unit,
      coutTotal,
      ca,
      marge: ca !== null && coutTotal !== null ? ca - coutTotal : null,
      unlinked: false,
    };
  });
}
