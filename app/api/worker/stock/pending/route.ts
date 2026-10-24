import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Réservé au logiciel de stock ALBASEET+ (programme local du PC de bureau).
// Renvoie les commandes non annulées des 30 derniers jours avec tous leurs
// articles — y compris ceux déjà rapprochés d'une facture ALBASEET+
// (albaseetSale), pour que le programme ne réattribue jamais une même
// facture à une autre commande.
export async function GET(req: NextRequest) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since }, status: { not: "ANNULEE" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      items: { select: { id: true, title: true, quantity: true, shopifyVariantId: true, albaseetSale: true } },
    },
  });
  return NextResponse.json({ orders });
}
