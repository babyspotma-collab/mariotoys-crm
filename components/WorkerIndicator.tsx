import { prisma } from "@/lib/db";
import { formatDateTimeMa } from "@/lib/format";
import { fixUtf8Filename } from "@/lib/filename";

export const STEP_LABELS: Record<string, string> = {
  READING: "analyse de la photo (Claude)",
  GENERATING: "génération du visuel (Gemini)",
  SHOPIFY: "création Shopify",
};

// Le worker bat toutes les 30 s : au-delà de 90 s sans nouvelle (3
// battements manqués), on le considère inactif.
const ACTIVE_WITHIN_MS = 90_000;

export default async function WorkerIndicator() {
  const status = await prisma.workerStatus.findUnique({ where: { id: "worker" } });
  const active = !!status && Date.now() - status.lastSeenAt.getTime() < ACTIVE_WITHIN_MS;

  if (active) {
    const doing =
      status.state === "busy" && status.filename
        ? `traite la photo ${fixUtf8Filename(status.filename)}${status.step ? ` (${STEP_LABELS[status.step] ?? status.step})` : ""}`
        : "en attente de photos";
    return (
      <p role="status" className="flex items-center gap-2.5 rounded-[10px] bg-pill-green-bg px-3.5 py-3 text-sm text-pill-green-fg">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-pill-green-fg" />
        <span className="min-w-0">
          <span className="font-semibold">Worker actif</span> – {doing}
        </span>
      </p>
    );
  }

  // HH:MM si c'est aujourd'hui, sinon la date complète.
  const since = status ? formatDateTimeMa(status.lastSeenAt) : null;
  const today = formatDateTimeMa(new Date()).slice(0, 10);
  const sinceLabel = since ? (since.startsWith(today) ? since.slice(-5) : since) : null;
  return (
    <p role="status" className="flex items-center gap-2.5 rounded-[10px] bg-pill-red-bg px-3.5 py-3 text-sm text-pill-red-fg">
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-pill-red-fg" />
      <span className="min-w-0">
        <span className="font-semibold">{sinceLabel ? `Worker inactif depuis ${sinceLabel}` : "Worker jamais connecté"}</span> – vérifie
        que le PC est allumé
      </span>
    </p>
  );
}
