import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized } from "@/lib/creatives";
import { sanitizeHooks } from "@/lib/creative-angles";

export const dynamic = "force-dynamic";

// Réservé au programme local — enregistre les accroches proposées. Elles sont
// nettoyées côté CRM (mots, longueur, doublons) : le texte d'une IA n'est
// jamais affiché tel quel, et jamais utilisé sans validation de l'utilisateur.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { hooks?: unknown };
  const hooks = sanitizeHooks(body.hooks);

  const res = await prisma.creativeHookRequest.updateMany({
    where: { id: params.id, status: "EN_COURS" },
    data: hooks.length
      ? { status: "TERMINEE", hooks, errorMessage: null }
      : { status: "ECHEC", errorMessage: "Aucune accroche exploitable (6 mots maximum chacune)." },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Demande introuvable ou déjà terminée" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, count: hooks.length });
}
