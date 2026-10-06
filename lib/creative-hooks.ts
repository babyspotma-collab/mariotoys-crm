import { prisma } from "@/lib/db";

// Une demande de suggestion que personne n'a traitée en 5 minutes (programme
// local éteint) est abandonnée : le formulaire affiche l'échec, et la demande
// ne sera pas traitée plus tard "dans le dos" de l'utilisateur.
export const HOOK_STALE_AFTER_MS = 5 * 60_000;
export const HOOK_RETENTION_MS = 24 * 60 * 60_000;
export const HOOK_MAX_PENDING = 5;

// Abandonne les demandes périmées (appelée à chaque sondage du programme local
// et du formulaire : une seule requête indexée).
export async function expireStaleHookRequests(): Promise<void> {
  const now = Date.now();
  await prisma.creativeHookRequest.updateMany({
    where: {
      OR: [
        { status: "EN_ATTENTE", createdAt: { lt: new Date(now - HOOK_STALE_AFTER_MS) } },
        { status: "EN_COURS", updatedAt: { lt: new Date(now - HOOK_STALE_AFTER_MS) } },
      ],
    },
    data: { status: "ECHEC", errorMessage: "Le programme local n'a pas répondu à temps (est-il lancé ?)." },
  });
}

// Purge des lignes de plus de 24 h (appelée à la création d'une demande seulement).
export async function purgeOldHookRequests(): Promise<void> {
  await prisma.creativeHookRequest.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - HOOK_RETENTION_MS) } } });
}
