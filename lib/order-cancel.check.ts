// Vérification rapide : npx tsx lib/order-cancel.check.ts
import assert from "node:assert";
import { CARRIER_PARCEL_WARNING, cancelConfirmMessage } from "./order-cancel";

const base = { orderNumber: "#7325", customerName: "Sara B.", hasCarrierParcel: false, localDelivery: false, localCourier: null };

// Commande simple : une seule ligne de confirmation, sans avertissement
const plain = cancelConfirmMessage(base);
assert.equal(plain, "Annuler la commande #7325 de Sara B. ?");

// Colis chez le transporteur : l'avertissement exact demandé est présent
const withParcel = cancelConfirmMessage({ ...base, hasCarrierParcel: true });
assert.ok(withParcel.startsWith("Annuler la commande #7325 de Sara B. ?"));
assert.ok(withParcel.includes("Un colis existe chez le transporteur : le CRM ne l'annule pas, pense à l'annuler chez Forcelog/Ozon."));
assert.equal(CARRIER_PARCEL_WARNING, "Un colis existe chez le transporteur : le CRM ne l'annule pas, pense à l'annuler chez Forcelog/Ozon.");

// Livraison Casa : le message annonce le retrait du suivi, avec le livreur
const casa = cancelConfirmMessage({ ...base, localDelivery: true, localCourier: "Amine" });
assert.ok(casa.includes("Livraison Casa chez Amine") && casa.includes("retirée de Livraisons Casa"));
assert.ok(!casa.includes("transporteur"), "pas d'avertissement transporteur sans colis");
assert.ok(cancelConfirmMessage({ ...base, localDelivery: true, localCourier: null }).includes("Livraison Casa :"), "livreur inconnu : message sans nom");

// Les deux situations à la fois
const both = cancelConfirmMessage({ ...base, hasCarrierParcel: true, localDelivery: true, localCourier: "Nizar" });
assert.ok(both.includes("chez Nizar") && both.includes("chez Forcelog/Ozon"));
assert.equal(both.split("\n\n").length, 3, "3 paragraphes séparés par une ligne vide");

console.log("order-cancel checks OK");
