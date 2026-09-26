"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { addParcel as addForcelogParcel, getCities as getForcelogCities } from "@/lib/forcelog";
import { addParcel as addOzonParcel, getCities as getOzonCities } from "@/lib/ozon";
import { normalizeMoroccanPhone } from "@/lib/phone";

export type ConfirmState = { error: string | null };

// Signature (orderId, prevState, formData) pour être utilisée avec
// useFormState côté client : `createParcel.bind(null, orderId)`.
export async function createParcel(
  orderId: string,
  _prevState: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  const carrier = String(formData.get("carrier") ?? "FORCELOG").trim();
  const receiver = String(formData.get("receiver") ?? "").trim();
  const phone = normalizeMoroccanPhone(String(formData.get("phone") ?? "").trim());
  const address = String(formData.get("address") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();
  const productNature = String(formData.get("productNature") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "");
  const fragile = formData.get("fragile") === "on";
  const price = Number(priceRaw);

  if (carrier !== "FORCELOG" && carrier !== "OZON") {
    return { error: "Transporteur invalide." };
  }
  if (!receiver || !phone || !address || !productNature) {
    return { error: "Tous les champs obligatoires doivent être remplis." };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Le prix doit être un nombre positif." };
  }

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  try {
    if (carrier === "FORCELOG") {
      const city = String(formData.get("forcelogCity") ?? "").trim();
      const quartier = String(formData.get("quartier") ?? "").trim();
      if (!city) return { error: "La ville est obligatoire." };

      const parcel = await addForcelogParcel({
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
          carrier: "FORCELOG",
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

      // Créé tout de suite (pas besoin d'attendre le prochain sync de 2h,
      // voir scripts/sync-forcelog-web.js) — ce dernier mettra à jour le
      // statut réel dès son prochain passage.
      const cities = await getForcelogCities().catch(() => []);
      const cityName = cities.find((c) => c.code === city)?.name ?? city;
      await prisma.parcel.upsert({
        where: { carrier_code: { carrier: "FORCELOG", code: parcel.code } },
        create: {
          carrier: "FORCELOG",
          code: parcel.code,
          orderId,
          receiver,
          phone,
          cityName,
          price,
          status: "Nouveau",
        },
        update: { orderId, receiver, phone, cityName, price },
      });
    } else {
      const cityId = String(formData.get("ozonCity") ?? "").trim();
      if (!cityId) return { error: "La ville est obligatoire." };

      const parcel = await addOzonParcel({
        receiver,
        phone,
        cityId, // ID ville Ozon choisi dans la liste déroulante
        address,
        note: comment || undefined,
        price,
        nature: productNature,
        fragile,
      });

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: "CONFIRMEE",
          carrier: "OZON",
          ozonCode: parcel.code,
          ozonError: null,
          customerName: receiver,
          phone,
          city: cityId,
          address,
          comment: comment || null,
          fragile,
          totalPrice: price,
        },
      });

      const cities = await getOzonCities().catch(() => []);
      const cityName = cities.find((c) => c.id === cityId)?.name ?? cityId;
      await prisma.parcel.upsert({
        where: { carrier_code: { carrier: "OZON", code: parcel.code } },
        create: {
          carrier: "OZON",
          code: parcel.code,
          orderId,
          receiver,
          phone,
          cityName,
          price,
          status: "Nouveau Colis",
        },
        update: { orderId, receiver, phone, cityName, price },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Gardée en NOUVELLE : l'utilisateur reste sur l'écran pour corriger
    // et réessayer, sans rien perdre de ses modifications (formulaire non
    // contrôlé, ses valeurs restent affichées côté navigateur).
    await prisma.order.update({
      where: { id: orderId },
      data: carrier === "FORCELOG" ? { forcelogError: message } : { ozonError: message },
    });
    return { error: message };
  }

  revalidatePath("/");
  redirect("/");
}
