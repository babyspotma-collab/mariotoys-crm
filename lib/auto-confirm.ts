import type { Carrier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeMoroccanPhone } from "@/lib/phone";

// Confirmation automatique des commandes déjà expédiées : un colis
// Forcelog/Ozon existe, donc la commande correspondante a forcément été
// confirmée (par téléphone, hors CRM). Règle validée par l'utilisateur :
//   - rapprochement par téléphone normalisé d'abord, puis par nom ;
//   - UNE seule commande correspond (et elle est NOUVELLE) -> CONFIRMEE +
//     autoConfirmedAt ;
//   - plusieurs commandes, ou nom seul sans téléphone -> rien n'est
//     modifié, le cas est listé "À vérifier" ;
//   - jamais une commande ANNULEE ni déjà CONFIRMEE (l'écriture filtre
//     sur status NOUVELLE, même si les données changent entre-temps).
//
// findAutoConfirmations() ne fait que lire (utilisé aussi par la page
// Commandes pour afficher "À vérifier") ; applyAutoConfirmations() écrit,
// appelé à la fin de chaque synchronisation Forcelog / Ozon.

// Une commande ne peut pas correspondre à un colis créé avant elle ; 1 jour
// de marge car la date côté transporteur n'a pas de fuseau fiable.
const CLOCK_SLACK_MS = 24 * 60 * 60 * 1000;

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

type ParcelRef = { id: string; carrier: Carrier; code: string; receiver: string; phone: string };
type OrderRef = { id: string; orderNumber: string; customerName: string; phone: string; status: string };

export type AutoConfirmMatch = { order: OrderRef; parcel: ParcelRef };
export type ReviewItem = { parcel: ParcelRef; reason: "multiple" | "nameOnly"; candidates: OrderRef[] };

export async function findAutoConfirmations(): Promise<{ toConfirm: AutoConfirmMatch[]; toReview: ReviewItem[] }> {
  const [orders, parcels] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: ["NOUVELLE", "CONFIRMEE"] } },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        phone: true,
        status: true,
        createdAt: true,
        forcelogCode: true,
        ozonCode: true,
        parcels: { select: { id: true } },
      },
    }),
    prisma.parcel.findMany({
      select: {
        id: true,
        carrier: true,
        code: true,
        receiver: true,
        phone: true,
        carrierCreatedAt: true,
        order: { select: { status: true } },
      },
    }),
  ]);

  const byPhone = new Map<string, typeof orders>();
  const byName = new Map<string, typeof orders>();
  for (const o of orders) {
    const phone = normalizeMoroccanPhone(o.phone);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), o]);
    const name = normalizeName(o.customerName);
    if (name) byName.set(name, [...(byName.get(name) ?? []), o]);
  }
  const ownCodes = new Set(orders.flatMap((o) => [o.forcelogCode, o.ozonCode]).filter(Boolean));

  const toConfirm = new Map<string, AutoConfirmMatch>();
  const toReview: ReviewItem[] = [];

  for (const p of parcels) {
    // Colis déjà rattaché à une commande traitée (confirmée ou annulée),
    // ou créé depuis le CRM : il appartient déjà à sa commande.
    if ((p.order && p.order.status !== "NOUVELLE") || ownCodes.has(p.code)) continue;

    const parcel: ParcelRef = { id: p.id, carrier: p.carrier, code: p.code, receiver: p.receiver, phone: p.phone };
    const before = (o: (typeof orders)[number]) =>
      !p.carrierCreatedAt || o.createdAt.getTime() <= p.carrierCreatedAt.getTime() + CLOCK_SLACK_MS;
    // Une commande confirmée qui a déjà son propre colis n'est plus candidate.
    const free = (o: (typeof orders)[number]) =>
      o.status === "NOUVELLE" ||
      (![o.forcelogCode, o.ozonCode].some((c) => c && c !== p.code) && o.parcels.every((x) => x.id === p.id));
    const ref = (o: (typeof orders)[number]): OrderRef => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      phone: normalizeMoroccanPhone(o.phone),
      status: o.status,
    });

    const phone = normalizeMoroccanPhone(p.phone);
    const phoneMatches = (phone ? byPhone.get(phone) ?? [] : []).filter((o) => before(o) && free(o));
    const nouvelles = phoneMatches.filter((o) => o.status === "NOUVELLE");

    if (phoneMatches.length === 1 && nouvelles.length === 1) {
      if (!toConfirm.has(nouvelles[0].id)) toConfirm.set(nouvelles[0].id, { order: ref(nouvelles[0]), parcel });
      continue;
    }
    if (phoneMatches.length > 1 && nouvelles.length > 0) {
      toReview.push({ parcel, reason: "multiple", candidates: phoneMatches.map(ref) });
      continue;
    }
    if (phoneMatches.length === 0) {
      const name = normalizeName(p.receiver);
      const nameMatches = (name ? byName.get(name) ?? [] : []).filter((o) => o.status === "NOUVELLE" && before(o));
      if (nameMatches.length > 0) toReview.push({ parcel, reason: "nameOnly", candidates: nameMatches.map(ref) });
    }
  }

  // Une commande confirmée ici ne doit pas aussi apparaître "À vérifier".
  const reviewed = toReview.filter((r) => !r.candidates.every((c) => toConfirm.has(c.id)));
  return { toConfirm: [...toConfirm.values()], toReview: reviewed };
}

export async function applyAutoConfirmations(): Promise<{ autoConfirmed: number; toReview: number }> {
  const { toConfirm, toReview } = await findAutoConfirmations();
  let autoConfirmed = 0;
  for (const { order, parcel } of toConfirm) {
    // Filtre status NOUVELLE dans l'écriture elle-même : une commande
    // annulée ou confirmée entre la lecture et ici n'est jamais touchée.
    const res = await prisma.order.updateMany({
      where: { id: order.id, status: "NOUVELLE" },
      data: { status: "CONFIRMEE", autoConfirmedAt: new Date(), carrier: parcel.carrier },
    });
    if (res.count === 0) continue;
    autoConfirmed++;
    await prisma.parcel.updateMany({ where: { id: parcel.id, orderId: null }, data: { orderId: order.id } });
  }
  return { autoConfirmed, toReview: toReview.length };
}
