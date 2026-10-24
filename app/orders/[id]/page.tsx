import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import StockAlbaseet from "@/components/StockAlbaseet";
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
      <PageHeader back={{ href: returnTo, label: "Commandes" }} title={`Commande ${order.orderNumber}`} subtitle={etat} />
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
              <StockAlbaseet item={item} />
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
