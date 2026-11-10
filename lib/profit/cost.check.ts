// Vérification rapide : npx tsx lib/profit/cost.check.ts
import assert from "node:assert";
import { pricesAt, resolveCost, type PricePoint } from "./cost";
import { autoMatch, normBarcode, type LinkState } from "./matching";

// ── Coût selon le type ──
assert.deepEqual(
  [resolveCost("LOCAL", { prixAchat: 100, prixGros: 80 }).unitCost, resolveCost("LOCAL", { prixAchat: 100, prixGros: 80 }).source],
  [100, "PRIX_ACHAT"]
);
assert.equal(resolveCost("IMPORTE", { prixAchat: 100, prixGros: 80 }).unitCost, 80);
const noGros = resolveCost("IMPORTE", { prixAchat: 100, prixGros: null });
assert.equal(noGros.unitCost, 100);
assert.equal(noGros.flag, "GROS_MANQUANT");
const nc = resolveCost("NON_CLASSE", { prixAchat: 100, prixGros: 80 });
assert.equal(nc.unitCost, 100, "non classé : prix d'achat");
assert.equal(nc.flag, "A_CLASSER");
assert.equal(resolveCost("LOCAL", { prixAchat: 0, prixGros: null }).flag, "SANS_PRIX", "0 = pas de prix");
assert.equal(resolveCost("IMPORTE", { prixAchat: null, prixGros: null }).unitCost, null);

// ── Prix à la date de la commande ──
const h: PricePoint[] = [
  { effectiveAt: new Date("2026-09-01"), prixAchat: 100, prixGros: 70 },
  { effectiveAt: new Date("2026-10-15"), prixAchat: 120, prixGros: 75 },
];
const current = { prixAchat: 130, prixGros: 80 };
assert.equal(pricesAt(h, current, new Date("2026-10-01")).prixAchat, 100);
assert.equal(pricesAt(h, current, new Date("2026-10-20")).prixGros, 75);
assert.equal(pricesAt(h, current, new Date("2026-08-01")).prixAchat, 100, "avant tout historique : plus ancien prix connu");
assert.equal(pricesAt([], current, new Date()).prixAchat, 130, "sans historique : prix actuels");

// ── Association automatique ──
assert.equal(normBarcode("0 6974647852749"), "6974647852749");
const articles = [
  { code: "A1", barcode: "6974647852749", designation: "UNO CARTES" },
  { code: "MOTO-GS", barcode: null, designation: "MOTO BMW GS 1200 ELECTRIQUE" },
  { code: "CHAT01", barcode: null, designation: "CHAT INTERACTIF PELUCHE" },
];
const variants = [
  { id: "v1", productTitle: "UNO - Jeu de Cartes", variantTitle: null, sku: "UNO", barcode: "6974647852749" },
  { id: "v2", productTitle: "Moto BMW GS 1200", variantTitle: "Noir", sku: "moto-gs", barcode: null },
  { id: "v3", productTitle: "Chat Interactif – Peluche Animée", variantTitle: null, sku: null, barcode: null },
  { id: "v4", productTitle: "Tapis de jeu", variantTitle: null, sku: null, barcode: null },
  { id: "v5", productTitle: "Chat Interactif – Peluche", variantTitle: null, sku: null, barcode: null },
];
const none = new Map<string, LinkState>();
const res = autoMatch(variants, articles, none);
const by = new Map(res.map((r) => [r.variantId, r]));
assert.equal(by.get("v1")?.method, "BARCODE");
assert.equal(by.get("v2")?.method, "SKU");
assert.equal(by.get("v2")?.albaseetCode, "MOTO-GS");
assert.equal(by.get("v3")?.method, "NAME");
assert.equal(by.get("v3")?.albaseetCode, "CHAT01");
assert.ok(!by.has("v4"), "aucun nom proche : pas de lien");
// Un lien manuel n'est jamais remplacé
const manual = new Map<string, LinkState>([["v1", { albaseetCode: "AUTRE", method: "MANUAL", score: null }]]);
assert.ok(!autoMatch(variants, articles, manual).some((r) => r.variantId === "v1"));
// Un lien par le nom est remplacé par le code-barres
const named = new Map<string, LinkState>([["v1", { albaseetCode: "X", method: "NAME", score: 0.7 }]]);
assert.equal(autoMatch(variants, articles, named).find((r) => r.variantId === "v1")?.method, "BARCODE");
// Le même lien n'est pas réécrit
const same = new Map<string, LinkState>([["v1", { albaseetCode: "A1", method: "BARCODE", score: null }]]);
assert.ok(!autoMatch(variants, articles, same).some((r) => r.variantId === "v1"));

// SKU Shopify = désignation ALBASEET+ (casse, espaces, espaces autour de * et - ignorés)
{
  const arts = [
    { code: "16526", barcode: null, designation: "VOITURE METAL TL 25100*12C" },
    { code: "16527", barcode: null, designation: "BABYWALKER 07-45*4C" },
    { code: "16528", barcode: null, designation: "MAISON PILSAN 6093" },
    { code: "16529", barcode: null, designation: "maison pilsan 6093" },
  ];
  const vars = [
    { id: "r", productTitle: "Voiture", variantTitle: "Rouge", sku: "voiture  metal tl 25100 * 12c", barcode: null },
    { id: "b", productTitle: "Voiture", variantTitle: "Bleu", sku: "VOITURE METAL TL 25100 *12C", barcode: null },
    { id: "w", productTitle: "Trotteur", variantTitle: null, sku: "BABYWALKER 07 - 45 *4C", barcode: null },
    { id: "m", productTitle: "Maison", variantTitle: null, sku: "MAISON PILSAN 6093", barcode: null },
  ];
  const r = new Map(autoMatch(vars, arts, new Map()).map((x) => [x.variantId, x]));
  assert.equal(r.get("r")?.albaseetCode, "16526");
  assert.equal(r.get("r")?.method, "DESIGNATION");
  assert.equal(r.get("b")?.albaseetCode, "16526", "variantes au même SKU = même article");
  assert.equal(r.get("w")?.albaseetCode, "16527");
  assert.notEqual(r.get("m")?.method, "DESIGNATION", "désignation en double = ambiguë");
  // Un SKU sans lettre n'est pas comparé au code interne
  assert.ok(!autoMatch([{ id: "n", productTitle: "x", variantTitle: null, sku: "16528", barcode: null }], arts, new Map()).length);
  // Un lien par le nom est remplacé ; un lien code-barres ne l'est pas
  assert.equal(autoMatch(vars, arts, new Map([["r", { albaseetCode: "X", method: "NAME", score: 0.9 }]])).find((x) => x.variantId === "r")?.method, "DESIGNATION");
  assert.ok(!autoMatch(vars, arts, new Map([["r", { albaseetCode: "X", method: "BARCODE", score: null }]])).some((x) => x.variantId === "r"));
}

console.log("cost + matching checks OK");
