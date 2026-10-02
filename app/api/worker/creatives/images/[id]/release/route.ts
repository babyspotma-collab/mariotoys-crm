import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized, recomputeRequestStatus } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Réservé au programme local — remet l'image en attente SANS échec quand
// Gemini bloque le programme (session expirée, limite atteinte, captcha) :
// le programme se met en pause, signale le problème par son heartbeat et
// reprendra cette image tout seul. La tentative n'est pas comptée.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const image = await prisma.creativeImage.findUnique({ where: { id: params.id } });
  if (!image) return NextResponse.json({ error: "Image introuvable" }, { status: 404 });

  const res = await prisma.creativeImage.updateMany({
    where: { id: image.id, status: "EN_COURS" },
    data: { status: "EN_ATTENTE", attempts: { decrement: 1 } },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "L'image n'est pas en cours de génération" }, { status: 409 });
  }

  await recomputeRequestStatus(image.requestId);
  return NextResponse.json({ ok: true });
}
