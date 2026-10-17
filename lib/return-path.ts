// Retour à la liste d'où l'on vient. La page "Créer le colis" reçoit l'adresse de
// la page Commandes d'origine (onglet, période, recherche, page) dans le
// paramètre `from` ; après la création du colis, on y revient au lieu de
// retomber sur l'onglet "À confirmer".
//
// Module pur. L'adresse vient de l'URL, donc elle est contrôlée : uniquement un
// chemin interne (jamais un autre site) — sinon on retombe sur l'onglet
// "Confirmées".

// Onglet "Confirmées" de la page Commandes (/orders ; "/" est l'Accueil).
export const DEFAULT_RETURN_PATH = "/orders?tab=ok";

export function safeReturnPath(raw: unknown, fallback: string = DEFAULT_RETURN_PATH): string {
  if (typeof raw !== "string") return fallback;
  const path = raw.trim();
  if (path.length === 0 || path.length > 500) return fallback;
  // Chemin interne uniquement : commence par un seul "/" (pas "//", pas "/\"),
  // sans schéma ni retour à la ligne.
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(path) || /^\/[^?#]*:\/\//.test(path)) return fallback;
  return path;
}

// Lien vers "Créer le colis" en mémorisant la page d'origine.
export function confirmHref(orderId: string, fromPath: string): string {
  return `/orders/${orderId}/confirm?from=${encodeURIComponent(fromPath)}`;
}
