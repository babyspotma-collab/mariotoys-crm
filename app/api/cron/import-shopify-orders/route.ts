import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { gql } from "@/lib/shopify-admin";

// Réimporte les commandes Shopify absentes du CRM (base repartie de zéro
// après la migration vers Neon du 07/10/2026 : l'ancienne base n'a pas pu
// être exportée). Outil ponctuel, pas un cron : à lancer à la main.
//
//   POST /api/cron/import-shopify-orders?since=2026-09-01          -> simulation
//   POST /api/cron/import-shopify-orders?since=2026-09-01&apply=1  -> écrit
//   (en-tête Authorization: Bearer CRON_SECRET)
//
// Même correspondance de champs que le webhook orders-create, avec la date
// de création d'origine. Une commande déjà présente n'est jamais modifiée.
// Les commandes annulées dans Shopify arrivent en ANNULEE, les autres en
// NOUVELLE ; la confirmation automatique (lib/auto-confirm.ts) repassera
// ensuite en CONFIRMEE celles qui ont un colis.

type Node = {
  legacyResourceId: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  phone: string | null;
  totalPriceSet: { shopMoney: { amount: string } };
  shippingAddress: { firstName: string | null; lastName: string | null; address1: string | null; city: string | null; phone: string | null } | null;
  lineItems: { nodes: { title: string; variantTitle: string | null; quantity: number; originalUnitPriceSet: { shopMoney: { amount: string } } }[] };
};

const QUERY = `
  query ($cursor: String, $q: String) {
    orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        legacyResourceId name createdAt cancelledAt phone
        totalPriceSet { shopMoney { amount } }
        shippingAddress { firstName lastName address1 city phone }
        lineItems(first: 50) { nodes { title variantTitle quantity originalUnitPriceSet { shopMoney { amount } } } }
      }
    }
  }`;

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const since = req.nextUrl.searchParams.get("since") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json({ error: "Paramètre since=AAAA-MM-JJ obligatoire" }, { status: 400 });
  }
  const apply = req.nextUrl.searchParams.get("apply") === "1";

  const nodes: Node[] = [];
  let cursor: string | null = null;
  do {
    const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Node[] } } = await gql(QUERY, {
      cursor,
      q: `created_at:>=${since}`,
    });
    nodes.push(...data.orders.nodes);
    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
  } while (cursor);

  const known = new Set(
    (await prisma.order.findMany({ where: { shopifyOrderId: { in: nodes.map((n) => n.legacyResourceId) } }, select: { shopifyOrderId: true } })).map(
      (o) => o.shopifyOrderId
    )
  );
  const missing = nodes.filter((n) => !known.has(n.legacyResourceId));

  // Écriture groupée (2 requêtes au total, même pour plusieurs centaines de
  // commandes) : les commandes, puis leurs articles.
  let imported = 0;
  if (apply && missing.length > 0) {
    const created = await prisma.order.createManyAndReturn({
      data: missing.map((n) => {
        const a = n.shippingAddress;
        return {
          shopifyOrderId: n.legacyResourceId,
          orderNumber: n.name,
          // Pas de repli sur la fiche client : l'application Shopify n'a pas
          // la permission read_customers (le webhook, lui, la reçoit).
          customerName: [a?.firstName, a?.lastName].filter(Boolean).join(" ") || "Client",
          address: a?.address1 ?? "",
          city: a?.city ?? "",
          phone: normalizeMoroccanPhone(a?.phone ?? n.phone ?? ""),
          totalPrice: n.totalPriceSet.shopMoney.amount,
          status: n.cancelledAt ? ("ANNULEE" as const) : ("NOUVELLE" as const),
          createdAt: new Date(n.createdAt),
        };
      }),
      select: { id: true, shopifyOrderId: true },
      skipDuplicates: true,
    });
    const idByShopifyId = new Map(created.map((o) => [o.shopifyOrderId, o.id]));
    await prisma.orderItem.createMany({
      data: missing.flatMap((n) => {
        const orderId = idByShopifyId.get(n.legacyResourceId);
        if (!orderId) return [];
        return n.lineItems.nodes.map((li) => ({
          orderId,
          title: li.variantTitle && li.variantTitle !== "Default Title" ? `${li.title} (variante : ${li.variantTitle})` : li.title,
          quantity: li.quantity,
          price: li.originalUnitPriceSet.shopMoney.amount,
        }));
      }),
    });
    imported = created.length;
  }

  return NextResponse.json({
    since,
    foundInShopify: nodes.length,
    alreadyInCrm: known.size,
    toImport: missing.length,
    cancelledAmongThem: missing.filter((n) => n.cancelledAt).length,
    imported,
    dryRun: !apply,
  });
}
