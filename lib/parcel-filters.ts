// Regroupement des catégories fines (lib/parcel-categories.ts /
// lib/ozon-categories.ts) en 4 filtres simples pour la page Colis
// unifiée (app/parcels/page.tsx) : Tous / En cours / Livrés / À traiter.
// "À traiter" = refusés-ou-annulés + sans réponse + hors zone + non
// catégorisé (décision utilisateur, voir refonte 2026-09-27).

import { ALL_CATEGORIZED_CODES, categoryById } from "./parcel-categories";
import { ALL_OZON_CATEGORIZED_STATUSES, ozonCategoryById } from "./ozon-categories";
import type { ParcelCategoryCounts } from "./parcel-category-counts";
import type { OzonCategoryCounts } from "./ozon-category-counts";

export type ColisFilter = "all" | "ongoing" | "delivered" | "todo";
export type ColisCarrier = "forcelog" | "ozon";

const FORCELOG_ONGOING = ["shipped", "delivering", "relaunchNewClient"] as const;
const FORCELOG_TODO = ["cancelled", "noAnswer", "outOfZone"] as const;
const OZON_ONGOING = ["shipped", "delivering"] as const;
const OZON_TODO = ["cancelled", "noAnswer", "outOfZone"] as const;

export function parcelWhereFor(carrier: ColisCarrier, filter: ColisFilter) {
  if (carrier === "forcelog") {
    if (filter === "delivered") return { statusCode: { in: categoryById("delivered").codes } };
    if (filter === "ongoing") {
      return { statusCode: { in: FORCELOG_ONGOING.flatMap((id) => categoryById(id).codes) } };
    }
    if (filter === "todo") {
      const codes = FORCELOG_TODO.flatMap((id) => categoryById(id).codes);
      return {
        OR: [
          { statusCode: { in: codes } },
          { statusCode: null },
          { statusCode: { notIn: ALL_CATEGORIZED_CODES } },
        ],
      };
    }
    return {};
  }

  if (filter === "delivered") return { status: { in: ozonCategoryById("delivered").statuses } };
  if (filter === "ongoing") {
    return { status: { in: OZON_ONGOING.flatMap((id) => ozonCategoryById(id).statuses) } };
  }
  if (filter === "todo") {
    const statuses = OZON_TODO.flatMap((id) => ozonCategoryById(id).statuses);
    return { OR: [{ status: { in: statuses } }, { status: { notIn: ALL_OZON_CATEGORIZED_STATUSES } }] };
  }
  return {};
}

export function forcelogBucketCounts(raw: ParcelCategoryCounts) {
  return {
    all: raw.all,
    ongoing: raw.shipped + raw.delivering + raw.relaunchNewClient,
    delivered: raw.delivered,
    todo: raw.cancelled + raw.noAnswer + raw.outOfZone + raw.uncategorized,
  };
}

export function ozonBucketCounts(raw: OzonCategoryCounts) {
  return {
    all: raw.all,
    ongoing: raw.shipped + raw.delivering,
    delivered: raw.delivered,
    todo: raw.cancelled + raw.noAnswer + raw.outOfZone + raw.uncategorized,
  };
}

/** Catégorie fine d'un colis (pour choisir la couleur de la pastille de statut sur une ligne). */
export function forcelogBucketForCode(code: string | null): ColisFilter {
  if (code && categoryById("delivered").codes.includes(code)) return "delivered";
  if (code && FORCELOG_ONGOING.some((id) => categoryById(id).codes.includes(code))) return "ongoing";
  return "todo";
}

export function ozonBucketForStatus(status: string): ColisFilter {
  if (ozonCategoryById("delivered").statuses.includes(status)) return "delivered";
  if (OZON_ONGOING.some((id) => ozonCategoryById(id).statuses.includes(status))) return "ongoing";
  return "todo";
}
