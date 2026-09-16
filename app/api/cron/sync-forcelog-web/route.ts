import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Reçoit les données extraites du dashboard web Forcelog par
// scripts/sync-forcelog-web.js (exécuté dans GitHub Actions, jamais sur
// Vercel — voir ce script pour le pourquoi). Même garde CRON_SECRET que
// /api/cron/sync-tracking.

type ScrapedParcel = { code: string; statusCode: string; status: string };
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

  let parcelsMatched = 0;
  let parcelsSkipped = 0;

  for (const p of parcels) {
    const order = await prisma.order.findFirst({ where: { forcelogCode: p.code } });
    if (!order) {
      parcelsSkipped++;
      continue;
    }
    parcelsMatched++;
    const statusChanged = p.statusCode !== order.forcelogStatusCode;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        forcelogStatus: p.status,
        forcelogStatusCode: p.statusCode,
        forcelogStatusChangedAt: statusChanged ? new Date() : order.forcelogStatusChangedAt,
        forcelogSyncFailCount: 0,
        forcelogSyncedAt: new Date(),
      },
    });
  }

  let invoicesUpserted = 0;
  for (const inv of invoices) {
    const cDate = parseForcelogDate(inv.cDate);
    if (!cDate) continue; // date de création obligatoire, ligne ignorée sinon

    await prisma.crbtInvoice.upsert({
      where: { ref: inv.ref },
      create: {
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

  return NextResponse.json({
    parcelsReceived: parcels.length,
    parcelsMatched,
    parcelsSkipped,
    invoicesUpserted,
  });
}
