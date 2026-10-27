// Vérification rapide : npx tsx lib/order-search.check.ts
import assert from "node:assert";
import { orderSearchWhere, searchWords } from "./order-search";

assert.deepEqual(orderSearchWhere(undefined), {});
assert.deepEqual(orderSearchWhere("   "), {});
assert.deepEqual(searchWords("  amine   benali "), ["amine", "benali"]);
assert.equal(searchWords("a b c d e f g h").length, 6, "6 mots au maximum");

const fieldsOf = (w: any) => w.OR.map((c: any) => Object.keys(c)[0]);
const one: any = orderSearchWhere("licorne");
assert.equal(one.AND.length, 1);
assert.deepEqual(fieldsOf(one.AND[0]), ["customerName", "city", "orderNumber", "items"], "un mot texte : nom, ville, n° commande, article (pas de téléphone)");

const two: any = orderSearchWhere("Amine casablanca");
assert.equal(two.AND.length, 2, "chaque mot doit correspondre (ET)");

const phone: any = orderSearchWhere("06 12 34 56 78");
assert.equal(phone.AND.length, 5, "un numéro avec espaces = 5 mots, chacun cherché");
const p: any = orderSearchWhere("0612345678");
const phones = p.AND[0].OR.filter((c: any) => c.phone).map((c: any) => c.phone.contains);
assert.ok(phones.includes("0612345678"), "numéro cherché dans le champ téléphone");
const intl: any = orderSearchWhere("+212612345678");
const intlPhones = intl.AND[0].OR.filter((c: any) => c.phone).map((c: any) => c.phone.contains);
assert.ok(intlPhones.includes("0612345678") && intlPhones.includes("212612345678"), "format +212 : forme 06… et chiffres seuls");
const short: any = orderSearchWhere("12");
assert.ok(!short.AND[0].OR.some((c: any) => c.phone), "moins de 3 chiffres : pas de recherche téléphone");

console.log("order-search checks OK");
