import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Réservé au programme local — échec de la suggestion (Claude indisponible,
// photo illisible...), avec un message lisible affiché dans le formulaire.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { errorMessage?: unknown };
  const message =
    typeof body.errorMessage === "string" && body.errorMessage.trim()
      ? body.errorMessage.trim().slice(0, 300)
      : "La suggestion d'accroches a échoué.";

  const res = await prisma.creativeHookRequest.updateMany({
    where: { id: params.id, status: "EN_COURS" },
    data: { status: "ECHEC", errorMessage: message },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Demande introuvable ou déjà terminée" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
