import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized } from "@/lib/creatives";

export const dynamic = "force-dynamic";

const STATES = ["idle", "busy", "paused"];
const ISSUES = ["SESSION_EXPIRED", "QUOTA", "CAPTCHA"];

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Réservé au programme local (WORKER_SECRET) — battement de cœur commun aux
// deux files (Création produits et Créatives). Une seule ligne "main".
export async function POST(req: NextRequest) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const state = typeof body.state === "string" && STATES.includes(body.state) ? body.state : "idle";
  const issue = typeof body.issue === "string" && ISSUES.includes(body.issue) ? body.issue : null;
  const jobType = body.jobType === "product" || body.jobType === "creative" ? body.jobType : null;

  const data = {
    lastSeenAt: new Date(),
    state,
    jobType,
    jobId: str(body.jobId, 100),
    // "filename" : nom utilisé par l'ancien format de heartbeat du programme.
    label: str(body.label ?? body.filename, 200),
    step: str(body.step, 100),
    issue,
    issueMessage: issue ? str(body.issueMessage, 300) : null,
  };

  await prisma.workerHeartbeat.upsert({
    where: { id: "main" },
    create: { id: "main", ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
