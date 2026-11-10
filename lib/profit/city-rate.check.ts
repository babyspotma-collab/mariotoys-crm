// Vérification rapide : npx tsx lib/profit/city-rate.check.ts
import assert from "node:assert";
import { DEFAULT_CITY_KEY, cityKey, findRate, type RateRow } from "./city-rate";
import { similarity, textKey, tokens } from "./text";

const rates: RateRow[] = [
  { city: "Casablanca", cityKey: cityKey("Casablanca"), fee: 18 },
  { city: "Tit melil", cityKey: cityKey("Tit melil"), fee: 33 },
  { city: "Berrchid", cityKey: cityKey("Berrchid"), fee: 35 },
  { city: "Marrakech", cityKey: cityKey("Marrakech"), fee: 35 },
  { city: "Kenitra", cityKey: cityKey("Kenitra"), fee: 35 },
  { city: "Marina", cityKey: cityKey("Marina"), fee: 45 },
  { city: "Dar bouaza", cityKey: cityKey("Dar bouaza"), fee: 35 },
  { city: "Autres villes", cityKey: DEFAULT_CITY_KEY, fee: 45 },
];

// Accents, casse, lettres doublées
assert.equal(textKey("Tit Mellil"), textKey("tit melil"));
assert.equal(findRate("TIT MELLIL", rates).fee, 33);
assert.equal(findRate("Berrechid", rates).fee, 35, "alias Berrechid -> Berrchid");
assert.equal(findRate("Dar Bouazza", rates).fee, 35);
assert.equal(findRate("Marrakesh", rates).fee, 35);
// Quartiers et régions
assert.equal(findRate("Casablanca - Californie", rates).fee, 18);
assert.equal(findRate("Casablanca - Marina", rates).fee, 18, "le premier morceau qui correspond gagne");
assert.equal(findRate("Autre Quartier - Casablanca", rates).fee, 18);
assert.equal(findRate("KENITRA VILLE", rates).fee, 35);
assert.equal(findRate("Oulad hassoun-marrakech", rates).fee, 35);
// Faute de frappe sur un nom long
assert.equal(findRate("Casablanka", rates).fee, 18);
// Inconnue ou vide : tarif par défaut
const unknown = findRate("Zagora", rates);
assert.deepEqual(unknown, { fee: 45, city: null, isDefault: true });
assert.equal(findRate("", rates).fee, 45);
assert.equal(findRate("Rabat", []).fee, null, "aucun tarif (Ozon non rempli)");

// Rapprochement de noms de produits
const a = tokens("VOITURE ELECTRIQUE 12V 4X4 ROUGE");
const b = tokens("Voiture Électrique Enfant 12V 4x4 – Rouge");
assert.ok(similarity(a, b).score > 0.8);
assert.ok(similarity(tokens("Chat Interactif"), tokens("Mallette de dessin")).score === 0);

console.log("city-rate checks OK");
