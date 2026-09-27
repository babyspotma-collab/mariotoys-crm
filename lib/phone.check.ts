// Vérification rapide : npx tsx lib/phone.check.ts
import assert from "node:assert";
import { normalizeMoroccanPhone as n } from "./phone";

for (const raw of ["0612345678", "612345678", "+212612345678", "212612345678", "00212612345678", "+212 0612345678", "2120612345678", "002120612345678", "06 12-34-56-78"]) {
  assert.equal(n(raw), "0612345678", raw);
}
assert.equal(n("0712345678"), "0712345678");
console.log("phone checks OK");
