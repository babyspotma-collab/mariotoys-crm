// Filtre de l'écran Classement (/rentabilite/classement), partagé avec l'action
// « classer tous les résultats du filtre ».

import type { CostType, Prisma } from "@prisma/client";
import { IMPORT_SUPPLIER } from "./cost";

export const COST_TYPES: CostType[] = ["LOCAL", "IMPORTE", "NON_CLASSE"];
export const NONE = "__none"; // fournisseur / famille vide

/** Articles sans fournisseur : les seuls dont le type vient du choix manuel. */
export const NO_SUPPLIER: Prisma.AlbaseetArticleWhereInput = { OR: [{ fournisseur: null }, { fournisseur: "" }] };
const IMPORT: Prisma.AlbaseetArticleWhereInput = { fournisseur: { startsWith: IMPORT_SUPPLIER, mode: "insensitive" } };

/** Même règle que costTypeOf (lib/profit/cost.ts), en requête. */
export function typeWhere(type: CostType): Prisma.AlbaseetArticleWhereInput {
  const manual: Prisma.AlbaseetArticleWhereInput = { AND: [NO_SUPPLIER, { costType: type }] };
  if (type === "IMPORTE") return { OR: [IMPORT, manual] };
  if (type === "LOCAL") return { OR: [{ AND: [{ NOT: NO_SUPPLIER }, { NOT: IMPORT }] }, manual] };
  return manual;
}

export type ArticleFilterParams = { q?: string; fournisseur?: string; famille?: string; type?: string };

export function articleFilter(p: ArticleFilterParams): Prisma.AlbaseetArticleWhereInput {
  const and: Prisma.AlbaseetArticleWhereInput[] = [];
  const q = String(p.q ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q) {
    for (const w of q.split(" ").slice(0, 5)) {
      and.push({ OR: [{ designation: { contains: w, mode: "insensitive" } }, { code: { contains: w, mode: "insensitive" } }, { barcode: { contains: w } }] });
    }
  }
  if (p.fournisseur) and.push({ fournisseur: p.fournisseur === NONE ? null : p.fournisseur });
  if (p.famille) and.push({ famille: p.famille === NONE ? null : p.famille });
  if (p.type && COST_TYPES.includes(p.type as CostType)) and.push(typeWhere(p.type as CostType));
  return and.length ? { AND: and } : {};
}
