// Vérification rapide : npx tsx lib/product-match.check.ts
import assert from "node:assert";
import { indexCatalogue, matchProducts } from "./product-match";

const idx = indexCatalogue([
  { id: "1", title: "Pâte à Modeler : Pack de 8 Pots - Play Doh", price: 159, status: "ACTIVE" },
  { id: "2", title: "Peluche Licorne Little Pony", price: 89, status: "ACTIVE" },
  { id: "3", title: "Ma Licorne Bijoux Magiques - VTech", price: 479, status: "ACTIVE" },
  { id: "4", title: "Licorne Brouillon", price: 10, status: "DRAFT" },
  { id: "5", title: "Pot d’Apprentissage Baybee – Siège de Toilette Bébé", price: 289, status: "ACTIVE" },
  { id: "6", title: "Playmobil Pirates", price: 200, status: "ACTIVE" },
]);
const ids = (q: string, n = 8) => matchProducts(idx, q, n).map((p) => p.id);

assert.deepEqual(ids("pate"), ["1"], "sans accent : « pate » trouve « Pâte »");
assert.deepEqual(ids("PÂTE modeler"), ["1"], "casse et accents ignorés");
assert.deepEqual(ids("licorn"), ["2", "3", "4"], "licorne : actifs d'abord (le plus court en premier), brouillon en dernier");
assert.deepEqual(ids("toilette bebe"), ["5"], "plusieurs mots, ordre libre, accents ignorés");
assert.deepEqual(ids("bebe toilette"), ["5"]);
assert.deepEqual(ids("pot d'appr"), ["5"], "apostrophe typographique ou droite");
assert.deepEqual(ids("play")[0], "6", "le titre qui commence par la saisie passe en premier");
assert.deepEqual(ids("play").sort(), ["1", "6"]);
assert.deepEqual(ids("a"), [], "moins de 2 lettres : rien");
assert.deepEqual(ids("zzz"), []);
assert.equal(matchProducts(idx, "licorn", 2).length, 2, "limite respectée");
console.log("product-match checks OK");
