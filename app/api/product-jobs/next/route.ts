import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Réservé au worker externe (mariotoys-images-automation, jamais le
// navigateur) — même garde WORKER_SECRET que les autres endpoints
// product-jobs. Renvoie et réclame (EN_COURS) le plus ancien job
// EN_ATTENTE, ou {job: null} s'il n'y en a aucun.
//
// La réclamation est conditionnelle (update ... where status: EN_ATTENTE)
// plutôt qu'un simple update après lecture : évite qu'un 2e appel
// concurrent ne récupère le même job si jamais plusieurs workers
// tournaient un jour (aucun aujourd'hui, mais coûte rien de le faire
// correctement dès maintenant).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.WORKER_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const next = await prisma.productJob.findFirst({
    where: { status: "EN_ATTENTE" },
    orderBy: { createdAt: "asc" },
  });

  if (!next) {
    return NextResponse.json({ job: null });
  }

  const claim = await prisma.productJob.updateMany({
    where: { id: next.id, status: "EN_ATTENTE" },
    data: { status: "EN_COURS", claimedAt: new Date() },
  });

  if (claim.count === 0) {
    // Un autre appel l'a réclamé entre-temps — le worker relancera au
    // prochain sondage plutôt que d'échouer bruyamment.
    return NextResponse.json({ job: null });
  }

  return NextResponse.json({
    job: {
      id: next.id,
      originalPhotoUrl: next.originalPhotoUrl,
      originalFilename: next.originalFilename,
      cost: next.cost ? Number(next.cost) : null,
    },
  });
}
