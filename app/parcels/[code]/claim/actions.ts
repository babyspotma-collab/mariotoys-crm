"use server";

import { revalidatePath } from "next/cache";
import { createClaim, replyClaim } from "@/lib/forcelog";

export type ClaimState = { error: string | null };

export async function submitCreateClaim(
  code: string,
  _prevState: ClaimState,
  formData: FormData
): Promise<ClaimState> {
  const typeId = Number(formData.get("typeId"));
  const message = String(formData.get("message") ?? "").trim();

  if (!typeId) return { error: "Choisissez un type de réclamation." };
  if (!message) return { error: "Le message est obligatoire." };

  // Champs additionnels dynamiques (ex: NEW_PRICE, POSTPONE_DATE) —
  // envoyés tels que rendus par ClaimForm selon Claims/Types.REQUIRES,
  // jamais de nom de champ figé ici.
  const extraFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("extra_")) {
      extraFields[key.replace("extra_", "")] = String(value);
    }
  }

  try {
    await createClaim({ parcelCode: code, typeId, message, extraFields });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  revalidatePath(`/parcels/${code}/claim`);
  return { error: null };
}

export async function submitReply(
  code: string,
  _prevState: ClaimState,
  formData: FormData
): Promise<ClaimState> {
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Le message est obligatoire." };

  try {
    await replyClaim(code, message);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  revalidatePath(`/parcels/${code}/claim`);
  return { error: null };
}
