// Formatage centralisé des montants — jusqu'ici chaque page faisait un
// Number(x) brut sans arrondi ni séparateur de milliers (bug : montants
// avec décimales affichés tels quels, ex "12499.5 DH" au lieu de
// "12 500 DH"). Toujours passer par ces helpers pour tout montant/compte
// affiché à l'écran.

type Moneyish = number | string | { toString(): string } | null | undefined;

export function formatDh(value: Moneyish): string {
  const num = toNumber(value);
  if (num === null) return "—";
  return `${Math.round(num).toLocaleString("fr-FR")} DH`;
}

export function formatInt(value: Moneyish): string {
  const num = toNumber(value);
  if (num === null) return "—";
  return Math.round(num).toLocaleString("fr-FR");
}

function toNumber(value: Moneyish): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(num) ? num : null;
}
