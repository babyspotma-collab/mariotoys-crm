// Vérification rapide : npx tsx lib/shopify-payment.check.ts
import assert from "node:assert";
import { isPaidByCard } from "./shopify-payment";

assert.equal(isPaidByCard("PAID", ["Payzone Maroc"]), true);
assert.equal(isPaidByCard("paid", ["Payzone Maroc"]), true, "le webhook envoie 'paid' en minuscules");
assert.equal(isPaidByCard("PENDING", ["Payzone Maroc"]), false, "pas encore payée");
assert.equal(isPaidByCard("PAID", ["Cash on Delivery (COD)"]), false, "COD marquée payée à la main");
assert.equal(isPaidByCard("PAID", ["Paiement à la livraison"]), false);
assert.equal(isPaidByCard("PAID", ["manual", "Paiement à la livraison"]), false);
assert.equal(isPaidByCard("PAID", []), false, "aucune passerelle : on ne devine pas");
assert.equal(isPaidByCard(null, ["Payzone Maroc"]), false);
assert.equal(isPaidByCard("PAID", undefined), false);

console.log("shopify-payment checks OK");
