import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify-verify";
import { prisma } from "@/lib/db";
import { normalizeMoroccanPhone } from "@/lib/phone";

// Shopify webhook orders/create — reçoit CHAQUE nouvelle commande, sans
// filtre (contrairement à une éventuelle automatisation qui ne traiterait
// que les commandes taguées/traitées).
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhook(rawBody, hmac)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const order = JSON.parse(rawBody);

  const shippingAddress = order.shipping_address ?? {};
  const customerName =
    [shippingAddress.first_name, shippingAddress.last_name].filter(Boolean).join(" ") ||
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") ||
    "Client";
  const address = shippingAddress.address1 ?? "";
  const city = shippingAddress.city ?? "";
  const phone = normalizeMoroccanPhone(
    shippingAddress.phone ?? order.phone ?? order.customer?.phone ?? ""
  );

  // La variante choisie (couleur…) n'est PAS dans li.title : ex. commande
  // #7409, titre produit "… - Rose" mais variante "Bleu". On l'ajoute au
  // titre, sinon la nature du colis envoyée au transporteur est fausse.
  const items = (order.line_items ?? []).map((li: any) => ({
    title:
      li.variant_title && li.variant_title !== "Default Title"
        ? `${li.title} (variante : ${li.variant_title})`
        : (li.title as string),
    quantity: li.quantity as number,
    price: li.price as string,
  }));

  await prisma.order.upsert({
    where: { shopifyOrderId: String(order.id) },
    update: {}, // une commande existante n'est jamais réécrite par le webhook
    create: {
      shopifyOrderId: String(order.id),
      orderNumber: String(order.name ?? order.order_number ?? order.id),
      customerName,
      address,
      city,
      phone,
      totalPrice: order.total_price ?? "0",
      items: { create: items },
    },
  });

  return NextResponse.json({ ok: true });
}
