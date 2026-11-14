// Sessions côté serveur (Node) : création à la connexion, vérification en base
// (révocation + expiration) sur chaque page, action serveur et route API, et
// limite des essais de mot de passe. Le format du cookie est dans lib/auth.ts.

import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { readSessionToken, SESSION_COOKIE, SESSION_DAYS, signSessionToken } from "@/lib/auth";

export const LOGIN_MAX_FAILS_PER_IP = 5;
export const LOGIN_MAX_FAILS_TOTAL = 50; // toutes adresses confondues (essais répartis sur plusieurs IP)
export const LOGIN_WINDOW_MS = 15 * 60_000;

/** Adresse IP du visiteur (Vercel écrase ces en-têtes : le client ne peut pas les choisir). */
export function clientIp(): string {
  const h = headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "inconnue").trim().slice(0, 64);
}

/** Session valide de la requête en cours (signée, non expirée, non révoquée en base), sinon null. */
export const currentSession = cache(async (): Promise<{ id: string; expiresAt: Date } | null> => {
  const token = await readSessionToken(cookies().get(SESSION_COOKIE)?.value);
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { id: token.sid }, select: { id: true, expiresAt: true, revokedAt: true } });
  if (!s || s.revokedAt || s.expiresAt.getTime() <= Date.now()) return null;
  return { id: s.id, expiresAt: s.expiresAt };
});

export async function hasSession(): Promise<boolean> {
  return (await currentSession()) !== null;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Session expirée : reconnecte-toi.");
    this.name = "UnauthorizedError";
  }
}

/** À appeler en tête de chaque action serveur : refuse si la session n'est pas valide. */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) throw new UnauthorizedError();
}

/** Crée la session en base et pose le cookie (connexion réussie). */
export async function startSession(): Promise<void> {
  const id = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({
    data: { id, expiresAt, ip: clientIp(), userAgent: (headers().get("user-agent") ?? "").slice(0, 300) || null },
  });
  const exp = Math.floor(expiresAt.getTime() / 1000);
  cookies().set(SESSION_COOKIE, await signSessionToken(id, exp), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Déconnexion : révoque la session en cours et efface le cookie. */
export async function endSession(): Promise<void> {
  const token = await readSessionToken(cookies().get(SESSION_COOKIE)?.value);
  if (token) await prisma.session.updateMany({ where: { id: token.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  cookies().delete(SESSION_COOKIE);
}

/** Déconnecte tous les appareils (ex. téléphone perdu, cookie volé). */
export async function endAllSessions(): Promise<void> {
  await prisma.session.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } });
  cookies().delete(SESSION_COOKIE);
}

/** Minutes à attendre avant un nouvel essai, ou 0 si l'essai est permis. */
export async function loginBlockedMinutes(ip: string): Promise<number> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [mine, total] = await Promise.all([
    prisma.loginAttempt.findMany({ where: { ip, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.loginAttempt.count({ where: { createdAt: { gte: since } } }),
  ]);
  if (mine.length < LOGIN_MAX_FAILS_PER_IP && total < LOGIN_MAX_FAILS_TOTAL) return 0;
  const oldest = mine.length >= LOGIN_MAX_FAILS_PER_IP ? mine[mine.length - LOGIN_MAX_FAILS_PER_IP].createdAt : since;
  return Math.max(1, Math.ceil((oldest.getTime() + LOGIN_WINDOW_MS - Date.now()) / 60_000));
}

export async function recordLoginFailure(ip: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { ip } });
  // Ménage : on ne garde qu'un jour d'essais et les sessions des 60 derniers jours.
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 86_400_000) } } });
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { ip } });
}
