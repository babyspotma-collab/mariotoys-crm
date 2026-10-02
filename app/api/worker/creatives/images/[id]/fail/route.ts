import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized, recomputeRequestStatus } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Réservé au programme local — échec définitif d'une image (après ses
// nouvelles tentatives), avec la raison exacte affichée dans le CRM.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const image = await prisma.creativeImage.findUnique({ where: { id: params.id } });
  if (!image) return NextResponse.json({ error: "Image introuvable" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { errorMessage?: unknown };
  const message =
    typeof body.errorMessage === "string" && body.errorMessage.trim()
      ? body.errorMessage.trim().slice(0, 500)
      : "Échec de génération (aucun détail)";

  const res = await prisma.creativeImage.updateMany({
    where: { id: image.id, status: "EN_COURS" },
    data: { status: "ECHEC", errorMessage: message, finishedAt: new Date() },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "L'image n'est pas en cours de génération" }, { status: 409 });
  }

  await recomputeRequestStatus(image.requestId);
  return NextResponse.json({ ok: true });
}
