import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasSession } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Statut en direct d'une demande (sondé toutes les 5 s par la page résultats).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await hasSession())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const request = await prisma.creativeRequest.findUnique({
    where: { id: params.id },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!request) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

  return NextResponse.json({
    id: request.id,
    status: request.status,
    images: request.images.map((i) => ({
      id: i.id,
      angleKey: i.angleKey,
      position: i.position,
      status: i.status,
      attempts: i.attempts,
      errorMessage: i.errorMessage,
      imageUrl: i.imageUrl,
    })),
  });
}
