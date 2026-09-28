// Vérification rapide : npx tsx lib/parcel-limits.check.ts
import assert from "node:assert";
import { buildProductNature, tooLongError } from "./parcel-limits";

// Cas réel #7409 : variante "Bleu" gardée, détails "avec…" / "- Rose" retirés.
assert.equal(
  buildProductNature([{ title: "Baby Car Quad avec Poignée et Barre de sécurité - Rose (variante : Bleu)", quantity: 1 }]),
  "Baby Car Quad Bleu x1"
);

// Plusieurs articles aux noms longs : tient en 100, quantités gardées.
const many = buildProductNature([
  { title: "Vélo 12 Pouces Pliable – avec Klaxon, Panier et Petites Roues", quantity: 1 },
  { title: "Mon Petit Chiot Interactif – Peluche Animée & Musicale", quantity: 2 },
  { title: "Kart Électrique Enfant 24V avec Télécommande – Rouge", quantity: 1 },
  { title: "Squishy Bun Mystère – Petit Dumpling Surprise", quantity: 3 },
]);
assert.ok(many.length <= 100, many);
assert.match(many, /^Vélo 12 Pouces Pliable x1, Mon Petit Chiot .*x2, Kart Électrique .*x1, Squishy Bun .*x3$/);

// Dernier recours : coupe nette à 100 caractères.
const huge = buildProductNature(Array.from({ length: 12 }, (_, i) => ({ title: `Produit numéro ${i} extraordinaire`, quantity: 1 })));
assert.equal(huge.length, 100);

assert.equal(buildProductNature([]), "Jouet");
assert.equal(buildProductNature([{ title: "VTech - Téléphone Bébé Interactif", quantity: 2 }]), "VTech Téléphone Bébé Interactif x2");
assert.equal(
  tooLongError("OZON", { receiver: "x".repeat(26), address: "", comment: "", productNature: "" }),
  "Nom du destinataire trop long (25 caractères max, 26 actuellement)."
);
assert.equal(tooLongError("FORCELOG", { receiver: "x".repeat(40), address: "", comment: "", productNature: "ok" }), null);
console.log("parcel-limits checks OK:", many);
