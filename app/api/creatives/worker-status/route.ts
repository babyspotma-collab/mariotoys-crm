import { NextResponse } from "next/server";
import { getWorkerStatus, hasSession } from "@/lib/creatives";

export const dynamic = "force-dynamic";

// État du programme local pour le bandeau "En ligne / Hors ligne".
export async function GET() {
  if (!(await hasSession())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json(await getWorkerStatus());
}
