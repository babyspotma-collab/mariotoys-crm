import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { IMAGE_STALE_AFTER_MS, isWorkerAuthorized, recomputeRequestStatus } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Réservé au programme local. Renvoie la plus ancienne demande qui a encore
// des images EN_ATTENTE, avec ces images (prompt final inclus), ou
// {request: null}. NE RÉCLAME RIEN : chaque image est réclamée séparément par
// POST .../images/[id]/start, ce qui permet à "Régénérer" d'être repris
// image par image et à une demande partiellement traitée de continuer.
export async function GET(req: NextRequest) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Reprise sur panne : une image "en cours" depuis trop longtemps (programme
  // planté en plein travail) repasse en attente, sans compter comme échec.
  const stale = await prisma.creativeImage.findMany({
    where: { status: "EN_COURS", startedAt: { lt: new Date(Date.now() - IMAGE_STALE_AFTER_MS) } },
    select: { id: true, requestId: true },
  });
  if (stale.length > 0) {
    await prisma.creativeImage.updateMany({
      where: { id: { in: stale.map((s) => s.id) }, status: "EN_COURS" },
      data: { status: "EN_ATTENTE" },
    });
    for (const requestId of new Set(stale.map((s) => s.requestId))) await recomputeRequestStatus(requestId);
  }

  const request = await prisma.creativeRequest.findFirst({
    where: { images: { some: { status: "EN_ATTENTE" } } },
    orderBy: { createdAt: "asc" },
    include: {
      images: { where: { status: "EN_ATTENTE" }, orderBy: { position: "asc" } },
    },
  });

  if (!request) return NextResponse.json({ request: null });

  return NextResponse.json({
    request: {
      id: request.id,
      productName: request.productName,
      sourcePhotoUrl: request.sourcePhotoUrl,
      format: request.format,
      images: request.images.map((i) => ({
        id: i.id,
        angleKey: i.angleKey,
        position: i.position,
        prompt: i.prompt,
        attempts: i.attempts,
      })),
    },
  });
}
