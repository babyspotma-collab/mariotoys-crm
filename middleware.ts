import { NextRequest, NextResponse } from "next/server";
import { AUTH_HEADER, SESSION_COOKIE, readSessionToken } from "@/lib/auth";

// Routes accessibles sans session : la page de login elle-même, et les
// endpoints appelés par des systèmes externes (Shopify, cron Vercel, le
// worker mariotoys-images-automation sur le PC de l'utilisateur, l'appli de
// stock ALBASEET+) qui ont leur propre vérification (HMAC / secret de cron /
// WORKER_SECRET / STOCK_SYNC_SECRET).
const PUBLIC_PATHS = ["/login", "/api/webhooks", "/api/cron", "/api/product-jobs", "/api/worker", "/api/stock-sync"];

// Seuls ces fichiers exacts sont servis sans session : ceux du dossier public/
// et les icônes générées par app/ (favicon, apple-icon, manifeste). Une
// adresse qui se termine par .png n'est PAS publique pour autant.
const PUBLIC_FILES = new Set([
  "/favicon.ico",
  "/apple-icon.png",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/logo.png",
  "/logo-wordmark.webp",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_FILES.has(pathname)) return NextResponse.next();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(AUTH_HEADER); // jamais fourni par le client

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Signature et expiration ici ; la révocation est vérifiée côté serveur
  // (app/layout.tsx pour les pages, requireSession/hasSession ailleurs).
  if (await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    requestHeaders.set(AUTH_HEADER, "1");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Tout passe par le middleware, sauf les fichiers internes de Next.js.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
