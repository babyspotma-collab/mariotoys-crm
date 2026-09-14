// Client pour l'API Forcelog (transporteur). Auth par header X-API-Key.
// Pas de webhooks côté Forcelog : le suivi se fait par polling (voir
// app/api/cron/sync-tracking).
//
// NB: la liste de champs d'AddParcel couvre ce qui a été documenté
// (ORDER_NUM, RECEIVER, PHONE, CITY, ADDRESS, COD, PRODUCT_NATURE) ;
// QUARTIER/COMMENT/FRAGILE sont des noms de champs supposés (non
// confirmés par la doc, qui mentionnait juste "etc.") — si l'appel
// échoue avec une erreur de validation, l'erreur brute est conservée
// dans Order.forcelogError pour ajustement des noms exacts.

const BASE_URL = "https://api.forcelog.ma";

function headers() {
  const apiKey = process.env.FORCELOG_API_KEY;
  if (!apiKey) throw new Error("FORCELOG_API_KEY manquant");
  return {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
  };
}

// Forcelog renvoie systématiquement HTTP 200, même en cas d'échec métier
// (ville invalide, colis introuvable, etc.) — le vrai résultat est dans
// un champ RESULT imbriqué (ex: AUTH.RESULT, RETURN.RESULT). On scanne
// les objets de premier niveau de la réponse pour détecter un RESULT
// différent de SUCCESS, quel que soit le nom de la clé d'enveloppe.
function findResultFailure(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  for (const value of Object.values(json as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      if (typeof v.RESULT === "string" && v.RESULT.toUpperCase() !== "SUCCESS") {
        return String(v.MESSAGE ?? v.RESULT);
      }
    }
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Réponse Forcelog non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`Forcelog ${path} — ${res.status}: ${JSON.stringify(json)}`);
  }
  const failure = findResultFailure(json);
  if (failure) {
    throw new Error(`Forcelog ${path} — ${failure}`);
  }
  return json as T;
}

export function healthCheck() {
  return request<{ status: string }>("/health");
}

export type AddParcelInput = {
  orderNum: string;
  receiver: string;
  phone: string;
  city: string; // code ville Forcelog (voir getCities), pas le nom libre
  quartier?: string;
  address: string;
  comment?: string;
  cod: number;
  productNature: string;
  fragile?: boolean;
};

export type AddParcelResult = {
  code: string; // code colis Forcelog
  [key: string]: unknown;
};

export function addParcel(input: AddParcelInput) {
  return request<AddParcelResult>("/customer/Parcels/AddParcel", {
    method: "POST",
    body: JSON.stringify({
      ORDER_NUM: input.orderNum,
      RECEIVER: input.receiver,
      PHONE: input.phone,
      CITY: input.city,
      QUARTIER: input.quartier || undefined,
      ADDRESS: input.address,
      COMMENT: input.comment || undefined,
      COD: input.cod,
      PRODUCT_NATURE: input.productNature,
      FRAGILE: input.fragile ?? false,
    }),
  });
}

export function getParcel(code: string) {
  return request<Record<string, unknown>>(
    `/customer/Parcels/GetParcel?Code=${encodeURIComponent(code)}`
  );
}

export function getParcels(params: {
  page?: number;
  limit?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("PAGE", String(params.page));
  if (params.limit) qs.set("LIMIT", String(params.limit));
  if (params.status) qs.set("STATUS", params.status);
  if (params.dateFrom) qs.set("DATE_FROM", params.dateFrom);
  if (params.dateTo) qs.set("DATE_TO", params.dateTo);
  return request<Record<string, unknown>>(`/customer/Parcels/GetParcels?${qs.toString()}`);
}

export function getTracking(code: string) {
  return request<{ history?: Array<{ status: string; date: string; [k: string]: unknown }> }>(
    `/customer/Parcels/GetTracking?Code=${encodeURIComponent(code)}`
  );
}

export function getParcelLabelUrl(code: string) {
  return `${BASE_URL}/customer/Parcels/GetParcelLabel?Code=${encodeURIComponent(code)}`;
}

export type ForcelogCity = { code: string; name: string };

// Réponse réelle observée : { AUTH: {...}, Cities: { "1": { CODE, NAME,
// D_FEES, D_FEES_SAME_CITY }, "2": {...}, ... } } — un objet indexé par
// position, pas un tableau.
export async function getCities(): Promise<ForcelogCity[]> {
  const raw = await request<{ Cities?: Record<string, { CODE: string; NAME: string }> }>(
    "/customer/Cities"
  );

  return Object.values(raw.Cities ?? {})
    .map((c) => ({ code: String(c.CODE ?? ""), name: String(c.NAME ?? "") }))
    .filter((c) => c.code && c.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Retours ────────────────────────────────────────────────────────────────

export async function getReturnEligibleParcels(): Promise<string[]> {
  const raw = await request<{ RETURN: { PARCELS: string[] } }>("/customer/Return/GetParcels", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return raw.RETURN.PARCELS ?? [];
}

export type ReturnRequestInput = {
  parcelCodes: string[];
  phone: string;
  quarter: string; // 5 caractères minimum (contrainte Forcelog)
  city: string; // code ville Forcelog (voir getCities)
  note?: string;
};

export function requestReturn(input: ReturnRequestInput) {
  if (input.quarter.trim().length < 5) {
    throw new Error("Le quartier doit contenir au moins 5 caractères (contrainte Forcelog).");
  }
  return request<{ RETURN: { MESSAGE?: string } }>("/customer/Return/Request", {
    method: "POST",
    body: JSON.stringify({
      PARCELS: input.parcelCodes,
      PHONE: input.phone,
      QUARTER: input.quarter,
      CITY: input.city,
      NOTE: input.note || undefined,
    }),
  });
}

// ─── Réclamations ─────────────────────────────────────────────────────────────
// Un colis ne peut avoir qu'une réclamation ouverte à la fois : toujours
// appeler getClaim() d'abord (EXISTS) pour savoir s'il faut createClaim()
// ou replyClaim(). Les types de réclamation (avec leurs champs requis)
// viennent uniquement de getClaimTypes() — jamais de TYPE_ID en dur.

export type ClaimType = {
  id: number;
  label: string;
  requires: string[]; // noms de champs additionnels requis, ex: ["NEW_PRICE"]
  changesParcel: boolean; // si true, demander confirmation avant envoi
  needsOpenParcel: boolean;
};

// Forme exacte de la réponse non garantie au-delà de "liste de { ID,
// LABEL, REQUIRES, CHANGES_PARCEL, NEEDS_OPEN_PARCEL }" — tableau direct
// ou enveloppé toléré.
export async function getClaimTypes(): Promise<ClaimType[]> {
  const raw = await request<any>("/customer/Claims/Types");
  const list: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.TYPES)
      ? raw.TYPES
      : Array.isArray(raw?.DATA)
        ? raw.DATA
        : [];

  return list
    .map((t) => ({
      id: Number(t.ID),
      label: String(t.LABEL ?? ""),
      requires: Array.isArray(t.REQUIRES) ? t.REQUIRES : t.REQUIRES ? [String(t.REQUIRES)] : [],
      changesParcel: Boolean(t.CHANGES_PARCEL),
      needsOpenParcel: Boolean(t.NEEDS_OPEN_PARCEL),
    }))
    .filter((t) => t.id && t.label);
}

export type CreateClaimInput = {
  parcelCode: string;
  typeId: number;
  message: string;
  extraFields?: Record<string, string | number>; // ex: { NEW_PRICE: 199 } ou { POSTPONE_DATE: "2026-09-20" }
};

export function createClaim(input: CreateClaimInput) {
  if (input.message.length > 1000) {
    throw new Error("Le message de réclamation ne doit pas dépasser 1000 caractères.");
  }
  return request<Record<string, unknown>>("/customer/Claims/Create", {
    method: "POST",
    body: JSON.stringify({
      PARCEL_CODE: input.parcelCode,
      TYPE_ID: input.typeId,
      MESSAGE: input.message,
      ...input.extraFields,
    }),
  });
}

export type ClaimMessage = { from: "CUSTOMER" | "SUPPORT" | string; message: string };

export async function getClaim(
  parcelCode: string
): Promise<{ exists: boolean; messages: ClaimMessage[] }> {
  const raw = await request<{ EXISTS?: number | string; CLAIM?: { MESSAGES?: any[] } }>(
    `/customer/Claims/Get?ParcelCode=${encodeURIComponent(parcelCode)}`
  );
  const messages = (raw.CLAIM?.MESSAGES ?? []).map((m) => ({
    from: m.FROM,
    message: m.MESSAGE,
  }));
  return { exists: Number(raw.EXISTS) === 1, messages };
}

export function replyClaim(parcelCode: string, message: string) {
  if (message.length > 1000) {
    throw new Error("Le message de réclamation ne doit pas dépasser 1000 caractères.");
  }
  return request<Record<string, unknown>>("/customer/Claims/Reply", {
    method: "POST",
    body: JSON.stringify({ PARCEL_CODE: parcelCode, MESSAGE: message }),
  });
}
