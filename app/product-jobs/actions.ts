"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { fixUtf8Filename } from "@/lib/filename";
import { STUCK_AFTER_MS } from "@/lib/product-jobs";

export type UploadState = { error: string | null };

// Le CRM ne fait QUE stocker la photo et créer le job — aucune lecture
// d'API payante ici (décision : pas de clé Gemini côté CRM). Le worker
// (mariotoys-images-automation, Gemini web via Playwright) lit tout
// (prix, référence, couleurs...) directement sur la photo lui-même.
export async function uploadProductPhotos(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return { error: "Sélectionnez au moins une photo." };
  }

  for (const file of files) {
    const filename = fixUtf8Filename(file.name);
    const blob = await put(`product-jobs/uploads/${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    await prisma.productJob.create({
      data: {
        originalPhotoUrl: blob.url,
        originalFilename: filename,
        status: "EN_ATTENTE",
      },
    });
  }

  revalidatePath("/product-jobs");
  return { error: null };
}

// Remet un job en file d'attente : en erreur, ou bloqué en cours.
export async function retryJob(jobId: string) {
  await prisma.productJob.updateMany({
    where: {
      id: jobId,
      OR: [{ status: "ERREUR" }, { status: "EN_COURS", claimedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } }],
    },
    data: { status: "EN_ATTENTE", errorMessage: null, step: null, claimedAt: null, completedAt: null },
  });
  revalidatePath("/product-jobs");
}
