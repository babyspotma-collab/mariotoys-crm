// Authentification à mot de passe unique (usage solo). Fonctions utilisables
// dans le middleware (runtime Edge : Web Crypto uniquement, pas de base).
//
// Cookie de session : "<sid>.<exp>.<signature>"
//   sid        identifiant aléatoire de la session (table Session, lib/session.ts)
//   exp        date d'expiration (secondes Unix)
//   signature  HMAC-SHA256 de "<sid>.<exp>" avec SESSION_SECRET
// Le middleware vérifie la signature et l'expiration. La révocation
// (déconnexion) est vérifiée côté serveur dans la table Session
// (lib/session.ts), sur chaque page, action et route API.

export const SESSION_COOKIE = "mario_toys_crm_session";
export const SESSION_DAYS = 14;
// En-tête posé par le middleware sur les pages protégées (le client ne peut pas
// le fournir : le middleware l'efface) ; app/layout.tsx vérifie alors aussi la
// session en base (révocation).
export const AUTH_HEADER = "x-crm-auth";

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET manquant");
  return secret;
}

export async function signSessionToken(sid: string, exp: number): Promise<string> {
  return `${sid}.${exp}.${await hmac(sessionSecret(), `${sid}.${exp}`)}`;
}

/** Jeton signé et non expiré : { sid, exp } ; sinon null. Ne dit rien de la révocation. */
export async function readSessionToken(token: string | undefined, nowMs = Date.now()): Promise<{ sid: string; exp: number } | null> {
  if (!token) return null;
  const m = token.match(/^([a-f0-9]{32})\.(\d{10})\.([a-f0-9]{64})$/);
  if (!m) return null;
  const [, sid, expStr, sig] = m;
  const exp = Number(expStr);
  if (exp * 1000 <= nowMs) return null;
  if (!timingSafeEqual(sig, await hmac(sessionSecret(), `${sid}.${exp}`))) return null;
  return { sid, exp };
}

/** Comparaison du mot de passe sans fuite de longueur ni de contenu (on compare deux HMAC). */
export async function checkPassword(password: string): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) throw new Error("DASHBOARD_PASSWORD manquant");
  const secret = sessionSecret();
  return timingSafeEqual(await hmac(secret, `pw:${password}`), await hmac(secret, `pw:${expected}`));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
