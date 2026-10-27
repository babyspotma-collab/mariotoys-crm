// Recherche de la page Commandes : chaque mot tapé doit se retrouver dans au
// moins un de ces champs — nom du client (nom et prénom, dans n'importe quel
// ordre), téléphone, nom d'un article, ville, n° de commande. Plusieurs mots =
// tous doivent correspondre ("amine casablanca", "benali pot").
//
// Module pur (renvoie seulement un filtre Prisma) : testé par order-search.check.ts.

import { normalizeMoroccanPhone } from "@/lib/phone";

const insensitive = "insensitive" as const;

export const MAX_SEARCH_WORDS = 6;

export function searchWords(q: string | undefined): string[] {
  return (q ?? "")
    .trim()
    .slice(0, 80)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_WORDS);
}

// Les numéros sont stockés avec des formats variés (+212…, 06…, espaces) : un mot
// qui ressemble à un numéro est cherché tel quel, en chiffres seuls et sous sa
// forme 06XXXXXXXX normalisée.
function phoneNeedles(word: string): string[] {
  const digits = word.replace(/\D/g, "");
  if (digits.length < 3) return [];
  const needles = new Set([word, digits, normalizeMoroccanPhone(word)]);
  if (digits.startsWith("212")) needles.add(`0${digits.slice(3)}`);
  return Array.from(needles).filter((n) => n.length >= 3);
}

export function orderSearchWhere(q: string | undefined) {
  const words = searchWords(q);
  if (words.length === 0) return {};
  return {
    AND: words.map((w) => ({
      OR: [
        { customerName: { contains: w, mode: insensitive } },
        { city: { contains: w, mode: insensitive } },
        { orderNumber: { contains: w, mode: insensitive } },
        { items: { some: { title: { contains: w, mode: insensitive } } } },
        ...phoneNeedles(w).map((n) => ({ phone: { contains: n } })),
      ],
    })),
  };
}
