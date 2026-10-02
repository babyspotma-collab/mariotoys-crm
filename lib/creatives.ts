import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import type { CreativeRequestStatus } from "@prisma/client";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UPLOAD_PATH_PREFIX } from "@/lib/creative-upload";

// Au-delà de ce délai sans battement de cœur, le programme local est
// considéré hors ligne.
export const WORKER_ONLINE_WINDOW_MS = 60_000;
// Image restée "en cours" plus longtemps que ça (programme planté en plein
// travail) : remise en attente par /api/worker/creatives/next.
export const IMAGE_STALE_AFTER_MS = 15 * 60_000;
export { MAX_SOURCE_PHOTO_BYTES, SOURCE_PHOTO_TYPES, UPLOAD_PATH_PREFIX } from "@/lib/creative-upload";

// Garde des routes /api/worker/* : même WORKER_SECRET que product-jobs, mais
// refuse tout si la variable n'est pas définie (sinon "Bearer undefined"
// passerait) et compare en temps constant.
export function isWorkerAuthorized(req: Request): boolean {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Garde des routes navigateur (jeton Blob, statut) : le middleware exige déjà
// la session, mais ces routes la revérifient elles-mêmes (défense en
// profondeur, surtout pour la délivrance de jetons d'upload).
export async function hasSession(): Promise<boolean> {
  return isValidSessionToken(cookies().get(SESSION_COOKIE)?.value);
}

// Une URL de photo source ne doit venir que de notre store Blob, sous le
// préfixe des uploads de Créatives — jamais d'une URL arbitraire que le
// programme local irait télécharger.
export function isOwnUploadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".public.blob.vercel-storage.com") &&
      u.pathname.startsWith(`/${UPLOAD_PATH_PREFIX}`)
    );
  } catch {
    return false;
  }
}

// Statut global d'une demande, recalculé depuis ses images (les angles
// IGNOREE ne comptent pas).
export async function recomputeRequestStatus(requestId: string): Promise<CreativeRequestStatus> {
  const images = await prisma.creativeImage.findMany({
    where: { requestId, status: { not: "IGNOREE" } },
    select: { status: true },
  });
  const count = (s: string) => images.filter((i) => i.status === s).length;
  const total = images.length;
  const done = count("TERMINEE");
  const failed = count("ECHEC");
  const running = count("EN_COURS");

  let status: CreativeRequestStatus;
  if (total === 0) status = "ECHEC";
  else if (done === total) status = "TERMINEE";
  else if (running > 0 || (count("EN_ATTENTE") > 0 && done + failed > 0)) status = "EN_COURS";
  else if (count("EN_ATTENTE") > 0) status = "EN_ATTENTE";
  else status = done > 0 ? "PARTIELLE" : "ECHEC";

  await prisma.creativeRequest.update({ where: { id: requestId }, data: { status } });
  return status;
}

export type WorkerStatus = {
  online: boolean;
  lastSeenAt: string | null;
  state: string | null;
  label: string | null;
  step: string | null;
  issue: "SESSION_EXPIRED" | "QUOTA" | "CAPTCHA" | null;
  issueMessage: string | null;
};

export async function getWorkerStatus(): Promise<WorkerStatus> {
  const hb = await prisma.workerHeartbeat.findUnique({ where: { id: "main" } });
  if (!hb) {
    return { online: false, lastSeenAt: null, state: null, label: null, step: null, issue: null, issueMessage: null };
  }
  const online = Date.now() - hb.lastSeenAt.getTime() < WORKER_ONLINE_WINDOW_MS;
  const issue = hb.issue === "SESSION_EXPIRED" || hb.issue === "QUOTA" || hb.issue === "CAPTCHA" ? hb.issue : null;
  return {
    online,
    lastSeenAt: hb.lastSeenAt.toISOString(),
    state: hb.state,
    label: hb.label,
    step: hb.step,
    // Un problème signalé par un programme hors ligne n'a plus de sens.
    issue: online ? issue : null,
    issueMessage: online ? hb.issueMessage : null,
  };
}
