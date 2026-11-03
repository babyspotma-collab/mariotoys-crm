// Filtre "colis de la période" pour les pages Accueil, Colis et Statistiques.
//
// La date de création chez le transporteur (carrierCreatedAt) manque sur une
// partie des colis (le transporteur ne la donne pas toujours à la première
// synchronisation) : filtrés par cette date seule, ils disparaissaient des mois
// affichés. À défaut, on prend la date de la commande à laquelle le colis est
// rattaché.

export function parcelInRange(range: { start: Date; end: Date }) {
  const between = { gte: range.start, lt: range.end };
  return {
    OR: [{ carrierCreatedAt: between }, { carrierCreatedAt: null, order: { createdAt: between } }],
  };
}
