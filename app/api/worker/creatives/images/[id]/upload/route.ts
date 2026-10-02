import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized, recomputeRequestStatus } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Limite Vercel : 4,5 Mo par requête. Le programme ré-encode en JPEG sous ce
// seuil avant l'envoi ; au-delà on refuse proprement plutôt que d'échouer
// côté plateforme sans message.
const MAX_BYTES = 4_400_000;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Réservé au programme local — reçoit l'image générée (multipart, champ
// "image"), la range dans Vercel Blob et passe l'image en TERMINEE.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const image = await prisma.creativeImage.findUnique({ where: { id: params.id } });
  if (!image) return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
  if (image.status !== "EN_COURS") {
    return NextResponse.json({ error: "L'image n'est pas en cours de génération" }, { status: 409 });
  }

  const formData = await req.formData();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Champ image manquant" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Type d'image non accepté" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (max 4,4 Mo)" }, { status: 413 });
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const blob = await put(`creatives/${image.requestId}/${image.angleKey}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  await prisma.creativeImage.update({
    where: { id: image.id },
    data: { status: "TERMINEE", imageUrl: blob.url, errorMessage: null, finishedAt: new Date() },
  });
  await recomputeRequestStatus(image.requestId);

  return NextResponse.json({ ok: true, url: blob.url });
}
