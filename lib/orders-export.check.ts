// Vérification rapide : npx tsx lib/orders-export.check.ts
import assert from "node:assert";
import { STATE_FILL, carrierFill, exportRow, monthBanner, monthPeriod, transporterName, type ExportOrder } from "./orders-export";

const oct = monthPeriod("2026-10")!;
assert.equal(oct.from, "2026-10-01");
assert.equal(oct.to, "2026-10-31");
assert.equal(monthPeriod("2026-02")!.to, "2026-02-28");
assert.equal(monthPeriod("2028-02")!.to, "2028-02-29");
assert.ok(oct.start < oct.end);
assert.equal(monthPeriod("2026-13"), null);
assert.equal(monthPeriod("octobre"), null);
assert.equal(monthPeriod(undefined), null);

const base: ExportOrder = {
  orderNumber: "#7001",
  localNote: null,
  createdAt: new Date("2026-10-05T10:00:00Z"),
  customerName: "Sara B.",
  city: "Rabat",
  totalPrice: "349.00",
  shippingFee: "40",
  carrier: "FORCELOG",
  forcelogCode: null,
  ozonCode: null,
  localDelivery: false,
  localCourier: null,
  localStatus: null,
  forcelogStatusCode: null,
  forcelogStatus: null,
  ozonStatus: null,
  parcels: [],
  items: [{ title: "Licorne", quantity: 2 }, { title: "Puzzle", quantity: 1 }],
};
assert.equal(transporterName(base), "", "aucun colis : transporteur vide");
assert.equal(transporterName({ ...base, forcelogCode: "F1" }), "Forcelog");
assert.equal(transporterName({ ...base, ozonCode: "O1" }), "Ozon Express");
assert.equal(transporterName({ ...base, parcels: [{ carrier: "OZON", statusCode: null, status: "Livré" }] }), "Ozon Express");
assert.equal(transporterName({ ...base, localDelivery: true, localCourier: "Amine" }), "Amine");

const row = exportRow(base);
assert.equal(row.date, "05/10/2026");
assert.equal(row.articles, "Licorne × 2\nPuzzle × 1");
assert.equal(row.fraisLivraison, 40);
assert.equal(row.prix, 349);
assert.equal(exportRow({ ...base, shippingFee: null }).fraisLivraison, null, "frais inconnus : cellule vide");
assert.equal(exportRow({ ...base, shippingFee: 0 }).fraisLivraison, 0, "livraison gratuite : 0");

// Retours : colis refusé/annulé/retourné (Forcelog et Ozon), retour d'une livraison Casa.
const parcel = (carrier: "FORCELOG" | "OZON", statusCode: string | null, status: string) => ({ carrier, statusCode, status });
assert.equal(exportRow(base).state, "encours");
assert.equal(exportRow(base).remarque, "");
assert.equal(exportRow({ ...base, parcels: [parcel("OZON", null, "Retourné")] }).remarque, "Retourné");
assert.equal(exportRow({ ...base, parcels: [parcel("OZON", null, "Refusé")] }).state === "retour", true);
assert.equal(exportRow({ ...base, parcels: [parcel("OZON", null, "Livré")] }).state === "retour", false);
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", "RETURNED", "Retourné")] }).state === "retour", true, "retourné chez Forcelog");
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", "DELIVERED", "Livré")] }).state === "retour", false);
assert.equal(exportRow({ ...base, ozonCode: "O1", ozonStatus: "Annulé" }).state === "retour", true, "sans ligne Parcel : statut de la commande");
assert.equal(exportRow({ ...base, localDelivery: true, localCourier: "Amine", localStatus: "RETOUR" }).state === "retour", true);
assert.equal(exportRow({ ...base, localDelivery: true, localCourier: "Amine", localStatus: "LIVREE" }).state === "retour", false);

// Colis sans code machine, seulement un libellé (cas réel de Forcelog et Ozon).
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", null, "Retourné Reçu par client")] }).state === "retour", true);
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", null, "Retourné Expédier vers client")] }).state === "retour", true);
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", null, "Retourné Préparation Retour")] }).state === "retour", true);
assert.equal(exportRow({ ...base, parcels: [parcel("OZON", null, "Retourné Expédié au client")] }).state === "retour", true);
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", null, "Nouveau")] }).state === "retour", false);
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", null, "Reporté 2026-10-29")] }).state === "retour", false);
assert.equal(exportRow({ ...base, forcelogCode: "F1", forcelogStatusCode: "RETURNED", forcelogStatus: "Retourné" }).state === "retour", true, "statut sur la commande");
assert.equal(
  exportRow({ ...base, forcelogCode: "F1", forcelogStatus: "Retourné", parcels: [parcel("FORCELOG", "DELIVERED", "Livré")] }).state,
  "livree",
  "dernier colis livré : pas un retour"
);

// Format de la feuille de suivi : statut, confirmation, prix vide pour un retour, couleurs, bandeau.
const delivered = exportRow({ ...base, parcels: [parcel("FORCELOG", "DELIVERED", "Livré")] });
assert.deepEqual([delivered.statut, delivered.confirmation, delivered.prix], ["livrée", "valider", 349]);
const back = exportRow({ ...base, parcels: [parcel("FORCELOG", null, "Retourné Reçu par client")] });
assert.deepEqual([back.statut, back.confirmation, back.prix, back.remarque], ["RETOUR", "annuler", null, "Retourné"]);
assert.equal(exportRow({ ...base, localDelivery: true, localCourier: "Amine", localStatus: "LIVREE" }).statut, "livrée");
assert.equal(exportRow({ ...base, localDelivery: true, localCourier: "Amine", localStatus: "A_LIVRER" }).statut, "en cours");
assert.equal(exportRow({ ...base, localNote: "Appeler avant" }).remarque, "Appeler avant");
assert.equal(exportRow({ ...base, orderNumber: "#7848" }).numero, "#7848");
assert.equal(carrierFill("Forcelog"), "FFE6DDF5");
assert.equal(carrierFill(""), null);
assert.equal(carrierFill("Younes"), carrierFill("Younes"), "couleur stable pour un livreur inconnu");
assert.ok(STATE_FILL.livree && STATE_FILL.retour && STATE_FILL.encours === null);
assert.equal(monthBanner("2026-10"), "Mois d'Octobre 01/10/2026");
assert.equal(monthBanner("2026-06"), "Mois de Juin 01/06/2026");
assert.equal(monthBanner("2026-08"), "Mois d'Août 01/08/2026");

console.log("orders-export checks OK");
