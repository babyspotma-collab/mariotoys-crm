// Vérification rapide : npx tsx lib/stock-albaseet.check.ts
import assert from "node:assert";
import { parseStockReport } from "./stock-albaseet";

const ok = parseStockReport({
  items: [
    {
      id: "a1",
      stockInfo: { relie: true, articles: [{ nom: "TOBOGAN PILSAN 6198", code: "6198", depots: [{ depot: "GHANDI NOUVEAU", quantite: 2, enLigne: true }] }] },
      albaseetSale: { id: "19984", facture: "19984", depot: "GHANDI NOUVEAU", date: "2026-10-22 20:40", vendeur: "GHANDI", inutile: "x" },
      autre: "ignoré",
    },
    { id: "a2", stockInfo: { relie: false, articles: [] }, albaseetSale: null },
  ],
});
assert.equal(ok.length, 2);
assert.deepEqual(ok[0].albaseetSale, { id: "19984", facture: "19984", depot: "GHANDI NOUVEAU", date: "2026-10-22 20:40", vendeur: "GHANDI" });
assert.equal((ok[0] as any).autre, undefined);
assert.equal(ok[1].albaseetSale, null);

assert.throws(() => parseStockReport({}), /items/);
assert.throws(() => parseStockReport({ items: [{ id: "x" }] }), /stockInfo/);
assert.throws(() => parseStockReport({ items: [{ id: 3, stockInfo: { relie: true, articles: [] } }] }), /id/);
assert.throws(
  () => parseStockReport({ items: [{ id: "x", stockInfo: { relie: true, articles: [{ nom: "A", depots: [{ depot: "D", quantite: "2" }] }] } }] }),
  /quantite/
);
console.log("stock-albaseet checks OK");
