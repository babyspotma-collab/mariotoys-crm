// Vérification rapide : npx tsx lib/home-stats.check.ts
import assert from "node:assert";
import { categoryById } from "./parcel-categories";
import { ozonCategoryById } from "./ozon-categories";
import { mergePending, normalizeCity, parcelBucket, summarizeCarrier, summarizeCasa, summarizeOrders, topCities } from "./home-stats";

// ── Top villes : les variantes d'une même ville sont fusionnées ──────────────
assert.equal(normalizeCity("  Fès "), "fes");
assert.equal(normalizeCity("CASABLANCA"), "casablanca");
const t = topCities([
  { city: "Casablanca", count: 50 },
  { city: "casablanca", count: 10 },
  { city: "CASABLANCA ", count: 5 },
  { city: "Fès", count: 20 },
  { city: "Fes", count: 5 },
  { city: "Rabat", count: 30 },
  { city: "Temara", count: 8 },
  { city: "Marrakech", count: 7 },
  { city: "Agadir", count: 6 },
  { city: "Tanger", count: 4 },
  { city: "", count: 3 },
  { city: null, count: 2 },
]);
assert.equal(t.total, 150, "total = toutes les commandes Shopify, villes vides comprises");
assert.equal(t.withoutCity, 5, "commandes sans ville comptées à part");
assert.equal(t.cities.length, 5, "5 villes au maximum");
assert.deepEqual(t.cities.map((c) => c.label), ["Casablanca", "Rabat", "Fès", "Temara", "Marrakech"], "classement après fusion des variantes");
assert.deepEqual(t.cities.map((c) => c.count), [65, 30, 25, 8, 7]);
assert.equal(t.cities[0].share, 43, "part = 65 / 150");
assert.equal(topCities([]).cities.length, 0);
const ab = topCities([{ city: "Casablanca", count: 10 }, { city: "Csa", count: 4 }, { city: "Mrk", count: 3 }, { city: "Marrakech", count: 2 }]);
assert.deepEqual(ab.cities.map((c) => [c.label, c.count]), [["Casablanca", 14], ["Marrakech", 5]], "abréviations fusionnées avec la ville complète");
assert.equal(topCities([{ city: "rabat", count: 2 }]).cities[0].label, "Rabat", "écriture tout en minuscules : première lettre en majuscule");
assert.equal(topCities([{ city: "El Jadida", count: 2 }]).cities[0].label, "El Jadida", "écriture déjà mixte conservée");

// ── Commandes ────────────────────────────────────────────────────────────────
const o = summarizeOrders([
  { status: "NOUVELLE", count: 10, amount: 1000 },
  { status: "CONFIRMEE", count: 30, amount: "6000.50" },
  { status: "ANNULEE", count: 10, amount: 900 },
]);
assert.deepEqual([o.total, o.confirmed, o.nouvelle, o.annulee], [50, 30, 10, 10]);
assert.equal(o.confirmationRate, 60);
assert.equal(o.confirmedAmount, 6000.5, "le chiffre d'affaires ne compte QUE les confirmées");
assert.equal(o.avgBasket, 200);
const none = summarizeOrders([]);
assert.deepEqual([none.total, none.confirmationRate, none.avgBasket], [0, null, null]);

// ── Statuts transporteur : mêmes catégories que la page Statistiques ─────────
const flDelivered = categoryById("delivered").codes[0];
const flCancelled = categoryById("cancelled").codes[0];
const flShipped = categoryById("shipped").codes[0];
const flNoAnswer = categoryById("noAnswer").codes[0];
assert.equal(parcelBucket("FORCELOG", flDelivered, "x"), "delivered");
assert.equal(parcelBucket("FORCELOG", flCancelled, "x"), "returns");
assert.equal(parcelBucket("FORCELOG", flShipped, "x"), "ongoing");
assert.equal(parcelBucket("FORCELOG", flNoAnswer, "x"), "other", "sans réponse : ni livré ni retour");
assert.equal(parcelBucket("FORCELOG", null, "Nouveau"), "other");
const ozDelivered = ozonCategoryById("delivered").statuses[0];
const ozCancelled = ozonCategoryById("cancelled").statuses[0];
const ozShipped = ozonCategoryById("shipped").statuses[0];
assert.equal(parcelBucket("OZON", null, ozDelivered), "delivered");
assert.equal(parcelBucket("OZON", null, ozCancelled), "returns");
assert.equal(parcelBucket("OZON", null, ozShipped), "ongoing");
assert.equal(parcelBucket("OZON", null, "Statut inconnu"), "other");

// ── Résumé par transporteur ──────────────────────────────────────────────────
const parcels = [
  { carrier: "FORCELOG" as const, statusCode: flDelivered, status: "Livré", count: 8, amount: 2400 },
  { carrier: "FORCELOG" as const, statusCode: flCancelled, status: "Annulé", count: 2, amount: 600 },
  { carrier: "FORCELOG" as const, statusCode: flShipped, status: "En route", count: 5, amount: 1500 },
  { carrier: "FORCELOG" as const, statusCode: null, status: "Nouveau", count: 5, amount: 1500 },
  { carrier: "OZON" as const, statusCode: null, status: ozDelivered, count: 3, amount: 900 },
  { carrier: "OZON" as const, statusCode: null, status: ozCancelled, count: 1, amount: 300 },
];
const invoices = [
  { carrier: "FORCELOG" as const, amount: 2000, parcelsCount: 7 },
  { carrier: "FORCELOG" as const, amount: "300.50", parcelsCount: 1 },
  { carrier: "OZON" as const, amount: 0, parcelsCount: 0 },
];
const f = summarizeCarrier("FORCELOG", parcels, invoices);
assert.deepEqual([f.sent, f.delivered, f.ongoing, f.returns, f.other], [20, 8, 5, 2, 5]);
assert.equal(f.deliveredAmount, 2400, "montant livré = somme des colis livrés seulement");
assert.deepEqual([f.deliveryRate, f.returnRate], [40, 10]);
assert.equal(f.cashIn, 2300.5, "encaissé = somme des factures de la période");
const z = summarizeCarrier("OZON", parcels, invoices);
assert.deepEqual([z.sent, z.delivered, z.returns], [4, 3, 1]);
assert.equal(z.deliveredAmount, 900);
assert.equal(z.cashIn, null, "aucun colis facturé : pas de montant encaissé");
const empty = summarizeCarrier("FORCELOG", [], []);
assert.deepEqual([empty.sent, empty.deliveryRate, empty.returnRate, empty.cashIn], [0, null, null, null]);

// ── Livraison Casablanca ─────────────────────────────────────────────────────
const c = summarizeCasa(
  [
    { courier: "Nizar", count: 2, amount: 300 },
    { courier: "Amine", count: 3, amount: "850.00" },
    { courier: null, count: 1, amount: 50 },
  ],
  [
    { status: "LIVREE", count: 7, amount: 2100 },
    { status: "RETOUR", count: 1, amount: 120 },
  ]
);
assert.equal(c.pendingCount, 6);
assert.equal(c.pendingAmount, 1200);
assert.deepEqual(c.couriers.map((x) => x.name), ["Amine", "Nizar", "—"], "livreurs triés par montant à récupérer");
assert.deepEqual([c.deliveredCount, c.deliveredAmount, c.returnedCount, c.returnedAmount], [7, 2100, 1, 120]);
const merged = mergePending([
  { localCourier: "Amine", paidOnline: false, _count: 2, _sum: { totalPrice: 300 } },
  { localCourier: "Amine", paidOnline: true, _count: 1, _sum: { totalPrice: 500 } },
  { localCourier: null, paidOnline: true, _count: 1, _sum: { totalPrice: 80 } },
]);
assert.deepEqual(merged, [{ courier: "Amine", count: 3, amount: 300 }, { courier: null, count: 1, amount: 0 }], "payée en ligne = 0 DH à récupérer, mais bien comptée");
const c0 =summarizeCasa([], []);
assert.deepEqual([c0.pendingCount, c0.pendingAmount, c0.deliveredCount, c0.returnedCount, c0.couriers.length], [0, 0, 0, 0, 0]);

console.log("home-stats checks OK");
