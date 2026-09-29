// Vérification rapide : npx tsx lib/filename.check.ts
import assert from "node:assert";
import { fixUtf8Filename as fix } from "./filename";

assert.equal(fix("Capture d'Ã©cran 2026-08-31 162042.png"), "Capture d'écran 2026-08-31 162042.png");
assert.equal(fix("Capture d'écran.png"), "Capture d'écran.png"); // déjà correct : inchangé
assert.equal(fix("WhatsApp Image 2026-08-04 at 14.34.44.jpeg"), "WhatsApp Image 2026-08-04 at 14.34.44.jpeg");
assert.equal(fix("PhotoÃ.png"), "PhotoÃ.png"); // pas du mojibake valide : inchangé
console.log("filename checks OK");
