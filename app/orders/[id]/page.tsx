import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import StockAlbaseet from "@/components/StockAlbaseet";
import RelinkItem from "./RelinkItem";
import { formatDateTimeMa, formatDh } from "@/lib/format";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { safeReturnPath } from "@/lib/return-path";
import { readAlbaseetSale } from "@/lib/stock-albaseet";

export const dynamic = "force-dynamic";

// Fiche commande : articles, où ils se trouvent dans les dépôts ALBASEET+ et
// confirmation de la vente en magasin (logiciel de stock du PC de bureau).
export default async function OrderPage({ params, searchParams }: { params: { id: string }; searchParams: { from?: string } }) {
  const returnTo = safeReturnPath(searchParams.from);
  const order = await prisma.order.findUnique({ where: { id: params.id }, include: { items: true } });
  if (!order) notFound();

  // Lignes sans produit du catalogue (ni variante connue, ni article ALBASEET+) : bouton « Relier au catalogue ».
  const variantIds = order.items.map((i) => i.shopifyVariantId).filter((id): id is string => !!id);
  const known = new Set(
    variantIds.length ? (await prisma.shopifyVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true } })).map((v) => v.id) : []
  );
  const relinkable = (i: (typeof order.items)[number]) => !i.albaseetCode && (!i.shopifyVariantId || !known.has(i.shopifyVariantId));

  const phone = normalizeMoroccanPhone(order.phone);
  const vendus = order.items.filter((i) => readAlbaseetSale(i.albaseetSale)).length;
  const etat =
    vendus === order.items.length && vendus > 0
      ? "Tous les articles sont vendus dans ALBASEET+"
      : vendus > 0
        ? `${vendus} / ${order.items.length} article(s) vendu(s) dans ALBASEET+`
        : "Pas encore vendu dans ALBASEET+";

  return (
    <>
      <PageHeader back={{ href: returnTo, label: returnTo.startsWith("/rentabilite") ? "Rentabilité" : "Commandes" }} title={`Commande ${order.orderNumber}`} subtitle={etat} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card divide-y divide-line-soft">
          {order.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 p-4 md:p-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {item.title} <span className="text-muted">×{item.quantity}</span>
                </span>
                <span className="shrink-0 tabular-nums text-body">{formatDh(Number(item.price) * item.quantity)}</span>
              </div>
              {item.originalTitle && item.originalTitle !== item.title && (
                <span className="-mt-1 text-xs text-muted">Saisi à l&apos;origine : {item.originalTitle}</span>
              )}
              {item.albaseetCode && <span className="-mt-1 text-xs text-muted">Article ALBASEET+ · code {item.albaseetCode}</span>}
              <StockAlbaseet item={item} />
              {relinkable(item) && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">Pas reliée au catalogue : coût d&apos;achat inconnu sur la page Rentabilité.</span>
                  <RelinkItem itemId={item.id} quantity={item.quantity} price={Number(item.price)} />
                </div>
              )}
            </div>
          ))}
        </section>
        <aside className="card flex flex-col gap-1.5 p-4 text-sm md:p-5">
          <div className="font-semibold">{order.customerName}</div>
          <a href={`tel:${phone}`} className="tabular-nums text-body">
            {phone}
          </a>
          <div className="text-body">
            {order.address}
            {order.city ? `, ${order.city}` : ""}
          </div>
          <div className="text-muted tabular-nums">Passée le {formatDateTimeMa(order.createdAt)}</div>
          <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-3">
            <span className="text-muted">Total</span>
            <span className="text-lg font-semibold tabular-nums">{formatDh(order.totalPrice)}</span>
          </div>
        </aside>
      </div>
    </>
  );
}
