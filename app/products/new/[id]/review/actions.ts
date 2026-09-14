"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createDraftProduct } from "@/lib/shopify-admin";
import { buildDescriptionHtml } from "@/lib/claude";

export type ReviewState = { error: string | null };

export async function createProduct(
  draftId: string,
  _prevState: ReviewState,
  formData: FormData
): Promise<ReviewState> {
  const title = String(formData.get("title") ?? "").trim();
  const about = String(formData.get("about") ?? "").trim();
  const featuresRaw = String(formData.get("features") ?? "");
  const sizesRaw = String(formData.get("sizes") ?? "");
  const tagsRaw = String(formData.get("tags") ?? "");
  const price = Number(formData.get("price"));
  const compareAtPrice = Number(formData.get("compareAtPrice"));
  const collectionId = String(formData.get("collectionId") ?? "").trim();

  const features = featuresRaw.split("\n").map((l) => l.trim()).filter(Boolean);
  const sizes = sizesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

  if (!title || !about || features.length === 0) {
    return { error: "Titre, description et caractéristiques sont obligatoires." };
  }
  if (sizes.length === 0) {
    return { error: "Au moins une taille est requise." };
  }
  if (!collectionId) {
    return { error: "Choisissez une collection (obligatoire)." };
  }
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(compareAtPrice) || compareAtPrice <= 0) {
    return { error: "Prix invalides." };
  }

  const draft = await prisma.productDraft.findUniqueOrThrow({ where: { id: draftId } });

  let adminUrl: string;
  try {
    const product = await createDraftProduct({
      title,
      descriptionHtml: buildDescriptionHtml({ title, about, features, sizes }),
      tags,
      sizes,
      price,
      compareAtPrice,
      cost: Number(draft.cost),
      imageUrls: draft.imageUrls as string[],
      collectionId,
    });
    adminUrl = product.adminUrl;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  await prisma.productDraft.delete({ where: { id: draftId } });
  // En dehors du try/catch : redirect() lève volontairement une erreur
  // interne (NEXT_REDIRECT) que le catch ci-dessus intercepterait sinon.
  redirect(`/products/new/success?url=${encodeURIComponent(adminUrl)}`);
}
