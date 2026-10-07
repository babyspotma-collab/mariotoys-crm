// Vérification rapide : npx tsx --tsconfig tsconfig.json lib/auto-confirm.check.ts
import assert from "node:assert";
import { orderCanMatchParcel as ok } from "./auto-confirm";

const parcel = new Date("2026-10-05T10:00:00Z");
assert.equal(ok(new Date("2026-10-03T09:00:00Z"), parcel), true); // 2 jours avant
assert.equal(ok(new Date("2026-10-05T20:00:00Z"), parcel), true); // même jour (marge d'horloge)
assert.equal(ok(new Date("2026-10-07T10:00:00Z"), parcel), false); // commande passée après le colis
assert.equal(ok(new Date("2026-08-20T10:00:00Z"), parcel), false); // ancienne commande du même client
assert.equal(ok(new Date("2025-03-01T10:00:00Z"), null), false); // colis sans date : pas de vieille commande
console.log("auto-confirm checks OK");
process.exit(0);
