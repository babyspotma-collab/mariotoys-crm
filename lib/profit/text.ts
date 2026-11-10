// Comparaison de textes pour la page Rentabilité : noms de villes, désignations
// ALBASEET+, titres Shopify, noms de campagnes Meta. Module pur (testé par
// text.check.ts), utilisable côté serveur et client.

/** Minuscules, sans accents, chaque suite de caractères non alphanumériques remplacée par un espace. */
export function plain(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Clé de comparaison stricte : sans accents, casse, espaces ni ponctuation, et
 * lettres doublées réduites ("Tit Mellil" = "tit melil" = "TIT-MELIL").
 */
export function textKey(s: string): string {
  return plain(s).replace(/\s+/g, "").replace(/(\D)\1+/g, "$1");
}

/** Distance d'édition (insertion, suppression, substitution). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Mots sans valeur pour rapprocher deux noms de produit.
const STOP = new Set([
  "de", "du", "des", "la", "le", "les", "l", "d", "et", "a", "au", "aux", "en", "pour", "avec", "sans", "un", "une",
  "the", "and", "for", "with", "x", "par", "sur", "copie", "variante", "default", "title",
]);

/** Mots significatifs d'un nom de produit (normalisés, lettres doublées réduites). */
export function tokens(s: string): string[] {
  const out = new Set<string>();
  for (const w of plain(s).split(" ")) {
    if (!w || STOP.has(w)) continue;
    if (w.length < 2 && !/\d/.test(w)) continue;
    out.add(w.replace(/(\D)\1+/g, "$1"));
  }
  return [...out];
}

/** Ressemblance de deux listes de mots (coefficient de Dice, 0 à 1) et nombre de mots communs. */
export function similarity(a: string[], b: string[]): { score: number; common: number } {
  if (!a.length || !b.length) return { score: 0, common: 0 };
  const set = new Set(b);
  let common = 0;
  for (const w of a) if (set.has(w)) common++;
  return { score: (2 * common) / (a.length + b.length), common };
}
