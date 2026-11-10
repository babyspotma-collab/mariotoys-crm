// Tarif de livraison d'un colis selon sa ville (table ShippingRate). Module pur,
// testé par city-rate.check.ts.
//
// Les transporteurs écrivent souvent la ville avec un quartier ou une région :
// "Casablanca - Californie", "Autre Quartier - Casablanca", "KENITRA VILLE",
// "Oulad hassoun-marrakech". On essaie donc, dans l'ordre : le nom complet, puis
// chaque morceau séparé par un tiret (le premier qui correspond gagne), le tout
// sans le mot "ville" ; enfin une faute de frappe d'une lettre sur un nom long.
// Toute ville inconnue prend le tarif par défaut (cityKey "*").

import { levenshtein, plain, textKey } from "./text";

export const DEFAULT_CITY_KEY = "*";

// Écritures connues d'une même ville (clés après textKey : lettres doublées
// déjà réduites, "Berrechid" -> "berechid").
const ALIASES: Record<string, string> = {
  fez: "fes",
  casa: "casablanca",
  darbeida: "casablanca",
  berechid: "berchid",
  tanja: "tanger",
  tangier: "tanger",
  marakesh: "marakech",
  ouarzazate: "ouarzazat",
};

export type RateRow = { cityKey: string; city: string; fee: number };
export type RateMatch = { fee: number | null; city: string | null; isDefault: boolean };

/** Clé normalisée d'une ville pour la table des tarifs. */
export function cityKey(name: string): string {
  const k = textKey(plain(name).replace(/\bville\b/g, " "));
  return ALIASES[k] ?? k;
}

export function findRate(cityName: string | null | undefined, rates: RateRow[]): RateMatch {
  const byKey = new Map(rates.map((r) => [r.cityKey, r]));
  const fallback = byKey.get(DEFAULT_CITY_KEY);
  const none: RateMatch = fallback ? { fee: fallback.fee, city: null, isDefault: true } : { fee: null, city: null, isDefault: true };
  if (!cityName || !cityName.trim()) return none;

  const candidates = [cityName, ...cityName.split(/\s*-\s*|\s*\/\s*|,/)].map(cityKey).filter(Boolean);
  for (const k of candidates) {
    const hit = byKey.get(k);
    if (hit && k !== DEFAULT_CITY_KEY) return { fee: hit.fee, city: hit.city, isDefault: false };
  }
  // Faute de frappe d'une lettre, seulement sur un nom assez long pour ne pas confondre deux villes.
  for (const k of candidates) {
    if (k.length < 7) continue;
    for (const r of rates) {
      if (r.cityKey !== DEFAULT_CITY_KEY && Math.abs(r.cityKey.length - k.length) <= 1 && levenshtein(r.cityKey, k) <= 1) {
        return { fee: r.fee, city: r.city, isDefault: false };
      }
    }
  }
  return none;
}
