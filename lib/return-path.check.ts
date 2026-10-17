// Vérification rapide : npx tsx lib/return-path.check.ts
import assert from "node:assert";
import { DEFAULT_RETURN_PATH, confirmHref, safeReturnPath } from "./return-path";

assert.equal(DEFAULT_RETURN_PATH, "/?tab=ok");

// Chemins internes acceptés tels quels (onglet, période, recherche, page)
for (const ok of ["/?tab=ok", "/?tab=noparcel&period=month&q=amine&page=3", "/", "/livraisons?tab=livrees"]) {
  assert.equal(safeReturnPath(ok), ok, ok);
}

// Tout le reste retombe sur « Confirmées » : autre site, schéma, absent, trop long, caractères de contrôle
for (const bad of [undefined, null, 42, "", "   ", "https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/x\nSet-Cookie: a=b", "/" + "a".repeat(600), "/a://b"]) {
  assert.equal(safeReturnPath(bad as unknown), "/?tab=ok", String(bad));
}
assert.equal(safeReturnPath("//evil.example", "/autre"), "/autre", "fallback personnalisé");

// Lien « Créer le colis » : l'adresse d'origine est encodée puis retrouvée à l'identique
const from = "/?tab=ok&period=month&q=Sara B.&page=2";
const href = confirmHref("abc123", from);
assert.ok(href.startsWith("/orders/abc123/confirm?from="));
assert.equal(new URL(href, "http://x").searchParams.get("from"), from);
assert.equal(safeReturnPath(new URL(href, "http://x").searchParams.get("from")), from);

console.log("return-path checks OK");
