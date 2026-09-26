import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";

// Réservé au worker — appelé une fois que TOUT le pipeline (lecture des
// infos sur la photo, génération des visuels, création du produit
// Shopify en brouillon) s'est terminé avec succès côté worker (voir
// mariotoys-images-automation/worker.py). Plus de "session à part" :
// c'est le seul endpoint de fin de job "réussi" (voir aussi .../fail
// pour un échec technique réel).
//
// Si des champs essentiels (prix d'achat, référence) n'ont pas pu être
// lus sur la photo, le worker crée quand même le produit en brouillon
// (tag "À compléter" côté Shopify) et renvoie `missingFields` non vide —
// le job passe alors en CREE_A_COMPLETER plutôt que CREE.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.WORKER_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const job = await prisma.productJob.findUnique({ where: { id: params.id } });
  if (!job) {
    return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
  }

  const formData = await req.formData();

  const files = formData.getAll("images").filter((f): f is File => f instanceof File);
  const imageUrls: string[] = [];
  for (const file of files) {
    const blob = await put(`product-jobs/${job.id}/generated/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    imageUrls.push(blob.url);
  }

  const numOrNull = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
  const strOrNull = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : String(v));

  const cost = numOrNull(formData.get("cost"));
  const sku = strOrNull(formData.get("sku"));
  const sellPrice = numOrNull(formData.get("sellPrice"));
  const compareAtPrice = numOrNull(formData.get("compareAtPrice"));
  const shopifyProductId = strOrNull(formData.get("shopifyProductId"));
  const shopifyProductUrl = strOrNull(formData.get("shopifyProductUrl"));
  const note = strOrNull(formData.get("note"));

  const missingFieldsRaw = formData.get("missingFields");
  let missingFields: string[] = [];
  if (typeof missingFieldsRaw === "string" && missingFieldsRaw.length > 0) {
    try {
      const parsed = JSON.parse(missingFieldsRaw);
      if (Array.isArray(parsed)) missingFields = parsed.map(String);
    } catch {
      return NextResponse.json({ error: "missingFields invalide (JSON attendu)" }, { status: 400 });
    }
  }

  if (!shopifyProductId || !shopifyProductUrl) {
    return NextResponse.json(
      { error: "shopifyProductId et shopifyProductUrl sont requis (produit déjà créé côté Shopify)" },
      { status: 400 }
    );
  }

  await prisma.productJob.update({
    where: { id: job.id },
    data: {
      status: missingFields.length > 0 ? "CREE_A_COMPLETER" : "CREE",
      generatedImageUrls: imageUrls,
      cost,
      sku,
      sellPrice,
      compareAtPrice,
      shopifyProductId,
      shopifyProductUrl,
      missingFields,
      note,
      completedAt: new Date(),
      errorMessage: null,
    },
  });

  return NextResponse.json({ ok: true });
}
