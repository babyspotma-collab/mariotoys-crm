import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyAutoConfirmations } from "@/lib/auto-confirm";
import { ozonCategoryById } from "@/lib/ozon-categories";

const DELIVERED_STATUSES = ozonCategoryById("delivered").statuses;

// Reçoit les données extraites du dashboard web Ozon Express
// (client.ozoneexpress.ma) par scripts/sync-ozon-web.js (GitHub Actions
// uniquement). Même garde CRON_SECRET et même logique de rattachement
// best-effort par téléphone que /api/cron/sync-forcelog-web — voir ce
// fichier pour le détail du raisonnement.

type ScrapedParcel = {
  code: string;
  receiver: string;
  phone: string;
  cityName: string;
  price: number;
  status: string;
  carrierCreatedAt: string | null; // "YYYY-MM-DD HH:mm"
};
type ScrapedInvoice = {
  ref: string; // ex: VRT-N-2733902-240926-53-56768
  cDate: string; // "YYYY-MM-DD HH:mm"
  payDate: string | null;
  statut: string;
  parcelsCount: number;
  amount: number;
  // CRBT total - montant net, calculé depuis l'export Excel du virement par
  // scripts/sync-ozon-web.js ; null/absent si l'export était illisible.
  feesAmount?: number | null;
};

function parseOzonDate(raw: string | null): Date | null {
  if (!raw) return null;
  const iso = raw.trim().replace(" ", "T");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { parcels?: ScrapedParcel[]; invoices?: ScrapedInvoice[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parcels = body.parcels ?? [];
  const invoices = body.invoices ?? [];
  // Même principe que sync-forcelog-web : on lit l'existant en 3 requêtes,
  // on compare en mémoire et on n'écrit que le nouveau ou le modifié (au
  // lieu d'une lecture + une écriture par ligne toutes les 2 h).
  const [existingParcels, freeOrders, existingInvoices] = await Promise.all([
    prisma.parcel.findMany({
      where: { carrier: "OZON" },
      select: { code: true, orderId: true, deliveredAt: true, receiver: true, cityName: true, price: true, status: true },
    }),
    prisma.order.findMany({ where: { parcels: { none: { carrier: "OZON" } } }, select: { id: true, phone: true } }),
    prisma.crbtInvoice.findMany({ where: { carrier: "OZON" } }),
  ]);
  const parcelByCode = new Map(existingParcels.map((x) => [x.code, x]));
  const orderIdByPhone = new Map<string, string>();
  for (const o of freeOrders) if (o.phone && !orderIdByPhone.has(o.phone)) orderIdByPhone.set(o.phone, o.id);
  const invoiceByRef = new Map(existingInvoices.map((x) => [x.ref, x]));

  let parcelsUpserted = 0;
  let parcelsUnchanged = 0;
  let parcelsLinked = 0;

  for (const p of parcels) {
    const carrierCreatedAt = parseOzonDate(p.carrierCreatedAt);
    const existing = parcelByCode.get(p.code);

    // Posé une seule fois, au run où le statut entre dans la catégorie
    // "delivered" — jamais réécrit ensuite (sert au délai moyen de
    // livraison, Statistiques — voir sync-forcelog-web pour le même
    // raisonnement côté Forcelog).
    const justDelivered = DELIVERED_STATUSES.includes(p.status);
    const deliveredAt = existing?.deliveredAt ?? (justDelivered ? new Date() : null);

    // Rattachement par téléphone, jamais remis en cause une fois établi.
    let orderId = existing?.orderId ?? null;
    if (!orderId && p.phone) {
      const found = orderIdByPhone.get(p.phone);
      if (found) {
        orderId = found;
        orderIdByPhone.delete(p.phone);
        parcelsLinked++;
      }
    }

    const unchanged =
      !!existing &&
      existing.orderId === orderId &&
      existing.receiver === p.receiver &&
      existing.cityName === p.cityName &&
      Number(existing.price) === Number(p.price) &&
      existing.status === p.status;
    if (unchanged) {
      parcelsUnchanged++;
      continue;
    }

    await prisma.parcel.upsert({
      where: { carrier_code: { carrier: "OZON", code: p.code } },
      create: {
        carrier: "OZON",
        code: p.code,
        orderId,
        receiver: p.receiver,
        phone: p.phone,
        cityName: p.cityName,
        price: p.price,
        status: p.status,
        carrierCreatedAt,
        deliveredAt,
      },
      update: {
        orderId,
        deliveredAt,
        receiver: p.receiver,
        cityName: p.cityName,
        price: p.price,
        status: p.status,
      },
    });
    parcelsUpserted++;
  }

  let invoicesUpserted = 0;
  let invoicesUnchanged = 0;
  for (const inv of invoices) {
    const cDate = parseOzonDate(inv.cDate);
    if (!cDate) continue; // date de création obligatoire, ligne ignorée sinon

    // Frais : seulement si le script a pu les calculer — sinon on ne touche
    // pas à la valeur déjà en base (null plutôt qu'un 0 trompeur).
    const fees = typeof inv.feesAmount === "number" && inv.feesAmount >= 0 ? { feesAmount: inv.feesAmount } : {};
    const payDate = parseOzonDate(inv.payDate);
    const old = invoiceByRef.get(inv.ref);
    if (
      old &&
      (old.payDate?.getTime() ?? null) === (payDate?.getTime() ?? null) &&
      old.statut === inv.statut &&
      old.parcelsCount === inv.parcelsCount &&
      Number(old.amount) === Number(inv.amount) &&
      (fees.feesAmount === undefined || (old.feesAmount !== null && Number(old.feesAmount) === fees.feesAmount))
    ) {
      invoicesUnchanged++;
      continue;
    }

    await prisma.crbtInvoice.upsert({
      where: { ref: inv.ref },
      create: {
        ref: inv.ref,
        carrier: "OZON",
        cDate,
        payDate,
        statut: inv.statut,
        parcelsCount: inv.parcelsCount,
        amount: inv.amount,
        ...fees,
      },
      update: {
        payDate,
        statut: inv.statut,
        parcelsCount: inv.parcelsCount,
        amount: inv.amount,
        ...fees,
      },
    });
    invoicesUpserted++;
  }

  // Colis à jour -> confirme les commandes déjà expédiées (voir
  // lib/auto-confirm.ts). Une erreur ici n'annule pas la synchro des colis,
  // elle est remontée dans la réponse (visible dans les logs GitHub Actions).
  let autoConfirm: { autoConfirmed: number; toReview: number } | { error: string };
  try {
    autoConfirm = await applyAutoConfirmations();
  } catch (err) {
    autoConfirm = { error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({
    parcelsReceived: parcels.length,
    parcelsUpserted,
    parcelsUnchanged,
    parcelsLinked,
    invoicesUpserted,
    invoicesUnchanged,
    autoConfirm,
  });
}
