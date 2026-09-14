"use server";

import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { generateProductText } from "@/lib/gemini";
import { computeSalePrice, computeCompareAtPrice } from "@/lib/pricing";

export type GenerateState = { error: string | null };

export async function generateDraft(
  _prevState: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  const costRaw = String(formData.get("cost") ?? "");
  const cost = Number(costRaw);
  const sizesRaw = String(formData.get("sizes") ?? "");
  const collectionId = String(formData.get("collectionId") ?? "").trim();
  const collectionTitle = String(formData.get("collectionTitle") ?? "").trim();
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  const sizes = sizesRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (!Number.isFinite(cost) || cost <= 0) {
    return { error: "Le coût doit être un nombre positif." };
  }
  if (files.length === 0) {
    return { error: "Ajoutez au moins une photo." };
  }
  if (sizes.length === 0) {
    return { error: "Indiquez au moins une taille." };
  }
  if (!collectionId) {
    return { error: "Choisissez une collection." };
  }

  let imageUrls: string[];
  try {
    const uploaded = await Promise.all(
      files.map((file) => put(`products/${Date.now()}-${file.name}`, file, { access: "public" }))
    );
    imageUrls = uploaded.map((u) => u.url);
  } catch (err) {
    return { error: `Échec de l'upload photo : ${err instanceof Error ? err.message : String(err)}` };
  }

  const price = computeSalePrice(cost);
  const compareAtPrice = computeCompareAtPrice(price);

  let text;
  try {
    text = await generateProductText(imageUrls, sizes, price);
  } catch (err) {
    return { error: `Échec de la génération du texte : ${err instanceof Error ? err.message : String(err)}` };
  }

  // Tags calculés en code, jamais par l'IA : une balise par taille + "Nouveauté".
  const tags = [...sizes, "Nouveauté"];

  const draft = await prisma.productDraft.create({
    data: {
      imageUrls,
      cost,
      title: text.title,
      about: text.about,
      features: text.features,
      sizes,
      tags,
      price,
      compareAtPrice,
      collectionId,
      collectionTitle,
      collectionAmbiguous: false, // choisie explicitement à l'upload, jamais devinée
    },
  });

  redirect(`/products/new/${draft.id}/review`);
}
