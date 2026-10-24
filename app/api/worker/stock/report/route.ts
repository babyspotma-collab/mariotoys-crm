import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized } from "@/lib/creatives";
import { parseStockReport } from "@/lib/stock-albaseet";

export const dynamic = "force-dynamic";

// Réservé au logiciel de stock ALBASEET+ : pour chaque article de commande,
// où il se trouve dans les dépôts (stockInfo) et, s'il a été vendu dans
// ALBASEET+, la facture correspondante (albaseetSale, null sinon).
export async function POST(req: NextRequest) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  let items;
  try {
    items = parseStockReport(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const now = new Date();
  // Un seul aller-retour base : les mises à jour partent ensemble.
  const results = await prisma.$transaction(
    items.map((i) =>
      prisma.orderItem.updateMany({
        where: { id: i.id },
        data: {
          stockInfo: i.stockInfo as Prisma.InputJsonValue,
          albaseetSale: i.albaseetSale === null ? Prisma.DbNull : (i.albaseetSale as Prisma.InputJsonValue),
          stockCheckedAt: now,
        },
      })
    )
  );
  return NextResponse.json({ updated: results.reduce((s, r) => s + r.count, 0) });
}
