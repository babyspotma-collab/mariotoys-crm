// Bornes [début, fin) d'un mois "YYYY-MM", utilisées pour filtrer les
// commandes sur les pages Commandes/Facturation/Statistiques (même pattern
// partagé partout, un seul calcul de plage de dates).

export type MonthRange = { start: Date; end: Date; month: string };

export function monthRange(month?: string): MonthRange {
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getUTCMonth();

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const normalized = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;

  return { start, end, month: normalized };
}

/** Libellé français du mois ("Septembre 2026") pour affichage. */
export function monthLabel(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1, 1));
  const label = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
