"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function cancelOrder(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status: "ANNULEE" },
  });
  revalidatePath("/");
}
