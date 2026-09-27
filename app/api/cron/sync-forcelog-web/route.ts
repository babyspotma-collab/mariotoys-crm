import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyAutoConfirmations } from "@/lib/auto-confirm";
import { categoryById } from "@/lib/parcel-categories";

const DELIVERED_CODES = categoryById("delivered").codes;

// Reçoit les données extraites du dashboard web Forcelog par
// scripts/sync-forcelog-web.js (exécuté dans GitHub Actions, jamais sur
// Vercel — voir ce script pour le pourquoi). Même garde CRON_SECRET que
// /api/cron/sync-tracking.
//
// Upsert dans Parcel (voir prisma/schema.prisma) : la vraie liste
// complète des colis Forcelog, pas seulement ceux liés à une commande du
// CRM. Un colis est rattaché à une commande locale (orderId) uniquement
// si son numéro de téléphone correspond exactement à une commande encore
// non rattachée — best-effort, jamais écrasé une fois établi.

type ScrapedParcel = {
  code: string;
  receiver: string;
  phone: string;
  cityName: string;
  price: number;
  status: string;
  statusCode: string | null;
  carrierCreatedAt: string | null; // "YYYY-MM-DD HH:mm"
};
type ScrapedInvoice = {
  ref: string;
  cDate: string; // "2026-09-10 20:24"
  payDate: string | null;
  statut: string;
  parcelsCount: number;
  fees: number;
  feesAmount: number;
  balance: number;
  amount: number;
};

function parseForcelogDate(raw: string | null): Date | null {
  if (!raw) return null;
  // Format Forcelog "YYYY-MM-DD HH:mm" — remplacer l'espace par un "T"
  // pour un parsing ISO fiable côté Node.
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

  let parcelsUpserted = 0;
  let parcelsLinked = 0;

  for (const p of parcels) {
    const existing = await prisma.parcel.findUnique({
      where: { carrier_code: { carrier: "FORCELOG", code: p.code } },
      select: { orderId: true, deliveredAt: true },
    });

    // Posé une seule fois, au run où le statut entre dans la catégorie
    // "delivered" — jamais réécrit ensuite, même si le statut change à
    // nouveau plus tard (sert au délai moyen de livraison, Statistiques).
    const justDelivered = p.statusCode ? DELIVERED_CODES.includes(p.statusCode) : false;
    const deliveredAt = existing?.deliveredAt ?? (justDelivered ? new Date() : null);

    if (!p.phone) {
      await prisma.parcel.upsert({
        where: { carrier_code: { carrier: "FORCELOG", code: p.code } },
        create: {
          carrier: "FORCELOG",
          code: p.code,
          receiver: p.receiver,
          phone: p.phone,
          cityName: p.cityName,
          price: p.price,
          status: p.status,
          statusCode: p.statusCode,
          carrierCreatedAt: parseForcelogDate(p.carrierCreatedAt),
          deliveredAt,
        },
        update: {
          receiver: p.receiver,
          cityName: p.cityName,
          price: p.price,
          status: p.status,
          statusCode: p.statusCode,
          deliveredAt,
        },
      });
      parcelsUpserted++;
      continue;
    }

    // Ne cherche une commande à rattacher que si ce colis n'en a pas déjà
    // une — un rattachement une fois établi n'est jamais remis en cause
    // par un run ultérieur.
    let orderId = existing?.orderId ?? null;
    if (!orderId) {
      const order = await prisma.order.findFirst({
        where: { phone: p.phone, parcels: { none: { carrier: "FORCELOG" } } },
        select: { id: true },
      });
      if (order) {
        orderId = order.id;
        parcelsLinked++;
      }
    }

    await prisma.parcel.upsert({
      where: { carrier_code: { carrier: "FORCELOG", code: p.code } },
      create: {
        carrier: "FORCELOG",
        code: p.code,
        orderId,
        receiver: p.receiver,
        phone: p.phone,
        cityName: p.cityName,
        price: p.price,
        status: p.status,
        statusCode: p.statusCode,
        carrierCreatedAt: parseForcelogDate(p.carrierCreatedAt),
        deliveredAt,
      },
      update: {
        orderId,
        receiver: p.receiver,
        cityName: p.cityName,
        price: p.price,
        status: p.status,
        deliveredAt,
        statusCode: p.statusCode,
      },
    });
    parcelsUpserted++;
  }

  let invoicesUpserted = 0;
  for (const inv of invoices) {
    const cDate = parseForcelogDate(inv.cDate);
    if (!cDate) continue; // date de création obligatoire, ligne ignorée sinon

    await prisma.crbtInvoice.upsert({
      where: { ref: inv.ref },
      create: {
        carrier: "FORCELOG",
        ref: inv.ref,
        cDate,
        payDate: parseForcelogDate(inv.payDate),
        statut: inv.statut,
        parcelsCount: inv.parcelsCount,
        fees: inv.fees,
        feesAmount: inv.feesAmount,
        balance: inv.balance,
        amount: inv.amount,
      },
      update: {
        payDate: parseForcelogDate(inv.payDate),
        statut: inv.statut,
        parcelsCount: inv.parcelsCount,
        fees: inv.fees,
        feesAmount: inv.feesAmount,
        balance: inv.balance,
        amount: inv.amount,
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
    parcelsLinked,
    invoicesUpserted,
    autoConfirm,
  });
}
