import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized } from "@/lib/creatives";
import { expireStaleHookRequests } from "@/lib/creative-hooks";

export const dynamic = "force-dynamic";

// Réservé au programme local. Réclame (EN_COURS) la plus ancienne demande de
// suggestions d'accroches en attente, ou {request: null}. La réclamation est
// conditionnelle (update ... where status: EN_ATTENTE) comme pour les jobs produit.
export async function GET(req: NextRequest) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  await expireStaleHookRequests();

  const next = await prisma.creativeHookRequest.findFirst({
    where: { status: "EN_ATTENTE" },
    orderBy: { createdAt: "asc" },
  });
  if (!next) return NextResponse.json({ request: null });

  const claim = await prisma.creativeHookRequest.updateMany({
    where: { id: next.id, status: "EN_ATTENTE" },
    data: { status: "EN_COURS" },
  });
  if (claim.count === 0) return NextResponse.json({ request: null });

  return NextResponse.json({
    request: { id: next.id, photoUrl: next.photoUrl, productName: next.productName },
  });
}
