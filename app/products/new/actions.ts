"use server";

import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { generateProductDraft } from "@/lib/claude";
import { listCollections } from "@/lib/shopify-admin";
import { computeSalePrice, computeCompareAtPrice } from "@/lib/pricing";

export type GenerateState = { error: string | null };

export async function generateDraft(
  _prevState: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  const costRaw = String(formData.get("cost") ?? "");
  const cost = Number(costRaw);
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (!Number.isFinite(cost) || cost <= 0) {
    return { error: "Le coût doit être un nombre positif." };
  }
  if (files.length === 0) {
    return { error: "Ajoutez au moins une photo." };
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

  let collections: Awaited<ReturnType<typeof listCollections>>;
  try {
    collections = await listCollections();
  } catch (err) {
    return { error: `Impossible de charger les collections Shopify : ${err instanceof Error ? err.message : String(err)}` };
  }

  let ai;
  try {
    ai = await generateProductDraft(imageUrls, collections.map((c) => c.title));
  } catch (err) {
    return { error: `Échec de la génération IA : ${err instanceof Error ? err.message : String(err)}` };
  }

  const matchedCollection = collections.find(
    (c) => ai.collectionTitle && c.title.toLowerCase() === ai.collectionTitle.toLowerCase()
  );

  const price = computeSalePrice(cost);
  const compareAtPrice = computeCompareAtPrice(price);
  const tags = [...ai.sizes, "Nouveauté", ...(ai.brand ? [ai.brand] : [])];

  const draft = await prisma.productDraft.create({
    data: {
      imageUrls,
      cost,
      title: ai.title,
      about: ai.about,
      features: ai.features,
      sizes: ai.sizes,
      tags,
      brand: ai.brand,
      price,
      compareAtPrice,
      collectionId: matchedCollection?.id ?? null,
      collectionTitle: matchedCollection?.title ?? ai.collectionTitle,
      collectionAmbiguous: !matchedCollection,
    },
  });

  redirect(`/products/new/${draft.id}/review`);
}
