// Règles de prix Mario Toys (méthode photos) — voir
// mariotoys-images-automation/REGLES_PRODUIT.md, section "Prix, coût et
// remise". Partagées ici pour que la page Création produits affiche déjà
// les prix calculés, sans attendre l'étape de création Shopify.

// Prix de vente = coût x 2,1, arrondi au multiple de 50 DH supérieur, -1 DH
// (jamais un prix qui finit par 0). Ex : coût 60 -> 126 -> 150 -> 149.
export function computeSellPrice(cost: number): number {
  return Math.ceil((cost * 2.1) / 50) * 50 - 1;
}

// Prix de comparaison (affiché barré) : entier se terminant par 9, choisi
// aléatoirement parmi les valeurs donnant une remise affichée entre 10 %
// et 30 % par rapport au prix de vente.
export function computeCompareAtPrice(sellPrice: number): number {
  const candidates: number[] = [];
  for (let c = sellPrice; c <= sellPrice * 1.5; c++) {
    if (c % 10 !== 9) continue;
    const discount = (c - sellPrice) / c;
    if (discount >= 0.1 && discount <= 0.3) candidates.push(c);
  }
  if (candidates.length === 0) return sellPrice;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
