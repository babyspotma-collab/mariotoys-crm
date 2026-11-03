// Vérification rapide : npx tsx lib/revenue.check.ts
import assert from "node:assert";
import { revenueState, summarizeRevenue, type RevenueOrder } from "./revenue";

const base: RevenueOrder = {
  totalPrice: "100",
  localDelivery: false,
  localCourier: null,
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
assert.equal(revenueState({ ...base, localDelivery: true, localCourier: "Nizar", localStatus: "A_LIVRER" }), "en_cours", "chez un livreur Casa");
assert.equal(revenueState({ ...base, localDelivery: true, localCourier: null, localStatus: "A_LIVRER" }), "a_expedier", "Casa sans livreur");
assert.equal(revenueState({ ...base, localDelivery: true, localStatus: "LIVREE" }), "livree");
assert.equal(revenueState({ ...base, localDelivery: true, localStatus: "RETOUR" }), "retour");

const s = summarizeRevenue([
  { ...base, totalPrice: 300, parcels: [parcel("OZON", null, "Livré")] },
  { ...base, totalPrice: 200, parcels: [parcel("OZON", null, "Livré")] },
  { ...base, totalPrice: 150 },
  { ...base, totalPrice: 80, parcels: [parcel("FORCELOG", null, "Retourné")] },
  { ...base, totalPrice: 120, parcels: [parcel("FORCELOG", null, "Colis expédié")] },
]);
assert.deepEqual(s.sales, { count: 3, amount: 620 }, "livrées + en cours, sans pas expédiées ni retours");
assert.deepEqual(s.delivered, { count: 2, amount: 500 });
assert.deepEqual(s.notShipped, { count: 1, amount: 150 });
assert.deepEqual(s.returned, { count: 1, amount: 80 });
assert.equal(s.confirmedAmount, 850);
assert.equal(s.avgBasket, 207);
assert.equal(summarizeRevenue([]).avgBasket, null);

console.log("revenue checks OK");
