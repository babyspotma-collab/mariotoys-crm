"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createPickupRequest, relaunchParcel } from "@/lib/forcelog";
import { addDeliveryNote, addParcelToDeliveryNote, saveDeliveryNote } from "@/lib/ozon";
import { eligibleOzonCodes } from "@/lib/delivery-notes";

export type RelaunchState = { error: string | null; success: boolean };

export async function relaunch(code: string): Promise<RelaunchState> {
  try {
    await relaunchParcel(code);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), success: false };
  }
  revalidatePath("/parcels");
  return { error: null, success: true };
}

// ─── Bon de livraison Ozon (API : créer, ajouter les colis, enregistrer) ───

const back = (params: Record<string, string>) => `/parcels?${new URLSearchParams({ carrier: "ozon", ...params })}`;

export async function createOzonDeliveryNote(formData: FormData) {
  const codes = [...new Set(formData.getAll("codes").map(String))];
  if (codes.length === 0) redirect(back({ error: "Sélectionnez au moins un colis." }));

  const eligible = await eligibleOzonCodes(codes);
  const refused = codes.filter((c) => !eligible.has(c));
  if (refused.length) {
    redirect(back({ error: `Colis déjà dans un bon ou déjà ramassé : ${refused.join(", ")}` }));
  }

  let ref: string | null = null;
  let error: string | null = null;
  try {
    ref = (await addDeliveryNote()).ref;
    await addParcelToDeliveryNote(ref, codes);
    await saveDeliveryNote(ref);
    await prisma.deliveryNote.create({ data: { carrier: "OZON", ref, parcelCodes: codes } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Bon créé chez Ozon mais étape suivante en échec : on le dit, avec sa
    // référence, pour pouvoir le retrouver sur leur tableau de bord.
    error = ref ? `Bon ${ref} créé chez Ozon, mais la suite a échoué : ${message}` : `Ozon a refusé le bon : ${message}`;
  }
  revalidatePath("/parcels");
  redirect(error ? back({ error }) : back({ view: "notes", created: ref! }));
}

// ─── Demandes de ramassage ─────────────────────────────────────────────────

export type PickupState = { ok: boolean; message: string | null };

function pickupFields(formData: FormData) {
  return {
    phone: String(formData.get("phone") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    comment: String(formData.get("comment") ?? "").trim(),
  };
}

// Forcelog : envoi réel par l'API, résultat enregistré dans l'historique.
export async function sendForcelogPickup(_prev: PickupState, formData: FormData): Promise<PickupState> {
  const f = pickupFields(formData);
  const stickers = formData.get("stickers") === "on";
  if (!f.phone || !f.city || !f.address) return { ok: false, message: "Téléphone, ville et adresse sont obligatoires." };
  if (f.phone.length > 14) return { ok: false, message: "Téléphone trop long (14 caractères max)." };
  if (f.address.length > 100) return { ok: false, message: "Adresse trop longue (100 caractères max)." };
  if (f.comment.length > 100) return { ok: false, message: "Commentaire trop long (100 caractères max)." };

  let result: PickupState;
  try {
    const message = await createPickupRequest({ ...f, stickers });
    result = { ok: true, message: `Demande envoyée à Forcelog (${message}).` };
  } catch (err) {
    result = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  await prisma.pickupRequest.create({
    data: { carrier: "FORCELOG", status: result.ok ? "SENT" : "FAILED", ...f, comment: f.comment || null, message: result.message },
  });
  revalidatePath("/parcels");
  return result;
}

// Ozon : pas d'API, la demande se fait sur leur site ; on la note ici.
export async function declareOzonPickup(_prev: PickupState, formData: FormData): Promise<PickupState> {
  const f = pickupFields(formData);
  if (!f.address) return { ok: false, message: "Indiquez l'adresse de ramassage donnée à Ozon." };
  await prisma.pickupRequest.create({
    data: { carrier: "OZON", status: "DECLARED", ...f, comment: f.comment || null, message: "Faite sur le site Ozon, notée dans le CRM." },
  });
  revalidatePath("/parcels");
  return { ok: true, message: "Demande notée dans l'historique." };
}
