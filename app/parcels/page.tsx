import { prisma } from "@/lib/db";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import Pill, { type PillTone } from "@/components/Pill";
import SearchForm from "@/components/SearchForm";
import Segmented from "@/components/Segmented";
import RelaunchButton from "@/components/RelaunchButton";
import { getParcelCategoryCounts } from "@/lib/parcel-category-counts";
import { getOzonCategoryCounts } from "@/lib/ozon-category-counts";
import { categoryById } from "@/lib/parcel-categories";
import {
  forcelogBucketCounts,
  forcelogBucketForCode,
  ozonBucketCounts,
  ozonBucketForStatus,
  parcelWhereFor,
  type ColisCarrier,
  type ColisFilter,
} from "@/lib/parcel-filters";
import { formatDh } from "@/lib/format";
import { relaunch } from "./actions";

const NO_ANSWER_CODES = categoryById("noAnswer").codes;

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

const BUCKET_PILL: Record<ColisFilter, { tone: PillTone }> = {
  all: { tone: "gray" },
  ongoing: { tone: "amber" },
  delivered: { tone: "green" },
  todo: { tone: "red" },
};

export default async function ParcelsPage({
  searchParams,
}: {
  searchParams: { carrier?: string; filter?: string; q?: string; page?: string };
}) {
  const carrier: ColisCarrier = searchParams.carrier === "ozon" ? "ozon" : "forcelog";
  const filter: ColisFilter =
    searchParams.filter === "ongoing" || searchParams.filter === "delivered" || searchParams.filter === "todo"
      ? searchParams.filter
      : "all";
  const q = searchParams.q?.trim();
  const page = Math.max(1, Number(searchParams.page) || 1);

  const [forcelogRaw, ozonRaw] = await Promise.all([getParcelCategoryCounts(), getOzonCategoryCounts()]);
  const buckets = carrier === "forcelog" ? forcelogBucketCounts(forcelogRaw) : ozonBucketCounts(ozonRaw);

  const where: Record<string, unknown> = {
    carrier: carrier.toUpperCase(),
    ...parcelWhereFor(carrier, filter),
    ...(q
      ? {
          OR: [
            { receiver: { contains: q, mode: "insensitive" } },
            { cityName: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [visible, listTotal] = await Promise.all([
    prisma.parcel.findMany({
      where,
      include: { order: true },
      orderBy: { carrierCreatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.parcel.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  const allTabs: { id: ColisFilter; label: string; count: number }[] = [
    { id: "all", label: "Tous", count: buckets.all },
    { id: "ongoing", label: "En cours", count: buckets.ongoing },
    { id: "delivered", label: "Livrés", count: buckets.delivered },
    { id: "todo", label: "À traiter", count: buckets.todo },
  ];
  const tabs = allTabs.filter((t) => t.id === "all" || t.count > 0);

  const qsBase = (over: Record<string, string>) => {
    const params = new URLSearchParams({ carrier, filter, ...(q ? { q } : {}) });
    for (const [k, v] of Object.entries(over)) params.set(k, v);
    return `/parcels?${params.toString()}`;
  };

  const carrierName = carrier === "forcelog" ? "Forcelog" : "Ozon Express";

  return (
    <>
      <PageHeader
        title="Colis"
        subtitle={`${buckets.all} colis · ${buckets.delivered} livrés, ${buckets.todo} à traiter`}
        actions={
          <Segmented
            label="Transporteur"
            className="w-fit"
            items={(["forcelog", "ozon"] as const).map((c) => ({
              href: `/parcels?carrier=${c}`,
              label: c === "forcelog" ? "Forcelog" : "Ozon",
              active: carrier === c,
            }))}
          />
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segmented
          label="Filtrer les colis"
          items={tabs.map((t) => ({ href: qsBase({ filter: t.id }), label: t.label, count: t.count, active: filter === t.id }))}
        />
        <SearchForm
          action="/parcels"
          hidden={{ carrier, filter }}
          defaultValue={q}
          label="Rechercher un colis"
          placeholder="Nom, ville, n° de suivi"
        />
      </div>

      {visible.length === 0 ? (
        q ? (
          <EmptyState title={`Aucun résultat pour « ${q} »`}>
            <a href={`/parcels?carrier=${carrier}&filter=${filter}`} className="font-medium text-ink underline underline-offset-4">
              Effacer la recherche
            </a>
          </EmptyState>
        ) : (
          <EmptyState title="Aucun colis dans cette catégorie" />
        )
      ) : (
        <ul className="card divide-y divide-line-soft">
          {visible.map((parcel) => {
            const bucket =
              carrier === "forcelog" ? forcelogBucketForCode(parcel.statusCode) : ozonBucketForStatus(parcel.status);
            const detailHref = `/parcels/${carrier}/${encodeURIComponent(parcel.code)}`;
            const canRelaunch =
              carrier === "forcelog" && !!parcel.statusCode && NO_ANSWER_CODES.includes(parcel.statusCode);
            return (
              <li
                key={parcel.id}
                className="relative flex flex-col gap-2.5 p-4 transition-colors hover:bg-cream md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_96px_104px] md:items-center md:gap-5 md:px-5 md:py-3.5"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Lien étiré : toute la ligne est cliquable, sans imbriquer le bouton Relancer dans le lien */}
                    <a href={detailHref} className="block truncate font-semibold no-underline after:absolute after:inset-0 md:font-medium">
                      {parcel.receiver || "Destinataire inconnu"}
                    </a>
                    <div className="mt-0.5 truncate text-[13px] text-muted">
                      <span className="md:hidden">{parcel.cityName} · </span>
                      {parcel.order ? `Commande ${parcel.order.orderNumber}` : "Sans commande liée"}
                    </div>
                  </div>
                  <div className="shrink-0 font-semibold tabular-nums md:hidden">{formatDh(parcel.price)}</div>
                </div>
                <div className="hidden truncate text-sm text-body md:block">{parcel.cityName}</div>
                <div className="truncate font-mono text-[13px] text-body">{parcel.code}</div>
                <div className="flex min-w-0 items-center justify-between gap-3 md:block">
                  <span className="min-w-0">
                    <Pill tone={BUCKET_PILL[bucket].tone}>{parcel.status || "Statut inconnu"}</Pill>
                  </span>
                  {canRelaunch && (
                    <span className="relative z-10 md:hidden">
                      <RelaunchButton code={parcel.code} action={relaunch} />
                    </span>
                  )}
                </div>
                <div className="hidden text-right text-sm font-semibold tabular-nums md:block">{formatDh(parcel.price)}</div>
                <div className="relative z-10 hidden justify-end md:flex">
                  {canRelaunch && <RelaunchButton code={parcel.code} action={relaunch} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => qsBase({ page: String(p) })} />

      <p className="text-center text-xs text-muted">Mis à jour automatiquement depuis {carrierName}</p>
    </>
  );
}
