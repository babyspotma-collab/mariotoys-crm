"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { addParcel as addForcelogParcel, getCities as getForcelogCities } from "@/lib/forcelog";
import { addParcel as addOzonParcel, getCities as getOzonCities } from "@/lib/ozon";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { existingParcelCode } from "@/lib/existing-parcel";
import { tooLongError } from "@/lib/parcel-limits";
import { cleanPaidMethod } from "@/lib/payment-method";
import { safeReturnPath } from "@/lib/return-path";

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
  // Payée en ligne par carte : le colis part à 0 DH (rien à encaisser), quel que
  // soit le champ prix. Le montant de la commande (totalPrice) n'est pas modifié.
  const paidMethod = cleanPaidMethod(formData.get("paidMethod"));
  const paidOnline = paidMethod !== null;
  const price = paidOnline ? 0 : Number(priceRaw);

  if (carrier !== "FORCELOG" && carrier !== "OZON") {
    return { error: "Transporteur invalide." };
  }
  if (!receiver || !phone || !address || !productNature) {
    return { error: "Tous les champs obligatoires doivent être remplis." };
  }
  if (!Number.isFinite(price) || (!paidOnline && price <= 0)) {
    return { error: "Le prix doit être un nombre positif." };
  }
  // Limites de caractères du transporteur vérifiées ici, avant tout envoi.
  const tooLong = tooLongError(carrier, { receiver, address, comment, productNature });
  if (tooLong) return { error: tooLong };

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  // Le colis ne se crée qu'après la confirmation (étape séparée).
  if (order.status !== "CONFIRMEE") {
    return { error: "Confirmez d'abord la commande avant de créer son colis." };
  }

  // Commande remise à un livreur de l'entreprise (Livraison Casa) : jamais de
  // colis transporteur en plus, sous peine de double livraison. Il faut
  // d'abord la retirer de Livraisons Casa (page /livraisons).
  if (order.localDelivery) {
    return {
      error: `Cette commande est en Livraison Casa${order.localCourier ? ` chez ${order.localCourier}` : ""} : aucun colis ne peut être créé. Retirez-la d'abord de Livraisons Casa (page « Livraisons Casa »).`,
    };
  }

  // Protection anti-doublon : jamais un 2e colis chez le transporteur pour
  // une commande qui en a déjà un (ex. nouvel essai après une erreur
  // d'affichage alors que le colis avait bien été créé).
  const existing = await existingParcelCode(order);
  if (existing) {
    return { error: `Cette commande a déjà un colis (${existing}). Aucun nouveau colis n'a été créé.` };
  }

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
          // IS_DOUBLE = 1 : le colis est créé, mais Forcelog pense qu'un
          // colis identique existe déjà — signalé sur la ligne de commande.
          forcelogError: parcel.isDouble
            ? `Doublon possible signalé par Forcelog (IS_DOUBLE) pour le colis ${parcel.code} : vérifiez qu'un autre colis n'existe pas déjà pour ce client.`
            : null,
          forcelogProductNature: productNature,
          customerName: receiver,
          phone,
          city,
          quartier: quartier || null,
          address,
          comment: comment || null,
          fragile,
          ...(paidOnline ? { paidOnline: true, paidMethod } : { paidOnline: false, paidMethod: null, totalPrice: price }),
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
          ...(paidOnline ? { paidOnline: true, paidMethod } : { paidOnline: false, paidMethod: null, totalPrice: price }),
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
  revalidatePath("/orders");
  // Retour sur la page Commandes d'où l'on venait (onglet "Confirmées" par
  // défaut), pas sur "À confirmer". L'adresse vient du formulaire : contrôlée.
  redirect(safeReturnPath(formData.get("returnTo")));
}
