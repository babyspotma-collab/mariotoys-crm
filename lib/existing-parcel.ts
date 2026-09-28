import { prisma } from "@/lib/db";

/** Numéro de suivi du colis déjà rattaché à cette commande, s'il y en a un. */
export async function existingParcelCode(order: {
  id: string;
  forcelogCode: string | null;
  ozonCode: string | null;
}): Promise<string | null> {
  if (order.forcelogCode || order.ozonCode) return order.forcelogCode ?? order.ozonCode;
  const linked = await prisma.parcel.findFirst({ where: { orderId: order.id }, select: { code: true } });
  return linked?.code ?? null;
}
