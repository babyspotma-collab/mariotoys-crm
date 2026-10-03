"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { CREATIVE_FORMAT, buildAngles, buildFields, cleanText, parsePrice } from "@/lib/creative-angles";
import { hasSession, isOwnUploadUrl, recomputeRequestStatus } from "@/lib/creatives";
import { HOOK_MAX_PENDING, expireStaleHookRequests, purgeOldHookRequests } from "@/lib/creative-hooks";

export type CreateCreativeInput = {
  photoUrl: string;
  filename: string;
  productName: string;
  hook: string; // accroche validée par l'utilisateur (facultative)
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
  // L'accroche n'est jamais déduite ni complétée ici : celle de l'utilisateur,
  // ou rien (titre neutre issu du formulaire, voir lib/creative-angles.ts).
  const hook = cleanText(input.hook, 60);

  const angles = buildAngles(
    buildFields({ productName, hook, pointFort1, pointFort2, pointFort3, price, offerLine }),
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

// Clic sur "Suggérer des accroches" : dépose une demande que le programme local
// traite (Claude regarde la photo). Rien n'est généré tout seul : les accroches
// proposées s'affichent, l'utilisateur en choisit une ou écrit la sienne.
export async function requestHookSuggestions(input: {
  photoUrl: string;
  productName: string;
}): Promise<{ id: string | null; error: string | null }> {
  if (!(await hasSession())) return { id: null, error: "Session expirée, reconnectez-vous." };
  if (!isOwnUploadUrl(input.photoUrl)) return { id: null, error: "Photo invalide, redéposez-la." };

  const productName = cleanText(input.productName, 80);
  if (!productName) return { id: null, error: "Renseignez d'abord le nom du produit." };

  await expireStaleHookRequests();
  await purgeOldHookRequests();
  const pending =await prisma.creativeHookRequest.count({ where: { status: { in: ["EN_ATTENTE", "EN_COURS"] } } });
  if (pending >= HOOK_MAX_PENDING) {
    return { id: null, error: "Trop de suggestions en cours, réessayez dans une minute." };
  }

  const request = await prisma.creativeHookRequest.create({
    data: { photoUrl: input.photoUrl, productName },
  });
  return { id: request.id, error: null };
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
