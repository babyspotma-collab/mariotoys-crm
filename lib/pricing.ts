// Règles de prix : prix de vente = coût arrondi au multiple de 50 DH
// supérieur, puis -1 DH (jamais un prix rond). Prix de comparaison =
// remise aléatoire affichée entre 10% et 30% (comparePrice tel que
// price = comparePrice * (1 - remise)).

export function computeSalePrice(cost: number): number {
  const roundedUp = Math.ceil(cost / 50) * 50;
  return roundedUp - 1;
}

export function computeCompareAtPrice(price: number): number {
  const discount = 0.1 + Math.random() * 0.2; // entre 10% et 30%
  return Math.round(price / (1 - discount));
}
