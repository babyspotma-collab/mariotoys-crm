import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasSession } from "@/lib/creatives";
import { sanitizeHooks } from "@/lib/creative-angles";
import { expireStaleHookRequests } from "@/lib/creative-hooks";

export const dynamic = "force-dynamic";

// État d'une demande de suggestions d'accroches (sondé par le formulaire).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await hasSession())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  await expireStaleHookRequests();
  const request = await prisma.creativeHookRequest.findUnique({ where: { id: params.id } });
  if (!request) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

  return NextResponse.json({
    status: request.status,
    hooks: request.status === "TERMINEE" ? sanitizeHooks(request.hooks) : [],
    errorMessage: request.status === "ECHEC" ? request.errorMessage : null,
  });
}
