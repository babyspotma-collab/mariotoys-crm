// Recherche de produits dans une liste de titres déjà chargée : sans accents ni
// casse, chaque mot tapé peut se trouver n'importe où dans le titre (ordre
// libre). Module pur, testé par lib/product-match.check.ts.

export type CatalogueEntry = { id: string; title: string; price: number; status: string };

export const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "'");

type Indexed = CatalogueEntry & { folded: string };

export function indexCatalogue(entries: CatalogueEntry[]): Indexed[] {
  return entries.map((e) => ({ ...e, folded: fold(e.title) }));
}

/** Meilleures correspondances d'abord : titre qui commence par la saisie, puis mot qui commence par elle, puis le reste ; produits actifs avant brouillons/archivés. */
export function matchProducts(index: Indexed[], query: string, limit: number): CatalogueEntry[] {
  const q = fold(query).replace(/\s+/g, " ").trim();
  if (q.length < 2) return [];
  const words = q.split(" ").filter(Boolean).slice(0, 6);
  const scored: { e: Indexed; score: number }[] = [];
  for (const e of index) {
    if (!words.every((w) => e.folded.includes(w))) continue;
    const startsWith = e.folded.startsWith(q);
    const wordStart = words.every((w) => e.folded.startsWith(w) || e.folded.includes(` ${w}`) || e.folded.includes(`-${w}`));
    const score = (e.status === "ACTIVE" ? 0 : 10) + (startsWith ? 0 : wordStart ? 2 : 4) + e.title.length / 1000;
    scored.push({ e, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map(({ e: { folded: _f, ...entry } }) => entry);
}
