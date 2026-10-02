"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { CREATIVE_FORMAT, buildAngles, buildFields, cleanText, parsePrice } from "@/lib/creative-angles";
import { hasSession, isOwnUploadUrl, recomputeRequestStatus } from "@/lib/creatives";

export type CreateCreativeInput = {
  photoUrl: string;
  filename: string;
  productName: string;
  pointFort1: string;
  pointFort2: string;
  pointFort3: string;
  price: string;
  offerLine: string;
};

// Appelée au clic sur "Générer" (la photo est déjà dans Blob). Crée la
// demande ET ses 5 lignes d'angle d'un coup, prompts finaux figés ; les angles
// dont le contenu essentiel manque sont créés IGNOREE avec leur raison.
export async function createCreativeRequest(input: CreateCreativeInput): Promise<{ error: string }> {
  if (!(await hasSession())) return { error: "Session expirée, reconnectez-vous." };

  if (!isOwnUploadUrl(input.photoUrl)) return { error: "Photo invalide, redéposez-la." };

  const productName = cleanText(input.productName, 80);
  if (!productName) return { error: "Le nom du produit est obligatoire." };

  const rawPrice = input.price.trim();
  const price = rawPrice ? parsePrice(rawPrice) : null;
  if (rawPrice && price === null) return { error: "Prix invalide (ex : 199 ou 199,50)." };

  const pointFort1 = cleanText(input.pointFort1, 40);
  const pointFort2 = cleanText(input.pointFort2, 40);
  const pointFort3 = cleanText(input.pointFort3, 40);
  const offerLine = cleanText(input.offerLine, 80);

  const angles = buildAngles(
    buildFields({ productName, pointFort1, pointFort2, pointFort3, price, offerLine }),
    CREATIVE_FORMAT
  );

  const request = await prisma.creativeRequest.create({
    data: {
      sourcePhotoUrl: input.photoUrl,
      sourceFilename: input.filename.slice(0, 200),
      productName,
      pointFort1: pointFort1 || null,
      pointFort2: pointFort2 || null,
      pointFort3: pointFort3 || null,
      price,
      offerLine: offerLine || null,
      format: CREATIVE_FORMAT,
      images: {
        create: angles.map((a) => ({
          angleKey: a.key,
          position: a.position,
          prompt: a.prompt,
          status: a.skipReason ? "IGNOREE" : "EN_ATTENTE",
          errorMessage: a.skipReason,
        })),
      },
    },
  });
  await recomputeRequestStatus(request.id);

  revalidatePath("/creatives");
  redirect(`/creatives/${request.id}`);
}

// "Régénérer" : même prompt, nouvelle tentative complète. L'ancienne image
// reste affichée jusqu'à ce que la nouvelle la remplace.
export async function regenerateImage(imageId: string): Promise<{ error: string | null }> {
  if (!(await hasSession())) return { error: "Session expirée, reconnectez-vous." };

  const res = await prisma.creativeImage.updateMany({
    where: { id: imageId, status: { in: ["TERMINEE", "ECHEC"] } },
    data: { status: "EN_ATTENTE", attempts: 0, errorMessage: null, finishedAt: null },
  });
  if (res.count === 0) return { error: "Cette image ne peut pas être régénérée maintenant." };

  const image = await prisma.creativeImage.findUnique({ where: { id: imageId }, select: { requestId: true } });
  if (image) {
    await recomputeRequestStatus(image.requestId);
    revalidatePath(`/creatives/${image.requestId}`);
  }
  return { error: null };
}
