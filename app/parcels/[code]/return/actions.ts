"use server";

import { redirect } from "next/navigation";
import { requestReturn } from "@/lib/forcelog";

export type ReturnState = { error: string | null };

export async function submitReturn(
  code: string,
  _prevState: ReturnState,
  formData: FormData
): Promise<ReturnState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const quarter = String(formData.get("quarter") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!phone || !city) {
    return { error: "Téléphone et ville sont obligatoires." };
  }
  if (quarter.length < 5) {
    return { error: "Le quartier doit contenir au moins 5 caractères." };
  }

  try {
    await requestReturn({ parcelCodes: [code], phone, quarter, city, note: note || undefined });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  redirect(`/parcels/${encodeURIComponent(code)}?return=success`);
}
