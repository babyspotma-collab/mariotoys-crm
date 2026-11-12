// Vérifications de lib/orders-export-profit.ts : npx tsx lib/orders-export-profit.check.ts
import assert from "node:assert/strict";
import { lineResolver } from "./profit/compute";
import type { CostArticle, PricePoint } from "./profit/cost";
import { profitCells } from "./orders-export-profit";

const articles = new Map<string, CostArticle>([
  ["A1", { code: "A1", designation: "QUAD 12V", costType: "IMPORTE", prixAchat: 900, prixGros: 800 }],
  ["A2", { code: "A2", designation: "VESPA ROSE", costType: "LOCAL", prixAchat: 400, prixGros: null }],
]);
const history = new Map<string, PricePoint[]>([
  ["A1", [
    { effectiveAt: new Date("2026-11-10T00:00:00Z"), prixAchat: 700, prixGros: 600 },
    { effectiveAt: new Date("2026-11-20T00:00:00Z"), prixAchat: 900, prixGros: 800 },
  ]],
]);
const variants = [{ id: "v1", productId: "p1", productTitle: "Quad", variantTitle: null, price: 1500, imageUrl: null, productStatus: "ACTIVE", collectionIds: [] }];
const resolve = lineResolver({ variants, links: new Map([["v1", "A1"]]), articles, history });

// Commande d'octobre (avant le premier prix connu) : premier prix connu, prix de gros pour un importé.
const lines = resolve({
  createdAt: new Date("2026-10-05T10:00:00Z"),
  items: [
    { title: "Quad", quantity: 2, price: 1500, shopifyVariantId: "v1" },
    { title: "Vespa", quantity: 1, price: 1000, shopifyVariantId: null, albaseetCode: "A2" },
    { title: "Chose inconnue", quantity: 1, price: 500, shopifyVariantId: null },
  ],
});
const cells = profitCells(4500, lines, false);
assert.equal(cells[0].designation, "QUAD 12V");
assert.equal(cells[0].prixAchat, 700);
assert.equal(cells[0].prixGros, 600);
assert.equal(cells[0].type, "Importé");
assert.equal(cells[0].coutUnitaire, 600);
assert.equal(cells[0].coutTotal, 1200);
assert.equal(cells[0].ca, 3000);
assert.equal(cells[0].marge, 1800);
assert.equal(cells[1].type, "Acheté localement");
assert.equal(cells[1].coutTotal, 400);
assert.equal(cells[1].marge, 600);
assert.equal(cells[2].designation, "Non associé");
assert.equal(cells[2].unlinked, true);
assert.equal(cells[2].prixAchat, null);
assert.equal(cells[2].coutTotal, null);
assert.equal(cells[2].ca, 500);

// Montant de commande différent de la somme des lignes : réparti au prorata.
assert.equal(profitCells(2250, lines, false)[0].ca, 1500);
// Retour : coûts affichés, ni CA ni marge.
const ret = profitCells(4500, lines, true);
assert.equal(ret[0].ca, null);
assert.equal(ret[0].marge, null);
assert.equal(ret[0].coutTotal, 1200);

console.log("orders-export-profit checks OK");
