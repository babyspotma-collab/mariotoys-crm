// Vérification rapide : npx tsx lib/creative-angles.check.ts
import assert from "node:assert";
import {
  CREATIVE_ANGLES,
  buildAngles,
  buildFields,
  cleanText,
  countWords,
  describeHook,
  parsePrice,
  sanitizeHooks,
} from "./creative-angles";

const by = (a: ReturnType<typeof buildAngles>) => Object.fromEntries(a.map((x) => [x.key, x]));
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

// --- Structure : 5 angles dans l'ordre PROBLEME, BENEFICE, PLAISIR, OFFRE, CADEAU
assert.deepEqual(CREATIVE_ANGLES.map((a) => a.key), ["probleme", "benefice", "plaisir", "offre", "cadeau"]);

// --- Tout rempli : 5 prompts, aucune variable restante, prompt commun en tête
const full = buildAngles(
  buildFields({
    productName: "Pot Faon",
    hook: "Fini les couches ?",
    pointFort1: "Siège confortable",
    pointFort2: "Facile à nettoyer",
    pointFort3: "Dès 18 mois",
    price: "199",
    offerLine: "Livraison gratuite",
  })
);
const f = by(full);
assert.equal(full.length, 5);
assert.deepEqual(full.map((a) => a.position), [1, 2, 3, 4, 5]);
for (const a of full) {
  assert.ok(a.prompt && !a.skipReason, `${a.key} généré`);
  assert.ok(!/\{\w+\}/.test(a.prompt!), `${a.key} : aucune variable restante`);
  assert.ok(!/""/.test(a.prompt!), `${a.key} : aucun texte vide entre guillemets`);
  assert.ok(a.prompt!.startsWith("Using the attached product photo as the exact reference, create a high-converting social media advertisement"), `${a.key} : prompt commun`);
  assert.ok(a.prompt!.includes("Each text appears exactly ONCE"), `${a.key} : règle « une seule fois »`);
  assert.ok(a.prompt!.includes("Vertical 4:5, high resolution"), `${a.key} : format 4:5`);
}
// Contenus propres à chaque angle
assert.ok(f.probleme.prompt!.includes('Hook as a question at the top: "Fini les couches ?"'));
assert.ok(f.probleme.prompt!.includes('Product name small at the bottom: "Pot Faon"'));
assert.ok(f.benefice.prompt!.includes('Huge headline: "Siège confortable", with a bold arrow pointing to the product.'));
assert.ok(f.plaisir.prompt!.includes("hands only, no face") && f.plaisir.prompt!.includes('Hook at the top: "Fini les couches ?"'));
assert.ok(f.offre.prompt!.includes('"199 MAD"') && f.offre.prompt!.includes('"Commandez maintenant"') && f.offre.prompt!.includes('Additional line: "Livraison gratuite"'));
assert.ok(f.cadeau.prompt!.includes("Gift moment") && f.cadeau.prompt!.includes('Hook at the top: "Fini les couches ?"'));

// --- Chaque texte n'apparaît qu'UNE fois dans la partie spécifique de l'angle
for (const a of full) {
  const specific = a.prompt!.split("\n\n")[1];
  for (const text of ["Pot Faon", "Fini les couches ?", "Siège confortable", "199 MAD", "Commandez maintenant", "Livraison gratuite"]) {
    assert.ok(occurrences(specific, `"${text}"`) <= 1, `${a.key} : « ${text} » ne doit pas être répété`);
  }
}

// --- Nom seul : accroche vide -> titre = nom du produit, SANS répéter le nom
const nameOnly = by(buildAngles(buildFields({ productName: "Pot Faon" })));
for (const k of ["probleme", "plaisir", "cadeau"]) {
  const specific = nameOnly[k].prompt!.split("\n\n")[1];
  assert.equal(occurrences(specific, '"Pot Faon"'), 1, `${k} : le nom n'apparaît qu'une fois (titre de repli)`);
}
assert.ok(nameOnly.probleme.prompt!.includes('Headline at the top: "Pot Faon"'), "repli : pas « question » quand l'accroche est vide");
assert.ok(!nameOnly.probleme.prompt!.includes("as a question"));
assert.equal(nameOnly.benefice.prompt, null);
assert.equal(nameOnly.benefice.skipReason, "Point fort 1 non renseigné");
assert.equal(nameOnly.offre.prompt, null);
assert.equal(nameOnly.offre.skipReason, "Prix non renseigné");

// --- Accroche vide + point fort 1 : titre = point fort 1, nom conservé en bas
const pf = by(buildAngles(buildFields({ productName: "Pot Faon", pointFort1: "Siège confortable" })));
assert.ok(pf.cadeau.prompt!.includes('Hook at the top: "Siège confortable"') && pf.cadeau.prompt!.includes('Name at the bottom: "Pot Faon"'));
assert.equal(describeHook(buildFields({ productName: "Pot Faon", pointFort1: "Siège confortable" })).source, "point_fort_1");
assert.equal(describeHook(buildFields({ productName: "Pot Faon" })).source, "nom_produit");
assert.equal(describeHook(buildFields({ productName: "Pot Faon", hook: "Cadeau idéal" })).source, "accroche");

// --- Point fort 1 identique au nom : pas de répétition dans l'angle BENEFICE
const same = by(buildAngles(buildFields({ productName: "Pot Faon", pointFort1: "pot faon" })));
assert.equal(occurrences(same.benefice.prompt!.split("\n\n")[1], "Faon") + occurrences(same.benefice.prompt!.split("\n\n")[1], "faon"), 1);
// Accroche identique au nom : nom du bas supprimé
const sameHook = by(buildAngles(buildFields({ productName: "Pot Faon", hook: "Pot Faon" })));
assert.equal(occurrences(sameHook.cadeau.prompt!.split("\n\n")[1], "Faon"), 1);

// --- Ligne d'offre vide : la ligne disparaît, le bouton reste
const noOffer = by(buildAngles(buildFields({ productName: "X", price: "50" })));
assert.ok(noOffer.offre.prompt && !noOffer.offre.prompt.includes("Additional line") && noOffer.offre.prompt.includes("Commandez maintenant"));

// --- Prix décimal, nettoyage, mots
assert.ok(by(buildAngles(buildFields({ productName: "X", price: "199,5" }))).offre.prompt!.includes('"199,50 MAD"'));
assert.equal(parsePrice("199"), 199);
assert.equal(parsePrice("199,5"), 199.5);
assert.equal(parsePrice("abc"), null);
assert.equal(parsePrice("-5"), null);
assert.equal(cleanText('  Super "jouet"\n\n  rapide ', 80), "Super 'jouet' rapide");
assert.equal(cleanText("x".repeat(200), 40).length, 40);
assert.equal(buildFields({ productName: "X", hook: "y".repeat(100) }).accroche.length, 60);
assert.equal(countWords("  Fini les  couches ? "), 4);
assert.equal(countWords(""), 0);

// --- Accroches proposées par l'IA : nettoyées avant affichage (jamais appliquées seules)
assert.deepEqual(
  sanitizeHooks(["Fini les couches ?", "  fini les COUCHES ?  ", 'Le pot "magique" !', "Une phrase beaucoup trop longue pour une accroche", 42, null, "", "Cadeau idéal"]),
  ["Fini les couches ?", "Le pot 'magique' !", "Cadeau idéal"],
  "doublons (casse), guillemets doubles, plus de 6 mots, non-textes : écartés"
);
assert.equal(sanitizeHooks(["a", "b", "c", "d", "e"]).length, 3, "3 accroches au maximum");
assert.deepEqual(sanitizeHooks("pas un tableau"), []);
assert.deepEqual(sanitizeHooks(undefined), []);
assert.ok(sanitizeHooks(["x".repeat(200)])[0].length <= 60, "longueur bornée à 60");

// --- Format modifiable
assert.ok(buildAngles(buildFields({ productName: "X" }), "1:1")[0].prompt!.includes("Vertical 1:1, high resolution"));

console.log("creative-angles checks OK");
