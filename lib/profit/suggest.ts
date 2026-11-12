// Suggestions d'articles ALBASEET+ pour les ventes sans coût d'achat (écran
// /rentabilite/a-relier). Module pur, testé par suggest.check.ts.
//
// Un candidat = un article ALBASEET+ qui a un coût. On compare le titre de la
// ligne à sa désignation ET aux titres des produits Shopify déjà reliés à cet
// article (les titres tapés à la main ressemblent surtout aux titres Shopify) ;
// on garde la meilleure ressemblance. Une référence chiffrée commune (ex. 2601
// dans « MZ-10-2601 » et « VOITURE 10-2601 ») compte en plus.

import { similarity, tokens } from "./text";

export type SuggestArticle = { code: string; designation: string; unitCost: number; costLabel: string };
export type SuggestVariant = { id: string; name: string; code: string };
export type Suggestion = {
  code: string;
  designation: string;
  unitCost: number;
  costLabel: string;
  score: number; // 0 à 1
  via: { variantId: string; name: string } | null; // produit Shopify dont le titre ressemble le plus
};

type Source = { code: string; tokens: string[]; variant: { variantId: string; name: string } | null };

const isRef = (t: string) => /\d{3,}/.test(t);

export type Suggester = (title: string, limit?: number) => Suggestion[];

export function buildSuggester(articles: SuggestArticle[], variants: SuggestVariant[]): Suggester {
  const byCode = new Map(articles.map((a) => [a.code, a]));
  const sources: Source[] = [];
  for (const a of articles) sources.push({ code: a.code, tokens: tokens(a.designation), variant: null });
  for (const v of variants) if (byCode.has(v.code)) sources.push({ code: v.code, tokens: tokens(v.name), variant: { variantId: v.id, name: v.name } });

  const index = new Map<string, number[]>();
  sources.forEach((s, i) => {
    for (const t of s.tokens) {
      const list = index.get(t);
      if (list) list.push(i);
      else index.set(t, [i]);
    }
  });

  return (title, limit = 3) => {
    const t = tokens(title);
    const best = new Map<string, { score: number; via: Source["variant"] }>();
    const seen = new Set<number>();
    for (const w of t) {
      for (const i of index.get(w) ?? []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const s = sources[i];
        const { score, common } = similarity(t, s.tokens);
        if (common === 0) continue;
        const refBonus = t.some((x) => isRef(x) && s.tokens.includes(x)) ? 0.2 : 0;
        // Un seul mot commun ne suffit que s'il s'agit d'une référence chiffrée (ou d'un titre d'un mot).
        if (common < 2 && !refBonus && t.length > 1) continue;
        const total = Math.min(1, score + refBonus);
        const cur = best.get(s.code);
        // À score égal, on préfère passer par le produit Shopify (titre propre sur la commande).
        if (!cur || total > cur.score || (total === cur.score && s.variant && !cur.via)) best.set(s.code, { score: total, via: s.variant });
      }
    }
    return [...best.entries()]
      .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([code, { score, via }]) => {
        const a = byCode.get(code)!;
        return { code, designation: a.designation, unitCost: a.unitCost, costLabel: a.costLabel, score: Math.round(score * 100) / 100, via };
      });
  };
}

/** Ligne tapée à la main qui contient plusieurs produits (« Quad x1, Vespa x1 », « 2xVoiture… ») : à découper sur la fiche commande. */
export function looksMultiProduct(title: string): boolean {
  if (title.includes(",")) return true;
  if (/^\s*\d+\s*x\s*\S/i.test(title)) return true;
  // « … x1 » ailleurs qu'à la fin du titre : il y a un autre produit après.
  return /\bx\s?\d+\b/i.test(title.replace(/\s*\bx\s?\d+\s*$/i, ""));
}
