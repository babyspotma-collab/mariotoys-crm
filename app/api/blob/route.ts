import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import { readBlob } from "@/lib/blob";

// Sert les photos produit (store Blob privé) aux écrans du dashboard
// (aperçu à l'upload, écran de relecture). Le middleware protège déjà
// cette route, mais la doc Vercel Blob recommande explicitement de ne
// jamais s'appuyer uniquement sur le middleware pour ce genre de lecture
// — vérification refaite ici, juste à côté de get().
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(token))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const pathname = req.nextUrl.searchParams.get("pathname");
  if (!pathname) {
    return NextResponse.json({ error: "pathname manquant" }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await readBlob(pathname);
    return new NextResponse(new Blob([Uint8Array.from(buffer)]), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
