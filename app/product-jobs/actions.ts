"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";

export type UploadState = { error: string | null; skipped: string[] };

// Le prix (= coût d'achat, voir REGLES_PRODUIT.md du worker
// mariotoys-images-automation) est le dernier groupe de chiffres du nom
// de fichier, juste avant l'extension — ex: "299.jpg" ou
// "voiture-police_299.jpg" -> 299. Convention partagée avec le worker :
// lui ne parse rien, le champ "cost" du job vient d'ici.
//
// Le groupe de chiffres doit être précédé du début du nom ou d'un
// séparateur (_ - espace) : sans ça, un export WhatsApp comme
// "WhatsApp Image 2026-08-04 at 14.34.44.jpeg" ferait lire "44" (fragment
// de l'heure) comme un prix — faux positif bien pire qu'un fichier ignoré.
function parsePriceFromFilename(filename: string): number | null {
  const match = filename.match(/(?:^|[_\-\s])(\d+)(?=\.[^.]+$)/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function uploadProductPhotos(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return { error: "Sélectionnez au moins une photo.", skipped: [] };
  }

  const skipped: string[] = [];

  for (const file of files) {
    const cost = parsePriceFromFilename(file.name);
    if (cost === null) {
      // Règle du worker : pas de prix dans le nom -> on met de côté et on
      // signale, jamais de traitement à l'aveugle.
      skipped.push(file.name);
      continue;
    }

    const blob = await put(`product-jobs/uploads/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    await prisma.productJob.create({
      data: {
        originalPhotoUrl: blob.url,
        originalFilename: file.name,
        cost,
        status: "EN_ATTENTE",
      },
    });
  }

  revalidatePath("/product-jobs");

  if (skipped.length > 0) {
    return {
      error: `Prix introuvable dans le nom de fichier, ignoré(s) : ${skipped.join(", ")}`,
      skipped,
    };
  }

  return { error: null, skipped: [] };
}
