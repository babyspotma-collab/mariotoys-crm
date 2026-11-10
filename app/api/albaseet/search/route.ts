import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export type AlbaseetSuggestion = { code: string; designation: string; prixVente: number | null; hasCost: boolean };

// Recherche d'un article ALBASEET+ (produit absent de Shopify) par code ou par
// mots de la désignation. Protégée par la session (middleware).
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ articles: [] });
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const select = { code: true, designation: true, prixVente: true, prixAchat: true, prixGros: true } as const;
  // Code ou code-barres exact d'abord, puis les désignations qui contiennent tous les mots.
  const [exact, byName] = await Promise.all([
    prisma.albaseetArticle.findMany({ where: { OR: [{ code: { equals: q, mode: "insensitive" } }, { barcode: q }] }, select, take: 3 }),
    prisma.albaseetArticle.findMany({
      where: { AND: words.map((w) => ({ designation: { contains: w, mode: "insensitive" as const } })) },
      select,
      orderBy: { designation: "asc" },
      take: 12,
    }),
  ]);
  const seen = new Set(exact.map((r) => r.code));
  const rows = [...exact, ...byName.filter((r) => !seen.has(r.code))].slice(0, 12);
  const articles: AlbaseetSuggestion[] = rows.map((r) => ({
    code: r.code,
    designation: r.designation,
    prixVente: r.prixVente === null ? null : Number(r.prixVente),
    hasCost: Number(r.prixAchat ?? 0) > 0 || Number(r.prixGros ?? 0) > 0,
  }));
  return NextResponse.json({ articles });
}
