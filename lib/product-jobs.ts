// Un job resté "En cours" plus longtemps que ça (worker arrêté en plein
// traitement) est considéré bloqué et peut être relancé.
export const STUCK_AFTER_MS = 20 * 60 * 1000;
