import { prisma } from "@/lib/db";
import { ALL_OZON_CATEGORIZED_STATUSES } from "@/lib/ozon-categories";

/** Colis Ozon pouvant entrer dans un bon : pas encore pris en charge par Ozon (statut hors des étapes après ramassage) et dans aucun bon du CRM. */
export async function eligibleOzonCodes(codes?: string[]): Promise<Set<string>> {
  const [parcels, notes] = await Promise.all([
    prisma.parcel.findMany({
      where: { carrier: "OZON", status: { notIn: ALL_OZON_CATEGORIZED_STATUSES }, ...(codes ? { code: { in: codes } } : {}) },
      select: { code: true },
    }),
    prisma.deliveryNote.findMany({ where: { carrier: "OZON" }, select: { parcelCodes: true } }),
  ]);
  const used = new Set(notes.flatMap((n) => n.parcelCodes));
  return new Set(parcels.map((p) => p.code).filter((c) => !used.has(c)));
}
