// Commande Shopify payée en ligne par carte (passerelle Payzone Maroc…) :
// statut financier "payée" ET passerelle qui n'est pas le paiement à la
// livraison. Le statut seul ne suffit pas : l'équipe passe aussi des commandes
// "paiement à la livraison" en "payée" à la main après l'encaissement.
//
// Module pur : testé par shopify-payment.check.ts.

const COD_OR_MANUAL = /cash on delivery|\bcod\b|livraison|manual|manuel/i;

export function isPaidByCard(financialStatus: string | null | undefined, gateways: string[] | null | undefined): boolean {
  if (String(financialStatus ?? "").toLowerCase() !== "paid") return false;
  const names = (gateways ?? []).map((g) => g.trim()).filter(Boolean);
  return names.length > 0 && !names.some((g) => COD_OR_MANUAL.test(g));
}
