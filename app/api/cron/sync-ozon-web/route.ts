import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

  let body: { parcels?: ScrapedParcel[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parcels = body.parcels ?? [];
  let parcelsUpserted = 0;
  let parcelsLinked = 0;

  for (const p of parcels) {
    const carrierCreatedAt = parseOzonDate(p.carrierCreatedAt);

    if (!p.phone) {
      await prisma.parcel.upsert({
        where: { carrier_code: { carrier: "OZON", code: p.code } },
        create: {
          carrier: "OZON",
          code: p.code,
          receiver: p.receiver,
          phone: p.phone,
          cityName: p.cityName,
          price: p.price,
          status: p.status,
          carrierCreatedAt,
        },
        update: {
          receiver: p.receiver,
          cityName: p.cityName,
          price: p.price,
          status: p.status,
        },
      });
      parcelsUpserted++;
      continue;
    }

    const existing = await prisma.parcel.findUnique({
      where: { carrier_code: { carrier: "OZON", code: p.code } },
      select: { orderId: true },
    });

    let orderId = existing?.orderId ?? null;
    if (!orderId) {
      const order = await prisma.order.findFirst({
        where: { phone: p.phone, parcels: { none: { carrier: "OZON" } } },
        select: { id: true },
      });
      if (order) {
        orderId = order.id;
        parcelsLinked++;
      }
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
      },
      update: {
        orderId,
        receiver: p.receiver,
        cityName: p.cityName,
        price: p.price,
        status: p.status,
      },
    });
    parcelsUpserted++;
  }

  return NextResponse.json({ parcelsReceived: parcels.length, parcelsUpserted, parcelsLinked });
}
