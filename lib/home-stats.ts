// Chiffres de la page d'Accueil (vue d'ensemble) : commandes, top 5 villes
// Shopify, Forcelog, Ozon Express et Livraison Casablanca, sur la période choisie.
//
// Parties pures (fusion des villes, rangement des statuts transporteur,
// résumés) séparées de l'accès à la base : testables sans base de données
// (lib/home-stats.check.ts). Les règles de catégorie sont celles de la page
// Statistiques (lib/parcel-categories.ts, lib/ozon-categories.ts) : un colis
// "livré" ici l'est aussi là-bas.
//
// Base (Neon, plan gratuit : le temps d'éveil compte) : UNE requête groupée par
// sujet, 6 au total, jamais une requête par ligne.

import { prisma } from "@/lib/db";
import { categoryById } from "@/lib/parcel-categories";
import { ozonCategoryById } from "@/lib/ozon-categories";

type Range = { start: Date; end: Date };
type Money = unknown; // Prisma Decimal | number | string | null

const num = (v: Money): number => (v === null || v === undefined ? 0 : Number(String(v)));

// ─── Top villes ──────────────────────────────────────────────────────────────

export type CityRow = { label: string; count: number; share: number };

export function normalizeCity(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// "casablanca" / "CASABLANCA" -> "Casablanca" ; une écriture déjà mixte est gardée.
function prettyCity(name: string): string {
  const t = name.trim().replace(/\s+/g, " ");
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

// Abréviations courantes saisies dans les formulaires, rattachées à la ville complète.
const CITY_ALIASES: Record<string, string> = {
  csa: "casablanca",
  casa: "casablanca",
  mrk: "marrakech",
  rbt: "rabat",
  tnj: "tanger",
};
const cityKey = (name: string): string => {
  const k = normalizeCity(name);
  return CITY_ALIASES[k] ?? k;
};

/** Regroupe les variantes d'une même ville (casse, accents, espaces) et renvoie les `limit` premières. */
export function topCities(
  rows: { city: string | null; count: number }[],
  limit = 5
): { cities: CityRow[]; total: number; withoutCity: number } {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const groups = new Map<string, { count: number; variants: Map<string, number> }>();
  let withoutCity = 0;
  for (const r of rows) {
    const key = r.city ? cityKey(r.city) : "";
    if (!key) {
      withoutCity += r.count;
      continue;
    }
    const g = groups.get(key) ?? { count: 0, variants: new Map() };
    g.count += r.count;
    g.variants.set(r.city!, (g.variants.get(r.city!) ?? 0) + r.count);
    groups.set(key, g);
  }
  const cities = [...groups.entries()]
    .map(([key, g]) => {
      const all = [...g.variants.entries()];
      // Écriture complète de préférence à une abréviation ("Marrakech" plutôt que "Mrk").
      const full = all.filter(([v]) => normalizeCity(v) === key);
      const best = (full.length ? full : all).sort((a, b) => b[1] - a[1])[0][0];
      return { label: prettyCity(best), count: g.count, share: total > 0 ? Math.round((g.count / total) * 100) : 0 };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"))
    .slice(0, limit);
  return { cities, total, withoutCity };
}

// ─── Commandes ───────────────────────────────────────────────────────────────

export type OrdersSummary = {
  total: number;
  confirmed: number;
  nouvelle: number;
  annulee: number;
  confirmedAmount: number;
  avgBasket: number | null;
  confirmationRate: number | null;
};

export function summarizeOrders(groups: { status: string; count: number; amount: Money }[]): OrdersSummary {
  const by = (s: string) => groups.find((g) => g.status === s);
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  const confirmed = by("CONFIRMEE")?.count ?? 0;
  const confirmedAmount = num(by("CONFIRMEE")?.amount);
  return {
    total,
    confirmed,
    nouvelle: by("NOUVELLE")?.count ?? 0,
    annulee: by("ANNULEE")?.count ?? 0,
    confirmedAmount,
    avgBasket: confirmed > 0 ? Math.round(confirmedAmount / confirmed) : null,
    confirmationRate: total > 0 ? Math.round((confirmed / total) * 100) : null,
  };
}

// ─── Transporteurs ───────────────────────────────────────────────────────────

export type ParcelBucket = "delivered" | "ongoing" | "returns" | "other";

const FORCELOG_ONGOING = ["shipped", "delivering", "relaunchNewClient"] as const;
const OZON_ONGOING = ["shipped", "delivering"] as const;

const forcelogCodes = {
  delivered: new Set(categoryById("delivered").codes),
  returns: new Set(categoryById("cancelled").codes),
  ongoing: new Set(FORCELOG_ONGOING.flatMap((id) => categoryById(id).codes)),
};
const ozonStatuses = {
  delivered: new Set(ozonCategoryById("delivered").statuses),
  returns: new Set(ozonCategoryById("cancelled").statuses),
  ongoing: new Set(OZON_ONGOING.flatMap((id) => ozonCategoryById(id).statuses)),
};

/** Livré / en cours de livraison / retour (refusé, annulé, retourné) / autre (sans réponse, hors zone, non catégorisé). */
export function parcelBucket(carrier: "FORCELOG" | "OZON", statusCode: string | null, status: string): ParcelBucket {
  if (carrier === "FORCELOG") {
    if (statusCode && forcelogCodes.delivered.has(statusCode)) return "delivered";
    if (statusCode && forcelogCodes.returns.has(statusCode)) return "returns";
    if (statusCode && forcelogCodes.ongoing.has(statusCode)) return "ongoing";
    return "other";
  }
  if (ozonStatuses.delivered.has(status)) return "delivered";
  if (ozonStatuses.returns.has(status)) return "returns";
  if (ozonStatuses.ongoing.has(status)) return "ongoing";
  return "other";
}

export type CarrierSummary = {
  sent: number;
  delivered: number;
  deliveredAmount: number;
  ongoing: number;
  returns: number;
  other: number;
  deliveryRate: number | null;
  returnRate: number | null;
  // Factures de règlement (CRBT) de la période : montant encaissé et nombre de colis facturés.
  cashIn: number | null;
};

export type ParcelGroup = { carrier: "FORCELOG" | "OZON"; statusCode: string | null; status: string; count: number; amount: Money };
export type InvoiceGroup = { carrier: "FORCELOG" | "OZON"; amount: Money; parcelsCount: number | null };

export function summarizeCarrier(
  carrier: "FORCELOG" | "OZON",
  parcels: ParcelGroup[],
  invoices: InvoiceGroup[]
): CarrierSummary {
  const s: CarrierSummary = {
    sent: 0, delivered: 0, deliveredAmount: 0, ongoing: 0, returns: 0, other: 0, deliveryRate: null, returnRate: null, cashIn: null,
  };
  for (const g of parcels) {
    if (g.carrier !== carrier) continue;
    s.sent += g.count;
    const b = parcelBucket(carrier, g.statusCode, g.status);
    s[b] += g.count;
    if (b === "delivered") s.deliveredAmount += num(g.amount);
  }
  s.deliveryRate = s.sent > 0 ? Math.round((s.delivered / s.sent) * 100) : null;
  s.returnRate = s.sent > 0 ? Math.round((s.returns / s.sent) * 100) : null;
  const inv = invoices.filter((i) => i.carrier === carrier);
  const billed = inv.reduce((sum, i) => sum + (i.parcelsCount ?? 0), 0);
  s.cashIn = billed > 0 ? inv.reduce((sum, i) => sum + num(i.amount), 0) : null;
  return s;
}

// ─── Livraison Casablanca ────────────────────────────────────────────────────

export type CasaSummary = {
  pendingCount: number;
  pendingAmount: number;
  couriers: { name: string; count: number; amount: number }[];
  deliveredCount: number;
  deliveredAmount: number;
  returnedCount: number;
  returnedAmount: number;
};

export function summarizeCasa(
  pending: { courier: string | null; count: number; amount: Money }[],
  period: { status: string | null; count: number; amount: Money }[]
): CasaSummary {
  const couriers = pending
    .map((p) => ({ name: p.courier ?? "—", count: p.count, amount: num(p.amount) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "fr"));
  const by = (s: string) => period.find((p) => p.status === s);
  return {
    pendingCount: couriers.reduce((s, c) => s + c.count, 0),
    pendingAmount: couriers.reduce((s, c) => s + c.amount, 0),
    couriers,
    deliveredCount: by("LIVREE")?.count ?? 0,
    deliveredAmount: num(by("LIVREE")?.amount),
    returnedCount: by("RETOUR")?.count ?? 0,
    returnedAmount: num(by("RETOUR")?.amount),
  };
}

// ─── Accès base ──────────────────────────────────────────────────────────────

export type HomeStats = {
  orders: OrdersSummary;
  shopifyCities: ReturnType<typeof topCities>;
  forcelog: CarrierSummary;
  ozon: CarrierSummary;
  casa: CasaSummary;
};

export async function getHomeStats(range: Range): Promise<HomeStats> {
  const created = { createdAt: { gte: range.start, lt: range.end } };
  const parcelDate = { carrierCreatedAt: { gte: range.start, lt: range.end } };

  const [orderGroups, cityGroups, parcelGroups, invoiceGroups, casaPending, casaPeriod] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: created, _count: true, _sum: { totalPrice: true } }),
    // Villes des commandes SHOPIFY uniquement (pas les commandes saisies à la main).
    prisma.order.groupBy({ by: ["city"], where: { ...created, source: "SHOPIFY" }, _count: true }),
    prisma.parcel.groupBy({ by: ["carrier", "statusCode", "status"], where: parcelDate, _count: true, _sum: { price: true } }),
    prisma.crbtInvoice.groupBy({
      by: ["carrier"],
      where: { cDate: { gte: range.start, lt: range.end } },
      _sum: { amount: true, parcelsCount: true },
    }),
    // Chez les livreurs MAINTENANT (instantané, pas limité à la période).
    prisma.order.groupBy({
      by: ["localCourier"],
      where: { localDelivery: true, localStatus: "A_LIVRER" },
      _count: true,
      _sum: { totalPrice: true },
    }),
    // Livrées / retours dont le statut a changé pendant la période.
    prisma.order.groupBy({
      by: ["localStatus"],
      where: { localDelivery: true, localStatus: { in: ["LIVREE", "RETOUR"] }, localStatusChangedAt: { gte: range.start, lt: range.end } },
      _count: true,
      _sum: { totalPrice: true },
    }),
  ]);

  const parcels: ParcelGroup[] = parcelGroups.map((g) => ({
    carrier: g.carrier, statusCode: g.statusCode, status: g.status, count: g._count, amount: g._sum.price,
  }));
  const invoices: InvoiceGroup[] = invoiceGroups.map((g) => ({
    carrier: g.carrier, amount: g._sum.amount, parcelsCount: g._sum.parcelsCount,
  }));

  return {
    orders: summarizeOrders(orderGroups.map((g) => ({ status: g.status, count: g._count, amount: g._sum.totalPrice }))),
    shopifyCities: topCities(cityGroups.map((g) => ({ city: g.city, count: g._count })), 5),
    forcelog: summarizeCarrier("FORCELOG", parcels, invoices),
    ozon: summarizeCarrier("OZON", parcels, invoices),
    casa: summarizeCasa(
      casaPending.map((g) => ({ courier: g.localCourier, count: g._count, amount: g._sum.totalPrice })),
      casaPeriod.map((g) => ({ status: g.localStatus, count: g._count, amount: g._sum.totalPrice }))
    ),
  };
}
