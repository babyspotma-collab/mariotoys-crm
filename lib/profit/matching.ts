// Association automatique variante Shopify -> article ALBASEET+. Module pur,
// testé par matching.check.ts. Dans l'ordre :
//   1. BARCODE     : même code-barres
//   2. DESIGNATION : SKU Shopify = désignation ALBASEET+ (casse, espaces multiples et
//                    espaces autour de * et - ignorés). Toutes les variantes qui
//                    partagent ce SKU vont au même article. Désignation en double
//                    dans ALBASEET+ = ambiguë, ignorée.
//   3. SKU         : SKU Shopify = code ALBASEET+ (ou l'un = le code-barres de l'autre)
//   4. NAME        : noms ressemblants (au moins 2 mots communs, ressemblance >= 0,6,
//                sans ex æquo) — marqué « à vérifier » sur /rentabilite/articles
// Un lien MANUAL n'est jamais touché. Un lien existant n'est remplacé que par une
// méthode plus sûre (NAME -> SKU -> DESIGNATION -> BARCODE), ou par un nom plus ressemblant.

import { similarity, tokens } from "./text";

export type MatchMethod = "BARCODE" | "DESIGNATION" | "SKU" | "NAME" | "MANUAL";
export type VariantForMatch = { id: string; productTitle: string; variantTitle: string | null; sku: string | null; barcode: string | null };
export type ArticleForMatch = { code: string; barcode: string | null; designation: string };
export type LinkState = { albaseetCode: string | null; method: string; score: number | null };
export type LinkUpsert = { variantId: string; albaseetCode: string; method: MatchMethod; score: number | null };

const RANK: Record<string, number> = { NAME: 1, SKU: 2, DESIGNATION: 3, BARCODE: 4, MANUAL: 99 };
export const NAME_MIN_SCORE = 0.6;

/** Code-barres comparable : chiffres et lettres seulement, zéros de tête retirés (UPC 12 = EAN 13 commençant par 0). */
export function normBarcode(s: string | null | undefined): string | null {
  const v = (s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^0+/, "");
  return v.length >= 4 ? v : null;
}

/** Code-barres d'au moins 8 chiffres : pour comparer un SKU ou un code à un code-barres sans faux positif. */
function longBarcode(s: string | null | undefined): string | null {
  const v = normBarcode(s);
  return v && v.length >= 8 ? v : null;
}

/** Référence comparable : lettres et chiffres en majuscules. */
export function normRef(s: string | null | undefined): string | null {
  const v = (s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return v.length >= 2 ? v : null;
}

/** Désignation / SKU comparable : sans accents, majuscules, espaces simples, pas d'espace autour de * et -. */
export function normDesignation(s: string | null | undefined): string | null {
  const v = (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s*([*-])\s*/g, "$1")
    .trim();
  return v.length >= 3 ? v : null;
}

export function variantName(v: Pick<VariantForMatch, "productTitle" | "variantTitle">): string {
  return v.variantTitle ? `${v.productTitle} ${v.variantTitle}` : v.productTitle;
}

function firstByKey<T extends { code: string }>(list: T[], key: (a: T) => string | null): Map<string, T> {
  const map = new Map<string, T>();
  for (const a of [...list].sort((x, y) => x.code.localeCompare(y.code))) {
    const k = key(a);
    if (k && !map.has(k)) map.set(k, a);
  }
  return map;
}

export function autoMatch(variants: VariantForMatch[], articles: ArticleForMatch[], links: Map<string, LinkState>): LinkUpsert[] {
  if (!articles.length || !variants.length) return [];
  const byBarcode = firstByKey(articles, (a) => normBarcode(a.barcode));
  const byCode = firstByKey(articles, (a) => normRef(a.code));
  const byCodeAsBarcode = firstByKey(articles, (a) => longBarcode(a.code));
  // Désignation -> article ; null si plusieurs articles ont la même désignation.
  const byDesignation = new Map<string, ArticleForMatch | null>();
  for (const a of articles) {
    const k = normDesignation(a.designation);
    if (k) byDesignation.set(k, byDesignation.has(k) ? null : a);
  }

  // Index des mots -> articles, pour ne comparer que les articles qui ont au moins un mot en commun.
  const articleTokens = articles.map((a) => tokens(a.designation));
  const index = new Map<string, number[]>();
  articleTokens.forEach((ts, i) => {
    for (const t of ts) {
      const list = index.get(t);
      if (list) list.push(i);
      else index.set(t, [i]);
    }
  });

  const out: LinkUpsert[] = [];
  for (const v of variants) {
    const current = links.get(v.id);
    const currentRank = current ? RANK[current.method] ?? 0 : 0;
    if (currentRank >= RANK.BARCODE) continue; // MANUAL ou BARCODE : rien de mieux possible

    const bc = normBarcode(v.barcode);
    // SKU = code : seulement un SKU avec au moins une lettre (un SKU comme « 879 » ou
    // « 25299 » tomberait par hasard sur un identifiant interne ALBASEET+).
    const sku = /[A-Za-z]/.test(v.sku ?? "") ? normRef(v.sku) : null;
    const skuAsBarcode = longBarcode(v.sku);
    const skuAsDesignation = normDesignation(v.sku);
    let found: LinkUpsert | null = null;
    const viaBarcode = bc ? byBarcode.get(bc) : undefined;
    const viaDesignation = skuAsDesignation ? byDesignation.get(skuAsDesignation) : undefined;
    if (viaBarcode) {
      found = { variantId: v.id, albaseetCode: viaBarcode.code, method: "BARCODE", score: null };
    } else if (viaDesignation) {
      found = { variantId: v.id, albaseetCode: viaDesignation.code, method: "DESIGNATION", score: null };
    } else {
      const viaSku = (sku && byCode.get(sku)) || (skuAsBarcode && byBarcode.get(skuAsBarcode)) || (bc && byCodeAsBarcode.get(bc)) || undefined;
      if (viaSku) found = { variantId: v.id, albaseetCode: viaSku.code, method: "SKU", score: null };
    }

    if (found) {
      if (RANK[found.method] > currentRank || (RANK[found.method] === currentRank && current?.albaseetCode !== found.albaseetCode)) out.push(found);
      continue;
    }
    if (currentRank >= RANK.SKU) continue;

    // Par le nom.
    const vt = tokens(variantName(v));
    const seen = new Set<number>();
    let best = { i: -1, score: 0 };
    let second = 0;
    for (const t of vt) {
      for (const i of index.get(t) ?? []) {
        if (seen.has(i)) continue;
        seen.add(i);
        const { score, common } = similarity(vt, articleTokens[i]);
        if (common < 2) continue;
        if (score > best.score) {
          second = best.score;
          best = { i, score };
        } else if (score > second) {
          second = score;
        }
      }
    }
    if (best.i < 0 || best.score < NAME_MIN_SCORE || best.score - second < 0.05) continue;
    const score = Math.round(best.score * 1000) / 1000;
    const code = articles[best.i].code;
    if (current?.method === "NAME" && (current.albaseetCode === code || (current.score ?? 0) >= score)) continue;
    out.push({ variantId: v.id, albaseetCode: code, method: "NAME", score });
  }
  return out;
}
