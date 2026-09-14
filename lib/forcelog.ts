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
