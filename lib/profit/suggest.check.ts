// Vérification rapide : npx tsx lib/profit/suggest.check.ts
import assert from "node:assert";
import { buildSuggester, looksMultiProduct } from "./suggest";

const art = (code: string, designation: string, unitCost = 100) => ({ code, designation, unitCost, costLabel: "Local · prix d'achat" });
const suggest = buildSuggester(
  [art("V2601", "VOITURE 10-2601"), art("TRI", "TRICYCLE MZ 03-10"), art("CHAT", "CHAT PELUCHE HJ-22"), art("SIEGE", "SIEGE AUTO KIDILO"), art("PIANO", "PIANO 937")],
  [{ id: "gid://shopify/ProductVariant/1", name: "Chaton Siamois Interactif – Peluche Animée avec Sons", code: "CHAT" }]
);

assert.equal(suggest("MZ-10-2601 Rouge")[0].code, "V2601", "référence chiffrée commune");
const chat = suggest("Chaton Siamois Interactif")[0];
assert.equal(chat.code, "CHAT", "trouvé par le titre du produit Shopify relié");
assert.equal(chat.via?.variantId, "gid://shopify/ProductVariant/1");
assert.equal(suggest("Siege Auto Kidilo Isofix")[0].code, "SIEGE");
assert.equal(suggest("Siege Auto Kidilo Isofix")[0].via, null, "trouvé par la désignation ALBASEET+");
assert.equal(suggest("Piano 937")[0].code, "PIANO");
assert.equal(suggest("Poupée qui parle").length, 0, "rien de ressemblant");
assert.ok(suggest("Voiture").length <= 3);

assert.equal(looksMultiProduct("Quad Electrique x1, Vespa Electrique Rose x1"), true);
assert.equal(looksMultiProduct("2xVoiture Metal + Ranger Rover Evoque Rastar"), true);
assert.equal(looksMultiProduct("Chaton Siamois Interactif x1"), false);
assert.equal(looksMultiProduct("Pochette Stickers Panini WC x10"), false);
assert.equal(looksMultiProduct("Voiture 4x4 Bmw"), false);
assert.equal(looksMultiProduct("Siege Auto Kidilo Isofix"), false);

console.log("suggest checks OK");
