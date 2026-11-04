// Vérification rapide : npx tsx lib/no-parcel.check.ts
import assert from "node:assert";
import { waitLabel, waitTone, waitingDays } from "./no-parcel";

const now = new Date("2026-11-04T12:00:00Z");
assert.equal(waitingDays(new Date("2026-11-04T08:00:00Z"), now), 0);
assert.equal(waitingDays(new Date("2026-10-28T12:00:00Z"), now), 7);
assert.equal(waitingDays(new Date("2026-11-05T12:00:00Z"), now), 0, "jamais négatif");
assert.equal(waitTone(0), "gray");
assert.equal(waitTone(3), "gray");
assert.equal(waitTone(4), "amber");
assert.equal(waitTone(7), "amber");
assert.equal(waitTone(8), "red");
assert.equal(waitLabel(0), "Sans colis · aujourd'hui");
assert.equal(waitLabel(6), "Sans colis depuis 6 j");

console.log("no-parcel checks OK");
