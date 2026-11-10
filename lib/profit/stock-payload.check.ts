// Vérification rapide : npx tsx lib/profit/stock-payload.check.ts
import assert from "node:assert";
import { MAX_ITEMS, parseStockPayload } from "./stock-payload";

const ok = parseStockPayload({
  sent_at: "2026-11-10T08:00:00Z",
  items: [
    { code: "MOTO-GS", barcode: null, designation: "MOTO BMW GS 1200", prix_achat: 3499, prix_vente: 2999, stock: 2, updated_at: null, prix_gros: 3100, fournisseur: "Chine Toys", famille: "Véhicules" },
    { code: "UNO", barcode: "6974647852749", designation: "UNO", prix_achat: "12,50", prix_vente: null, stock: -1, updated_at: "2026-11-09T10:00:00Z" },
    { code: "", designation: "sans code", prix_achat: 10 },
    { code: "BAD", designation: "prix faux", prix_achat: "abc" },
    { code: "UNO", designation: "UNO (2e envoi)", prix_achat: 13 },
  ],
});
assert.equal(ok.received, 5);
assert.equal(ok.items.length, 2, "codes en double fusionnés, invalides écartés");
assert.equal(ok.errors.length, 2);
assert.equal(ok.errors[0].message, "code : obligatoire");
const moto = ok.items.find((i) => i.code === "MOTO-GS")!;
assert.equal(moto.prixGros, 3100);
assert.equal(moto.fournisseur, "Chine Toys");
const uno = ok.items.find((i) => i.code === "UNO")!;
assert.equal(uno.prixAchat, 13, "le dernier envoi du même code gagne");
assert.equal(uno.prixGros, undefined, "champ absent = garder la valeur en base");
assert.equal(uno.fournisseur, undefined);

assert.throws(() => parseStockPayload({ items: "x" }), /items/);
assert.throws(() => parseStockPayload({ items: Array.from({ length: MAX_ITEMS + 1 }, () => ({})) }), /500/);
assert.throws(() => parseStockPayload({ sent_at: "pas une date", items: [] }), /sent_at/);
assert.equal(parseStockPayload({ items: [{ code: "A", designation: "x", prix_achat: 1, stock: "-2,5" }] }).items[0].stock, -2.5);

console.log("stock-payload checks OK");
