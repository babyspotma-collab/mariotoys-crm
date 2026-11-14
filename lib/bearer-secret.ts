import { timingSafeEqual } from "node:crypto";

// Garde des routes système (cron Vercel, programme local) : en-tête
// "Authorization: Bearer <secret>". Refuse tout si la variable n'est pas
// définie (sinon "Bearer undefined" passerait) et compare en temps constant.
export function hasBearerSecret(req: Request, envName: "CRON_SECRET" | "WORKER_SECRET"): boolean {
  const secret = process.env[envName];
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
