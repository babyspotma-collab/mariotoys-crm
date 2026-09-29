import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Battement de cœur du worker (mariotoys-images-automation) : toutes les
// 30 s et à chaque changement d'étape. Même garde WORKER_SECRET que les
// autres endpoints product-jobs.
const STEPS = ["READING", "GENERATING", "SHOPIFY"];

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.WORKER_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: { state?: string; jobId?: string | null; filename?: string | null; step?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const busy = body.state === "busy" && !!body.jobId;
  const step = busy && body.step && STEPS.includes(body.step) ? body.step : null;
  const data = {
    lastSeenAt: new Date(),
    state: busy ? "busy" : "idle",
    jobId: busy ? body.jobId! : null,
    filename: busy ? body.filename ?? null : null,
    step,
  };
  await prisma.workerStatus.upsert({ where: { id: "worker" }, create: { id: "worker", ...data }, update: data });

  // Étape affichée sur la ligne du job, seulement tant qu'il est en cours.
  if (busy && step) {
    await prisma.productJob.updateMany({ where: { id: body.jobId!, status: "EN_COURS" }, data: { step } });
  }
  return NextResponse.json({ ok: true });
}
