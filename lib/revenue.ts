// Chiffre d'affaires RÉEL : une commande confirmée ne compte que lorsqu'elle est
// livrée. Les autres sont rangées à part (en cours, pas encore expédiée, retour),
// pour ne plus gonfler le chiffre avec des colis jamais créés, jamais partis ou refusés.
//
// Parties pures (classement, totaux) testées par revenue.check.ts ; l'accès à la
// base est en bas, une seule requête.

import { prisma } from "@/lib/db";
import { parcelBucket } from "@/lib/home-stats";
import { isReturned, type ExportOrder } from "@/lib/orders-export";

export type RevenueState = "livree" | "en_cours" | "a_expedier" | "retour";

export type RevenueOrder = Pick<
  ExportOrder,
  "totalPrice" | "localDelivery" | "localCourier" | "localStatus" | "forcelogCode" | "ozonCode" | "forcelogStatusCode" | "forcelogStatus" | "ozonStatus" | "parcels"
>;

// Colis créé chez le transporteur mais pas encore pris en charge ("Nouveau", en attente de ramassage…).
const NOT_PICKED_UP = /nouveau|attente|ramass|pr[ée]par|cr[ée]/i;

const toNumber = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : Number(String(v)));

export function revenueState(o: RevenueOrder): RevenueState {
  // Casablanca : pris en charge par un livreur (n'importe lequel) = vraie vente ; sans livreur = pas parti.
  if (o.localDelivery) {
    if (o.localStatus === "LIVREE") return "livree";
    if (o.localStatus === "RETOUR") return "retour";
    return o.localCourier ? "en_cours" : "a_expedier";
  }

  const last = o.parcels[0]; // le plus récent
  if (last && parcelBucket(last.carrier, last.statusCode, last.status) === "delivered") return "livree";
  if (isReturned(o)) return "retour";
  if (o.forcelogCode && parcelBucket("FORCELOG", o.forcelogStatusCode, o.forcelogStatus ?? "") === "delivered") return "livree";
  if (o.ozonCode && parcelBucket("OZON", null, o.ozonStatus ?? "") === "delivered") return "livree";

  // Jamais de colis créé : confirmée mais pas expédiée.
  if (!last && !o.forcelogCode && !o.ozonCode) return "a_expedier";

  const carrier = last?.carrier ?? (o.forcelogCode ? "FORCELOG" : "OZON");
  const statusCode = last ? last.statusCode : carrier === "FORCELOG" ? o.forcelogStatusCode : null;
  const status = last ? last.status : ((carrier === "FORCELOG" ? o.forcelogStatus : o.ozonStatus) ?? "");
  const bucket = parcelBucket(carrier, statusCode, status);
  if (bucket === "ongoing") return "en_cours";
  // Colis créé mais jamais pris en charge (aucun statut de transport) : pas réellement parti.
  if (bucket === "other" && (status === "" || NOT_PICKED_UP.test(status))) return "a_expedier";
  return "en_cours";
}

export type RevenueSummary = {
  delivered: { count: number; amount: number };
  ongoing: { count: number; amount: number };
  notShipped: { count: number; amount: number };
  returned: { count: number; amount: number };
  // Chiffre d'affaires : commandes réellement parties (livrées + en cours). Sans les non expédiées ni les retours.
  sales: { count: number; amount: number };
  confirmedCount: number;
  confirmedAmount: number;
  avgBasket: number | null; // sur le chiffre d'affaires
};

export function summarizeRevenue(orders: RevenueOrder[]): RevenueSummary {
  const zero = () => ({ count: 0, amount: 0 });
  const s: RevenueSummary = {
    delivered: zero(), ongoing: zero(), notShipped: zero(), returned: zero(), sales: zero(), confirmedCount: 0, confirmedAmount: 0, avgBasket: null,
  };
  const slot = { livree: s.delivered, en_cours: s.ongoing, a_expedier: s.notShipped, retour: s.returned };
  for (const o of orders) {
    const amount = toNumber(o.totalPrice);
    const state = revenueState(o);
    const b = slot[state];
    b.count += 1;
    b.amount += amount;
    if (state === "livree" || state === "en_cours") {
      s.sales.count += 1;
      s.sales.amount += amount;
    }
    s.confirmedCount += 1;
    s.confirmedAmount += amount;
  }
  s.avgBasket = s.sales.count > 0 ? Math.round(s.sales.amount / s.sales.count) : null;
  return s;
}

/** Commandes confirmées créées dans la période, classées par état de livraison. */
export async function getRevenue(range: { start: Date; end: Date }): Promise<RevenueSummary> {
  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMEE", createdAt: { gte: range.start, lt: range.end } },
    select: {
      totalPrice: true,
      localDelivery: true,
      localCourier: true,
      localStatus: true,
      forcelogCode: true,
      ozonCode: true,
      forcelogStatusCode: true,
      forcelogStatus: true,
      ozonStatus: true,
      parcels: { select: { carrier: true, statusCode: true, status: true }, orderBy: { carrierCreatedAt: { sort: "desc", nulls: "last" } }, take: 1 },
    },
  });
  return summarizeRevenue(orders);
}
