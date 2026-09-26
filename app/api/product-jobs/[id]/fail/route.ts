import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Réservé au worker — signale l'échec d'un job (ex : CAPTCHA/quota Gemini,
// erreur réseau). Le job reste visible dans le CRM avec le message
// d'erreur, rien n'est supprimé — à l'utilisateur de décider (relancer en
// remettant le statut à EN_ATTENTE, ou ignorer).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.WORKER_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const job = await prisma.productJob.findUnique({ where: { id: params.id } });
  if (!job) {
    return NextResponse.json({ error: "Job introuvable" }, { status: 404 });
  }

  let body: { errorMessage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const errorMessage = body.errorMessage?.trim() || "Erreur inconnue côté worker";

  await prisma.productJob.update({
    where: { id: job.id },
    data: { status: "ERREUR", errorMessage, completedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
