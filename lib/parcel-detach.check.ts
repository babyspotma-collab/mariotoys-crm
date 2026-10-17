// Vérification rapide : npx tsx lib/parcel-detach.check.ts
import assert from "node:assert";
import { detachConfirmMessage } from "./parcel-detach";

const base = { orderNumber: "#7650", customerName: "Kenza M.", carrier: "FORCELOG" as const, code: "FC123456", status: "Attente De Ramassage" };

const m = detachConfirmMessage(base);
const paragraphs = m.split("\n\n");
assert.equal(paragraphs.length, 4, "4 paragraphes");
assert.ok(m.includes("Le colis FC123456 (Forcelog, statut « Attente De Ramassage ») sera retiré de la commande #7650 de Kenza M."), "colis, transporteur, statut, commande");
assert.ok(m.includes("redevient « Confirmée sans colis »"), "annonce le résultat");
assert.ok(m.includes("Livraison Casa"), "rappelle la remise à un livreur");
assert.ok(m.includes("Le CRM n'annule PAS le colis chez Forcelog : annule-le d'abord chez Forcelog"), "avertit que le transporteur n'est pas prévenu");
assert.ok(m.endsWith("Continuer ?"));

// Ozon Express
const oz = detachConfirmMessage({ ...base, carrier: "OZON", code: "OZ99", status: "Livré" });
assert.ok(oz.includes("Le colis OZ99 (Ozon Express, statut « Livré »)") && oz.includes("chez Ozon Express"));

// Informations manquantes : message toujours lisible
const unknown = detachConfirmMessage({ ...base, carrier: null, code: null, status: null });
assert.ok(unknown.includes("Le colis (le transporteur) sera retiré"));
assert.ok(unknown.includes("annule-le d'abord chez Forcelog/Ozon"));
assert.ok(!unknown.includes("null") && !unknown.includes("undefined"));

console.log("parcel-detach checks OK");
