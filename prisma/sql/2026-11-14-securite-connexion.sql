-- Sécurité de la connexion : sessions révocables et limite d'essais de mot de passe.
-- Ajout seulement (aucune table existante modifiée). Exécuté avec
--   npx prisma db execute --file prisma/sql/2026-11-14-securite-connexion.sql

CREATE TABLE IF NOT EXISTS "Session" (
  "id"        TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "ip"        TEXT,
  "userAgent" TEXT
);
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session" ("expiresAt");

CREATE TABLE IF NOT EXISTS "LoginAttempt" (
  "id"        TEXT PRIMARY KEY,
  "ip"        TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt" ("ip", "createdAt");
CREATE INDEX IF NOT EXISTS "LoginAttempt_createdAt_idx" ON "LoginAttempt" ("createdAt");
