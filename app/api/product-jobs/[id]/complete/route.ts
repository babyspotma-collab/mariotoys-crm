import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db";

// Réservé au worker — reçoit les visuels générés par Gemini en multipart
// (champ répété "images"), les upload vers Vercel Blob (les identifiants
// Blob restent côté CRM, le worker n'a besoin que de WORKER_SECRET), puis
// passe le job en IMAGES_PRETES. La création du produit Shopify
// lui-même reste une étape séparée (humaine/Claude, voir
// mariotoys-images-automation/CLAUDE.md) — ce n'est PAS ce endpoint.
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
  if (files.length === 0) {
    return NextResponse.json({ error: "Aucune image reçue (champ 'images' attendu)" }, { status: 400 });
  }

  const urls: string[] = [];
  for (const file of files) {
    const blob = await put(`product-jobs/${job.id}/${file.name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    urls.push(blob.url);
  }

  await prisma.productJob.update({
    where: { id: job.id },
    data: {
      status: "IMAGES_PRETES",
      generatedImageUrls: urls,
      completedAt: new Date(),
      errorMessage: null,
    },
  });

  return NextResponse.json({ ok: true, imageUrls: urls });
}
