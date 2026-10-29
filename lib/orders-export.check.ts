// Vérification rapide : npx tsx lib/orders-export.check.ts
import assert from "node:assert";
import { exportRow, monthPeriod, transporterName, type ExportOrder } from "./orders-export";

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
assert.equal(exportRow(base).retourne, false);
assert.equal(exportRow(base).remarque, "");
assert.equal(exportRow({ ...base, parcels: [parcel("OZON", null, "Retourné")] }).remarque, "Retourné");
assert.equal(exportRow({ ...base, parcels: [parcel("OZON", null, "Refusé")] }).retourne, true);
assert.equal(exportRow({ ...base, parcels: [parcel("OZON", null, "Livré")] }).retourne, false);
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", "RETURNED", "Retourné")] }).retourne, true, "retourné chez Forcelog");
assert.equal(exportRow({ ...base, parcels: [parcel("FORCELOG", "DELIVERED", "Livré")] }).retourne, false);
assert.equal(exportRow({ ...base, ozonCode: "O1", ozonStatus: "Annulé" }).retourne, true, "sans ligne Parcel : statut de la commande");
assert.equal(exportRow({ ...base, localDelivery: true, localCourier: "Amine", localStatus: "RETOUR" }).retourne, true);
assert.equal(exportRow({ ...base, localDelivery: true, localCourier: "Amine", localStatus: "LIVREE" }).retourne, false);

console.log("orders-export checks OK");
