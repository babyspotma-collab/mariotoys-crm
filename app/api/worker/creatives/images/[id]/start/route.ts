import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized, recomputeRequestStatus } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Réservé au programme local — marque une image "en cours" (réclamation
// conditionnelle : un 2e appel sur la même image reçoit 409).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const image = await prisma.creativeImage.findUnique({ where: { id: params.id } });
  if (!image) return NextResponse.json({ error: "Image introuvable" }, { status: 404 });

  const claim = await prisma.creativeImage.updateMany({
    where: { id: image.id, status: "EN_ATTENTE" },
    data: { status: "EN_COURS", startedAt: new Date(), errorMessage: null, attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    return NextResponse.json({ error: "Image déjà prise ou plus en attente" }, { status: 409 });
  }

  await recomputeRequestStatus(image.requestId);
  return NextResponse.json({ ok: true });
}
