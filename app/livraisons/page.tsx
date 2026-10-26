import { prisma } from "@/lib/db";
import { Check, Phone, Trash } from "@phosphor-icons/react/dist/ssr";
import ConfirmButton from "@/components/ConfirmButton";
import CourierPicker from "@/components/CourierPicker";
import EmptyState from "@/components/EmptyState";
import MoreMenu from "@/components/MoreMenu";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import Pill from "@/components/Pill";
import SearchForm from "@/components/SearchForm";
import Segmented from "@/components/Segmented";
import { formatDateTimeMa, formatDh } from "@/lib/format";
import { DEFAULT_COURIERS, LOCAL_STATUS, NOTE_MAX_LENGTH, cleanCourier, isLocalStatus, type LocalStatus } from "@/lib/local-delivery";
import { normalizeMoroccanPhone } from "@/lib/phone";
import { markDelivered, markReturned, putBackWithCourier, reassignCourier, removeFromLocalDelivery, saveLocalNote } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type Tab = "chez" | "livrees" | "retours" | "toutes";
const TABS: { id: Tab; label: string; status: LocalStatus | null }[] = [
  { id: "chez", label: "Chez le livreur", status: "A_LIVRER" },
  { id: "livrees", label: "Livrées", status: "LIVREE" },
  { id: "retours", label: "Retours", status: "RETOUR" },
  { id: "toutes", label: "Toutes", status: null },
];

export default async function LocalDeliveriesPage({
  searchParams,
}: {
  searchParams: { tab?: string; courier?: string; q?: string; page?: string };
}) {
  const tab = TABS.find((t) => t.id === searchParams.tab) ?? TABS[0];
  const courier = cleanCourier(searchParams.courier);
  const q = searchParams.q?.trim().slice(0, 60);
  const page = Math.max(1, Number(searchParams.page) || 1);

  // Toutes les lectures de cette page : localDelivery: true uniquement.
  const base = { localDelivery: true as const };

  // Recherche : client, n° de commande ou téléphone (les numéros sont stockés
  // avec des formats variés : on cherche le texte saisi, ses chiffres seuls et
  // sa forme 06XXXXXXXX normalisée).
  const digits = q ? q.replace(/\D/g, "") : "";
  const phoneNeedles = q ? Array.from(new Set([q, digits, normalizeMoroccanPhone(q)].filter((s) => s && s.length >= 3))) : [];
  const searchWhere = q
    ? {
        OR: [
          { customerName: { contains: q, mode: "insensitive" as const } },
          { orderNumber: { contains: q, mode: "insensitive" as const } },
          { localNote: { contains: q, mode: "insensitive" as const } },
          ...phoneNeedles.map((n) => ({ phone: { contains: n } })),
        ],
      }
    : {};
  const courierWhere = courier ? { localCourier: courier } : {};
  const filtersWhere = { ...base, ...courierWhere, ...searchWhere };

  const listWhere = { ...filtersWhere, ...(tab.status ? { localStatus: tab.status } : {}) };

  const [orders, listTotal, statusCounts, courierGroups, pendingGroups] = await Promise.all([
    prisma.order.findMany({
      where: listWhere,
      include: { items: true },
      orderBy: tab.status === "A_LIVRER" ? { localAssignedAt: "asc" } : { localStatusChangedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.count({ where: listWhere }),
    prisma.order.groupBy({ by: ["localStatus"], where: filtersWhere, _count: true }),
    // Livreurs connus (filtre) : tous ceux qui ont déjà eu une commande Casa.
    prisma.order.groupBy({ by: ["localCourier"], where: base, _count: true }),
    // Cartes livreurs : montant encore à récupérer et commandes en cours.
    prisma.order.groupBy({
      by: ["localCourier", "paidOnline"],
      where: { ...base, localStatus: "A_LIVRER" },
      _count: true,
      _sum: { totalPrice: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  const countFor = (s: LocalStatus) => statusCounts.find((c) => c.localStatus === s)?._count ?? 0;
  const allCount = statusCounts.reduce((sum, c) => sum + c._count, 0);

  // Montant à récupérer : les commandes payées en ligne comptent pour 0 DH.
  const pendingBy = new Map<string, { count: number; amount: number }>();
  for (const g of pendingGroups) {
    const key = g.localCourier ?? "";
    const cur = pendingBy.get(key) ?? { count: 0, amount: 0 };
    cur.count += g._count;
    cur.amount += g.paidOnline ? 0 : Number(g._sum.totalPrice ?? 0);
    pendingBy.set(key, cur);
  }
  const totalPending = Array.from(pendingBy.values()).reduce((s, v) => s + v.count, 0);
  const totalAmount = Array.from(pendingBy.values()).reduce((s, v) => s + v.amount, 0);

  // Livreurs affichés : ceux par défaut (même à 0) puis les autres, dans l'ordre.
  const courierNames = Array.from(
    new Set([...DEFAULT_COURIERS, ...courierGroups.map((g) => g.localCourier).filter((c): c is string => !!c)])
  );

  // Toute URL construite ici repart de la page 1 sauf "page" explicite.
  const url = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { tab: tab.id, courier: courier || undefined, q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/livraisons?${s}` : "/livraisons";
  };

  const tabItems = [
    { ...TABS[0], count: countFor("A_LIVRER") },
    { ...TABS[1], count: countFor("LIVREE") },
    { ...TABS[2], count: countFor("RETOUR") },
    { ...TABS[3], count: allCount },
  ];

  return (
    <>
      <PageHeader
        title="Livraisons Casa"
        subtitle={`${totalPending} commande${totalPending > 1 ? "s" : ""} chez les livreurs · ${formatDh(totalAmount)} à récupérer`}
      />

      {/* Une carte par livreur : ce qu'il doit encore rapporter */}
      <section aria-label="Livreurs" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {courierNames.map((name) => {
          const p = pendingBy.get(name) ?? { count: 0, amount: 0 };
          const active = courier === name;
          return (
            <a
              key={name}
              href={url({ tab: "chez", courier: active ? undefined : name })}
              aria-current={active ? "true" : undefined}
              className={`card flex items-center justify-between gap-3 p-4 no-underline transition-colors hover:bg-cream ${
                active ? "border-ink bg-cream-dark" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{name}</div>
                <div className="mt-0.5 text-[13px] tabular-nums text-muted">
                  {p.count} commande{p.count > 1 ? "s" : ""} en cours
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-semibold tabular-nums">{formatDh(p.amount)}</div>
                <div className="text-xs text-muted">à récupérer</div>
              </div>
            </a>
          );
        })}
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="Filtrer par statut"
          items={tabItems.map((t) => ({ href: url({ tab: t.id }), label: t.label, count: t.count, active: tab.id === t.id }))}
        />
        <SearchForm
          action="/livraisons"
          hidden={{ tab: tab.id, ...(courier ? { courier } : {}) }}
          defaultValue={q}
          label="Rechercher une livraison"
          placeholder="Client, n° ou téléphone"
        />
      </div>

      <Segmented
        label="Filtrer par livreur"
        className="w-full md:w-fit"
        items={[
          { href: url({ courier: undefined }), label: "Tous les livreurs", active: !courier },
          ...courierNames.map((name) => ({ href: url({ courier: name }), label: name, active: courier === name })),
        ]}
      />

      {orders.length === 0 ? (
        q ? (
          <EmptyState title={`Aucun résultat pour « ${q} »`}>
            <a href={url({ q: undefined })} className="font-medium text-ink underline underline-offset-4">
              Effacer la recherche
            </a>
          </EmptyState>
        ) : tab.id === "chez" ? (
          <EmptyState title="Aucune commande chez les livreurs">
            Utilisez « Livraison Casa » sur la page Commandes pour remettre une commande à un livreur.
          </EmptyState>
        ) : (
          <EmptyState title="Aucune commande">Rien dans cet onglet{courier ? ` pour ${courier}` : ""}.</EmptyState>
        )
      ) : (
        <ul className="card divide-y divide-line-soft">
          {orders.map((order) => {
            const status = isLocalStatus(order.localStatus) ? order.localStatus : null;
            const phone = normalizeMoroccanPhone(order.phone);
            const itemsLabel = order.items.map((i) => `${i.title} ×${i.quantity}`).join(", ");
            const place = [order.address, order.quartier, order.city].filter(Boolean).join(" · ");
            return (
              <li
                key={order.id}
                className="flex flex-col gap-3 p-4 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_104px_196px] md:items-center md:gap-5 md:px-5 md:py-3.5"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold md:font-medium">{order.customerName}</div>
                    <a
                      href={`tel:${phone}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-[13px] tabular-nums text-body underline-offset-4 hover:underline"
                    >
                      <Phone size={13} aria-hidden="true" />
                      {phone}
                    </a>
                    <div className="mt-0.5 text-[13px] tabular-nums text-muted">
                      {order.orderNumber} · {order.localCourier ?? "—"}
                      {order.localAssignedAt ? `, remise le ${formatDateTimeMa(order.localAssignedAt)}` : ""}
                    </div>
                    {order.paidOnline && (
                      <div className="mt-1 text-xs font-medium text-pill-green-fg">Payée en ligne — rien à encaisser</div>
                    )}
                    {order.localNote && (
                      <p className="mt-1.5 whitespace-pre-line break-words rounded-md border border-line-soft bg-cream px-2.5 py-1.5 text-[13px] text-ink">
                        <span className="font-medium text-muted">Remarque : </span>
                        {order.localNote}
                      </p>
                    )}
                    <details className="mt-1.5">
                      <summary className="w-fit cursor-pointer list-none text-xs font-medium text-body underline-offset-4 hover:underline">
                        {order.localNote ? "Modifier la remarque" : "+ Ajouter une remarque"}
                      </summary>
                      <form action={saveLocalNote.bind(null, order.id)} className="mt-2 flex flex-col gap-2">
                        <textarea
                          name="note"
                          defaultValue={order.localNote ?? ""}
                          maxLength={NOTE_MAX_LENGTH}
                          rows={3}
                          aria-label="Remarque sur la livraison"
                          placeholder="Ex. client absent, rappeler à 18h"
                          className="input"
                        />
                        <div className="flex items-center gap-3">
                          <button type="submit" className="btn-primary h-9 px-3.5 text-[13px]">
                            Enregistrer
                          </button>
                          <span className="text-xs text-muted">Vide = efface la remarque.</span>
                        </div>
                      </form>
                    </details>
                  </div>
                  <div className="shrink-0 font-semibold tabular-nums md:hidden">{formatDh(order.totalPrice)}</div>
                </div>

                <div className="line-clamp-2 text-[13px] text-body md:text-sm">{place || "—"}</div>
                <div className="line-clamp-2 text-[13px] text-body md:line-clamp-1 md:text-sm">{itemsLabel}</div>

                <div className="flex items-center justify-between gap-2 md:flex-col md:items-end md:justify-center md:gap-1">
                  <span className="hidden text-sm font-semibold tabular-nums md:block">{formatDh(order.totalPrice)}</span>
                  {status && <Pill tone={LOCAL_STATUS[status].tone}>{LOCAL_STATUS[status].label}</Pill>}
                </div>

                <div className="flex items-center gap-2 md:justify-end md:gap-1">
                  {status === "A_LIVRER" ? (
                    <form action={markDelivered.bind(null, order.id)} className="flex flex-1 md:flex-none">
                      <button type="submit" className="btn-primary w-full md:h-9 md:px-3.5 md:text-[13px]">
                        <Check size={16} weight="bold" aria-hidden="true" />
                        Livrée
                      </button>
                    </form>
                  ) : (
                    <span className="flex-1 text-[13px] text-muted md:flex-none md:pr-1">
                      {order.localStatusChangedAt ? formatDateTimeMa(order.localStatusChangedAt) : ""}
                    </span>
                  )}

                  <MoreMenu label="Actions de livraison">
                    {status === "A_LIVRER" ? (
                      <form action={markReturned.bind(null, order.id)}>
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-cream"
                        >
                          Marquer en retour
                        </button>
                      </form>
                    ) : (
                      <form action={putBackWithCourier.bind(null, order.id)}>
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-cream"
                        >
                          Remettre chez le livreur
                        </button>
                      </form>
                    )}

                    <div className="mt-0.5 border-t border-line-soft pt-1.5">
                      <p className="px-2.5 pb-1 text-xs font-medium text-muted">Changer de livreur</p>
                      <CourierPicker action={reassignCourier.bind(null, order.id)} current={order.localCourier} />
                    </div>

                    <form action={removeFromLocalDelivery.bind(null, order.id)} className="mt-0.5 border-t border-line-soft pt-1.5">
                      <ConfirmButton
                        message={`Retirer la commande ${order.orderNumber} de ${order.customerName} de Livraisons Casa ? Elle redeviendra « Confirmée sans colis ».`}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-accent hover:bg-pill-red-bg"
                      >
                        <Trash size={16} aria-hidden="true" />
                        Retirer de Livraisons Casa
                      </ConfirmButton>
                    </form>
                  </MoreMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => url({ page: String(p) })} />
    </>
  );
}
