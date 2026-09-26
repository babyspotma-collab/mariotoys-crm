import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";

// Routes accessibles sans session : la page de login elle-même, et les
// endpoints appelés par des systèmes externes (Shopify, cron Vercel, le
// worker mariotoys-images-automation sur le PC de l'utilisateur) qui ont
// leur propre vérification (HMAC / secret de cron / WORKER_SECRET).
const PUBLIC_PATHS = ["/login", "/api/webhooks", "/api/cron", "/api/product-jobs"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSessionToken(token)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
