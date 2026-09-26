"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { readProductPhoto } from "@/lib/gemini-vision";
import { computeCompareAtPrice, computeSellPrice } from "@/lib/pricing";

export type UploadState = { error: string | null };

export async function uploadProductPhotos(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return { error: "Sélectionnez au moins une photo." };
  }

  const failures: string[] = [];

  for (const file of files) {
    // Le nom du fichier (ex: export WhatsApp) est aléatoire et n'est
    // JAMAIS utilisé pour en déduire une donnée produit — uniquement
    // gardé pour affichage/traçabilité. Tout (prix d'achat, référence)
    // est lu sur la photo elle-même.
    const blob = await put(`product-jobs/uploads/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const reading = await readProductPhoto(buffer, file.type || "image/jpeg");

      if (!reading) {
        await prisma.productJob.create({
          data: {
            originalPhotoUrl: blob.url,
            originalFilename: file.name,
            status: "ERREUR",
            errorMessage: "Aucun prix d'achat lisible sur la photo — vérifiez qu'il est bien visible.",
            completedAt: new Date(),
          },
        });
        continue;
      }

      const sellPrice = computeSellPrice(reading.cost);
      const compareAtPrice = computeCompareAtPrice(sellPrice);

      await prisma.productJob.create({
        data: {
          originalPhotoUrl: blob.url,
          originalFilename: file.name,
          cost: reading.cost,
          sku: reading.sku,
          sellPrice,
          compareAtPrice,
          status: "EN_ATTENTE",
        },
      });
    } catch (err) {
      // Échec technique de la lecture (API Gemini indisponible, quota...) —
      // le job existe quand même (photo déjà uploadée), en erreur, plutôt
      // que de perdre la photo silencieusement.
      await prisma.productJob.create({
        data: {
          originalPhotoUrl: blob.url,
          originalFilename: file.name,
          status: "ERREUR",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
      failures.push(file.name);
    }
  }

  revalidatePath("/product-jobs");

  if (failures.length > 0) {
    return { error: `Échec de lecture pour : ${failures.join(", ")} (voir statut "Erreur" dans la liste).` };
  }

  return { error: null };
}
