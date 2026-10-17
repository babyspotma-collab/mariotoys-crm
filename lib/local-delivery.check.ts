// Vérification rapide : npx tsx lib/local-delivery.check.ts
import assert from "node:assert";
import { COURIER_MAX_LENGTH, DEFAULT_COURIERS, LOCAL_STATUS, cleanCourier, isLocalStatus } from "./local-delivery";

// Livreurs par défaut : écriture officielle, quelle que soit la saisie
assert.deepEqual([...DEFAULT_COURIERS], ["Amine", "Nizar", "Retrait Dépot", "Retrait Magasin"]);
assert.equal(cleanCourier("retrait depot"), "Retrait Dépot");
assert.equal(cleanCourier("RETRAIT MAGASIN"), "Retrait Magasin");
assert.equal(cleanCourier("Amine"), "Amine");
assert.equal(cleanCourier("amine"), "Amine");
assert.equal(cleanCourier("  NIZAR  "), "Nizar");
assert.equal(cleanCourier("Aminé"), "Amine", "accents ignorés pour reconnaître un livreur par défaut");

// Autre livreur : conservé tel que saisi, nettoyé
assert.equal(cleanCourier("Youssef"), "Youssef");
assert.equal(cleanCourier("  Moha    med  "), "Moha med", "espaces normalisés");
assert.equal(cleanCourier("Ali\nBen\tSaid"), "Ali Ben Said", "retours à la ligne et tabulations");
assert.equal(cleanCourier("A\u0000B\u0007C"), "A B C", "caractères de contrôle");

// Vide ou invalide : refus (chaîne vide)
for (const bad of ["", "   ", "\n\t", null, undefined, 42, {}, []]) {
  assert.equal(cleanCourier(bad as unknown), "", `refusé : ${JSON.stringify(bad)}`);
}

// 40 caractères maximum, sans espace final
const long = cleanCourier("x".repeat(100));
assert.equal(long.length, COURIER_MAX_LENGTH);
assert.equal(cleanCourier("a".repeat(39) + " bcd"), "a".repeat(39), "coupé à 40 puis espace final retiré");

// Statuts
assert.deepEqual(Object.keys(LOCAL_STATUS), ["A_LIVRER", "LIVREE", "RETOUR"]);
assert.equal(LOCAL_STATUS.A_LIVRER.label, "Chez le livreur");
assert.ok(isLocalStatus("LIVREE") && !isLocalStatus("CONFIRMEE") && !isLocalStatus(null));

console.log("local-delivery checks OK");
