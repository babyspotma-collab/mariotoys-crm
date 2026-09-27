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

// ─── Période en un clic (Commandes, Colis, Facturation) ────────────────────
// Bornes calculées à l'heure légale du Maroc (Africa/Casablanca), pas en
// UTC : "Aujourd'hui" commence à minuit heure marocaine.

const TZ = "Africa/Casablanca";

export type Period = "today" | "7d" | "month" | "custom";
export type PeriodRange = {
  period: Period;
  start: Date;
  end: Date; // exclusive
  from: string; // YYYY-MM-DD (inclus), pour pré-remplir les champs
  to: string; // YYYY-MM-DD (inclus)
  label: string;
};

function offsetMinutes(at: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).format(at);
  const m = s.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === "+" ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** Minuit (heure du Maroc) du jour y-m-d ; m commence à 0, les dépassements (d = 32…) sont gérés par Date.UTC. */
function maMidnight(y: number, m: number, d: number): Date {
  const utc = Date.UTC(y, m, d);
  return new Date(utc - offsetMinutes(new Date(utc)) * 60_000);
}

function maToday(now = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return { y: parts[0], m: parts[1] - 1, d: parts[2] };
}

function ymd(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m, d));
  return date.toISOString().slice(0, 10);
}

function parseYmd(s?: string): { y: number; m: number; d: number } | null {
  const match = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  return ymd(y, m, d) === s ? { y, m, d } : null;
}

const frDate = (s: string) => s.split("-").reverse().join("/");

export function periodRange(params: { period?: string; from?: string; to?: string }, now = new Date()): PeriodRange {
  const t = maToday(now);

  if (params.period === "today") {
    return { period: "today", start: maMidnight(t.y, t.m, t.d), end: maMidnight(t.y, t.m, t.d + 1), from: ymd(t.y, t.m, t.d), to: ymd(t.y, t.m, t.d), label: "Aujourd'hui" };
  }
  if (params.period === "7d") {
    return { period: "7d", start: maMidnight(t.y, t.m, t.d - 6), end: maMidnight(t.y, t.m, t.d + 1), from: ymd(t.y, t.m, t.d - 6), to: ymd(t.y, t.m, t.d), label: "7 derniers jours" };
  }
  if (params.period === "custom") {
    let a = parseYmd(params.from) ?? { y: t.y, m: t.m, d: 1 };
    let b = parseYmd(params.to) ?? t;
    if (ymd(a.y, a.m, a.d) > ymd(b.y, b.m, b.d)) [a, b] = [b, a];
    const from = ymd(a.y, a.m, a.d);
    const to = ymd(b.y, b.m, b.d);
    return { period: "custom", start: maMidnight(a.y, a.m, a.d), end: maMidnight(b.y, b.m, b.d + 1), from, to, label: from === to ? `Le ${frDate(from)}` : `Du ${frDate(from)} au ${frDate(to)}` };
  }
  return {
    period: "month",
    start: maMidnight(t.y, t.m, 1),
    end: maMidnight(t.y, t.m + 1, 1),
    from: ymd(t.y, t.m, 1),
    to: ymd(t.y, t.m + 1, 0),
    label: monthLabel(ymd(t.y, t.m, 1).slice(0, 7)),
  };
}

/** Paramètres d'URL à conserver pour une période (vide pour le défaut "mois en cours"). */
export function periodParams(r: PeriodRange): Record<string, string> {
  if (r.period === "month") return {};
  if (r.period === "custom") return { period: "custom", from: r.from, to: r.to };
  return { period: r.period };
}
