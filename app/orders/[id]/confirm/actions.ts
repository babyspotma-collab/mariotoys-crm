"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { addParcel } from "@/lib/forcelog";
import { normalizeMoroccanPhone } from "@/lib/phone";

export type ConfirmState = { error: string | null };

// Signature (orderId, prevState, formData) pour être utilisée avec
// useFormState côté client : `createParcel.bind(null, orderId)`.
export async function createParcel(
  orderId: string,
  _prevState: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const receiver = String(formData.get("receiver") ?? "").trim();
  const phone = normalizeMoroccanPhone(String(formData.get("phone") ?? "").trim());
  const city = String(formData.get("city") ?? "").trim();
  const quartier = String(formData.get("quartier") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();
  const productNature = String(formData.get("productNature") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "");
  const fragile = formData.get("fragile") === "on";

  const price = Number(priceRaw);

  if (!receiver || !phone || !city || !address || !productNature) {
    return { error: "Tous les champs obligatoires doivent être remplis." };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Le prix doit être un nombre positif." };
  }

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  try {
    const parcel = await addParcel({
      orderNum: order.orderNumber,
      receiver,
      phone,
      city, // code Forcelog choisi dans la liste déroulante
      quartier: quartier || undefined,
      address,
      comment: comment || undefined,
      cod: price,
      productNature,
      fragile,
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CONFIRMEE",
        forcelogCode: parcel.code,
        forcelogError: null,
        forcelogProductNature: productNature,
        customerName: receiver,
        phone,
        city,
        quartier: quartier || null,
        address,
        comment: comment || null,
        fragile,
        totalPrice: price,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Gardée en NOUVELLE : l'utilisateur reste sur l'écran pour corriger
    // et réessayer, sans rien perdre de ses modifications (formulaire non
    // contrôlé, ses valeurs restent affichées côté navigateur).
    await prisma.order.update({ where: { id: orderId }, data: { forcelogError: message } });
    return { error: message };
  }

  revalidatePath("/");
  redirect("/");
}
