// Vérification rapide : npx tsx lib/payment-method.check.ts
import assert from "node:assert";
import { cleanPaidMethod, paidLabel } from "./payment-method";

assert.equal(cleanPaidMethod("CARTE"), "CARTE");
assert.equal(cleanPaidMethod("WAFACASH_CASHPLUS"), "WAFACASH_CASHPLUS");
assert.equal(cleanPaidMethod(""), null);
assert.equal(cleanPaidMethod("on"), null);
assert.equal(cleanPaidMethod(null), null);

assert.equal(paidLabel({ paidOnline: false, paidMethod: null }), null);
assert.equal(paidLabel({ paidOnline: false, paidMethod: "CARTE" }), null, "pas payée : aucun libellé");
assert.equal(paidLabel({ paidOnline: true, paidMethod: null }), "Payée en ligne par carte", "avant paidMethod = carte");
assert.equal(paidLabel({ paidOnline: true, paidMethod: "WAFACASH_CASHPLUS" }), "Payée par Wafacash / Cashplus");

console.log("payment-method checks OK");
