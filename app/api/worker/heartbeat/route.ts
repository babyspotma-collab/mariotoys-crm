import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isWorkerAuthorized } from "@/lib/creatives";

export const dynamic = "force-dynamic";

const PRODUCT_STEPS = ["READING", "GENERATING", "SHOPIFY"];
const ISSUES = ["SESSION_EXPIRED", "QUOTA", "CAPTCHA"];

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Réservé au programme local unifié (WORKER_SECRET). Écrit la MÊME ligne
// WorkerStatus (id "worker") que POST /api/product-jobs/heartbeat, qui reste
// inchangé pour l'ancien programme : l'indicateur de la page Création
// produits lit donc toujours les mêmes colonnes, avec la même signification
// (state/jobId/filename/step = job PRODUIT en cours, rien d'autre).
//
// Corps : { state, jobId?, filename?, step?, activity?, issue?, issueMessage? }
//  - job produit en cours : state "busy" + jobId + filename (+ step) ;
//  - job Créatives ou attente : state "idle", et `activity` décrit ce qui se
//    passe (ex : "Créatives : Circuit Hot Wheels — image 2/5") ;
//  - Gemini bloque le programme : `issue` (+ issueMessage), toujours absent
//    quand tout va bien (effacé à chaque battement).
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

  const jobId = str(body.jobId, 100);
  const busy = body.state === "busy" && !!jobId;
  const step = busy && typeof body.step === "string" && PRODUCT_STEPS.includes(body.step) ? body.step : null;
  const issue = typeof body.issue === "string" && ISSUES.includes(body.issue) ? body.issue : null;

  const data = {
    lastSeenAt: new Date(),
    state: busy ? "busy" : "idle",
    jobId: busy ? jobId : null,
    filename: busy ? str(body.filename, 200) : null,
    step,
    activity: str(body.activity, 200),
    issue,
    issueMessage: issue ? str(body.issueMessage, 300) : null,
  };

  await prisma.workerStatus.upsert({ where: { id: "worker" }, create: { id: "worker", ...data }, update: data });

  // Même effet que la route product-jobs : étape affichée sur la ligne du
  // job produit, seulement tant qu'il est en cours.
  if (busy && step) {
    await prisma.productJob.updateMany({ where: { id: jobId!, status: "EN_COURS" }, data: { step } });
  }
  return NextResponse.json({ ok: true });
}
