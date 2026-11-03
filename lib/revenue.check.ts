// Vérification rapide : npx tsx lib/revenue.check.ts
import assert from "node:assert";
import { revenueState, summarizeRevenue, type RevenueOrder } from "./revenue";

const base: RevenueOrder = {
  totalPrice: "100",
  localDelivery: false,
  localStatus: null,
  forcelogCode: null,
  ozonCode: null,
  forcelogStatusCode: null,
  forcelogStatus: null,
  ozonStatus: null,
  parcels: [],
};
const parcel = (carrier: "FORCELOG" | "OZON", statusCode: string | null, status: string) => ({ carrier, statusCode, status });

assert.equal(revenueState(base), "a_expedier", "confirmée sans colis");
assert.equal(revenueState({ ...base, parcels: [parcel("FORCELOG", null, "Nouveau")] }), "a_expedier", "colis créé mais pas parti");
assert.equal(revenueState({ ...base, ozonCode: "O1", ozonStatus: "" }), "a_expedier", "code sans statut");
assert.equal(revenueState({ ...base, parcels: [parcel("OZON", null, "Colis expédié")] }), "en_cours");
assert.equal(revenueState({ ...base, parcels: [parcel("FORCELOG", null, "Retourné Reçu par client")] }), "retour");
assert.equal(revenueState({ ...base, parcels: [parcel("OZON", null, "Livré")] }), "livree");
assert.equal(revenueState({ ...base, localDelivery: true, localStatus: "A_LIVRER" }), "en_cours");
assert.equal(revenueState({ ...base, localDelivery: true, localStatus: "LIVREE" }), "livree");
assert.equal(revenueState({ ...base, localDelivery: true, localStatus: "RETOUR" }), "retour");

const s = summarizeRevenue([
  { ...base, totalPrice: 300, parcels: [parcel("OZON", null, "Livré")] },
  { ...base, totalPrice: 200, parcels: [parcel("OZON", null, "Livré")] },
  { ...base, totalPrice: 150 },
  { ...base, totalPrice: 80, parcels: [parcel("FORCELOG", null, "Retourné")] },
]);
assert.deepEqual(s.delivered, { count: 2, amount: 500 });
assert.deepEqual(s.notShipped, { count: 1, amount: 150 });
assert.deepEqual(s.returned, { count: 1, amount: 80 });
assert.equal(s.confirmedAmount, 730);
assert.equal(s.avgBasket, 250);
assert.equal(summarizeRevenue([]).avgBasket, null);

console.log("revenue checks OK");
