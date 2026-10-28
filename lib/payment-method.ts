// Commande déjà payée par le client : rien à encaisser à la livraison (le colis
// part à 0 DH). `paidOnline` dit "déjà payée", `paidMethod` dit comment.
// Une commande payée avant l'existence de paidMethod (null) était par carte.
//
// Module pur : utilisable côté serveur et client.

export const PAID_METHODS = ["CARTE", "WAFACASH_CASHPLUS"] as const;
export type PaidMethod = (typeof PAID_METHODS)[number];

export const PAID_METHOD_LABEL: Record<PaidMethod, string> = {
  CARTE: "Payée en ligne par carte",
  WAFACASH_CASHPLUS: "Payée par Wafacash / Cashplus",
};

export function cleanPaidMethod(raw: unknown): PaidMethod | null {
  return PAID_METHODS.find((m) => m === raw) ?? null;
}

/** Libellé à afficher, ou null si la commande n'est pas déjà payée. */
export function paidLabel(order: { paidOnline: boolean; paidMethod: string | null }): string | null {
  if (!order.paidOnline) return null;
  return PAID_METHOD_LABEL[cleanPaidMethod(order.paidMethod) ?? "CARTE"];
}
