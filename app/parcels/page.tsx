import { prisma } from "@/lib/db";
import Pill, { type PillTone } from "@/components/Pill";
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

const PAGE_SIZE = 50;

const BUCKET_PILL: Record<ColisFilter, { tone: PillTone }> = {
  all: { tone: "gray" },
  ongoing: { tone: "amber" },
  delivered: { tone: "green" },
  todo: { tone: "red" },
};

export default async function ParcelsPage({
  searchParams,
}: {
  searchParams: { carrier?: string; filter?: string; q?: string; take?: string };
}) {
  const carrier: ColisCarrier = searchParams.carrier === "ozon" ? "ozon" : "forcelog";
  const filter: ColisFilter =
    searchParams.filter === "ongoing" || searchParams.filter === "delivered" || searchParams.filter === "todo"
      ? searchParams.filter
      : "all";
  const q = searchParams.q?.trim();
  const take = Math.max(PAGE_SIZE, Number(searchParams.take) || PAGE_SIZE);

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

  const parcels = await prisma.parcel.findMany({
    where,
    include: { order: true },
    orderBy: { carrierCreatedAt: "desc" },
    take: take + 1,
  });
  const hasMore = parcels.length > take;
  const visible = parcels.slice(0, take);

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

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[22px] md:text-[28px] font-semibold tracking-tight">Colis</h1>
          <p className="text-sm text-muted">
            {buckets.all} colis · {buckets.delivered} livrés · {buckets.todo} à traiter
          </p>
        </div>
        <div role="group" aria-label="Transporteur" className="flex gap-0.5 rounded-[10px] bg-segment p-[3px] md:inline-flex">
          {(["forcelog", "ozon"] as const).map((c) => (
            <a
              key={c}
              href={`/parcels?carrier=${c}`}
              aria-pressed={carrier === c}
              className={`flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-[13px] no-underline md:h-[34px] md:flex-none ${
                carrier === c ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-body"
              }`}
            >
              {c === "forcelog" ? "Forcelog" : "Ozon Express"}
            </a>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
        <div
          role="tablist"
          aria-label="Filtrer les colis"
          className="flex gap-5 overflow-x-auto border-b border-line md:flex-grow md:gap-6"
        >
          {tabs.map((t) => (
            <a
              key={t.id}
              href={qsBase({ filter: t.id })}
              role="tab"
              aria-selected={filter === t.id}
              className={`-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 text-sm no-underline md:h-11 ${
                filter === t.id ? "border-ink font-semibold text-ink" : "border-transparent font-medium text-body"
              }`}
            >
              {t.label} <span className="font-medium text-muted">{t.count}</span>
            </a>
          ))}
        </div>
        <form action="/parcels" className="flex items-center">
          <input type="hidden" name="carrier" value={carrier} />
          <input type="hidden" name="filter" value={filter} />
          <label htmlFor="qp" className="sr-only">
            Rechercher un colis
          </label>
          <input
            id="qp"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Nom, ville, n° de suivi…"
            className="h-11 w-full rounded-[10px] border border-line-input bg-white px-3.5 text-base text-ink md:h-10 md:w-[260px] md:text-sm"
          />
        </form>
      </div>

      {visible.length === 0 && (
        <p className="card px-5 py-6 text-sm text-muted">Aucun colis dans cette catégorie.</p>
      )}

      {/* Mobile : une carte par colis */}
      <div className="flex flex-col gap-3 md:hidden">
        {visible.map((parcel) => {
          const bucket =
            carrier === "forcelog" ? forcelogBucketForCode(parcel.statusCode) : ozonBucketForStatus(parcel.status);
          const detailHref = `/parcels/${carrier}/${encodeURIComponent(parcel.code)}`;
          const canRelaunch = carrier === "forcelog" && !!parcel.statusCode && NO_ANSWER_CODES.includes(parcel.statusCode);
          return (
            <a key={parcel.id} href={detailHref} className="card flex flex-col gap-2 p-4 no-underline">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 truncate font-semibold text-ink">{parcel.receiver}</span>
                <Pill tone={BUCKET_PILL[bucket].tone}>{parcel.status || "Statut inconnu"}</Pill>
              </div>
              <div className="text-[13px] text-body">{parcel.cityName}</div>
              <div className="font-mono text-[13px] text-body">{parcel.code}</div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted">
                  {parcel.order ? `Commande ${parcel.order.orderNumber}` : "Sans commande liée"}
                </span>
                <span className="shrink-0 font-semibold">{formatDh(parcel.price)}</span>
              </div>
              {canRelaunch && (
                <div className="pt-1">
                  <RelaunchButton code={parcel.code} action={relaunch} />
                </div>
              )}
            </a>
          );
        })}
      </div>

      {/* Desktop : tableau */}
      <div className="card hidden overflow-hidden md:block">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_170px_110px_100px] items-center gap-3 border-b border-line-soft px-5 text-[12px] font-medium uppercase tracking-wide text-muted h-11">
          <div>Client</div>
          <div>Ville</div>
          <div>N° de suivi</div>
          <div>Statut</div>
          <div className="text-right">Montant</div>
          <div />
        </div>

        {visible.map((parcel) => {
          const bucket =
            carrier === "forcelog"
              ? forcelogBucketForCode(parcel.statusCode)
              : ozonBucketForStatus(parcel.status);
          const detailHref = `/parcels/${carrier}/${encodeURIComponent(parcel.code)}`;
          const canRelaunch = carrier === "forcelog" && !!parcel.statusCode && NO_ANSWER_CODES.includes(parcel.statusCode);
          return (
            <a
              key={parcel.id}
              href={detailHref}
              className="grid min-h-16 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_170px_110px_100px] items-center gap-3 border-b border-line-soft px-5 py-3 text-sm no-underline last:border-b-0 hover:bg-cream-dark/40"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{parcel.receiver}</span>
                <span className="text-xs text-muted">
                  {parcel.order ? `Commande ${parcel.order.orderNumber}` : "Sans commande liée"}
                </span>
              </div>
              <div className="truncate text-body">{parcel.cityName}</div>
              <div className="truncate font-mono text-[13px] text-body">{parcel.code}</div>
              <div>
                <Pill tone={BUCKET_PILL[bucket].tone}>{parcel.status || "Statut inconnu"}</Pill>
              </div>
              <div className="text-right font-semibold">{formatDh(parcel.price)}</div>
              <div className="flex justify-end">
                {canRelaunch && <RelaunchButton code={parcel.code} action={relaunch} />}
              </div>
            </a>
          );
        })}

        <div className="flex h-[52px] items-center justify-between px-5 text-[13px] text-muted">
          <span>
            Mis à jour automatiquement depuis {carrier === "forcelog" ? "Forcelog" : "Ozon Express"}
          </span>
          {hasMore && (
            <a href={qsBase({ take: String(take + PAGE_SIZE) })} className="font-semibold no-underline">
              Afficher plus
            </a>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <div className="flex items-center justify-center md:hidden">
          {hasMore && (
            <a href={qsBase({ take: String(take + PAGE_SIZE) })} className="text-sm font-semibold no-underline">
              Afficher plus
            </a>
          )}
        </div>
      )}
    </>
  );
}
