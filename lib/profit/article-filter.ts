// Filtre de l'écran Classement (/rentabilite/classement), partagé avec l'action
// « classer tous les résultats du filtre ».

import type { CostType, Prisma } from "@prisma/client";

export const COST_TYPES: CostType[] = ["LOCAL", "IMPORTE", "NON_CLASSE"];
export const NONE = "__none"; // fournisseur / famille vide

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
  if (p.type && COST_TYPES.includes(p.type as CostType)) and.push({ costType: p.type as CostType });
  return and.length ? { AND: and } : {};
}
