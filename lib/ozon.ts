// Client pour l'API Ozon Express (2e transporteur, totalement indépendant
// de Forcelog — voir lib/forcelog.ts, aucune logique partagée). Auth par
// ID client + clé API insérés directement dans l'URL (OZON_CUSTOMER_ID /
// OZON_API_KEY, jamais en dur dans le code).
//
// Convention de réponse vérifiée en direct sur de vrais colis (parcel-info,
// tracking) : enveloppe {"CHECK_API": {RESULT, MESSAGE}, "<ACTION>":
// {RESULT, MESSAGE, ...}}. La doc officielle montre un exemple de réponse
// AddParcel à plat (sans enveloppe) — non vérifié en pratique (créer un
// colis a un vrai coût logistique, pas testé ici). Leçon tirée de Forcelog
// (voir lib/forcelog.ts) : ne jamais faire confiance à une forme de réponse
// non vérifiée pour un champ critique comme le code colis — extraction
// défensive multi-forme ci-dessous plutôt qu'un accès direct à une clé
// supposée.

const BASE_URL = "https://api.ozonexpress.ma";

function credentials() {
  const customerId = process.env.OZON_CUSTOMER_ID;
  const apiKey = process.env.OZON_API_KEY;
  if (!customerId || !apiKey) throw new Error("OZON_CUSTOMER_ID/OZON_API_KEY manquants");
  return { customerId, apiKey };
}

function customerPath(path: string): string {
  const { customerId, apiKey } = credentials();
  return `/customers/${customerId}/${apiKey}${path}`;
}

// Contrairement à Forcelog (RESULT non-SUCCESS possible avec HTTP 200), on
// scanne pareil les objets de premier niveau de la réponse à la recherche
// d'un RESULT en échec, quel que soit le nom de la clé d'enveloppe —
// couvre à la fois CHECK_API (clé API invalide) et l'action elle-même
// (ex: PARCEL-INFO.RESULT = "ERROR").
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

async function request<T>(path: string, form?: Record<string, string>): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: form ? new URLSearchParams(form) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Réponse Ozon non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`Ozon ${path} — ${res.status}: ${JSON.stringify(json)}`);
  }
  const failure = findResultFailure(json);
  if (failure) {
    throw new Error(`Ozon ${path} — ${failure}`);
  }
  return json as T;
}

// Cherche une valeur de code/référence sous plusieurs noms de champ et à
// plusieurs profondeurs plausibles (racine, premier niveau d'enveloppe,
// et un niveau de plus comme PARCEL-INFO.INFOS) — voir le commentaire
// d'en-tête sur pourquoi on ne fait pas confiance à une seule forme.
function extractField(json: unknown, keys: string[]): string | null {
  if (!json || typeof json !== "object") return null;
  const candidates: Record<string, unknown>[] = [json as Record<string, unknown>];
  for (const value of Object.values(json as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      candidates.push(value as Record<string, unknown>);
      for (const nested of Object.values(value as Record<string, unknown>)) {
        if (nested && typeof nested === "object") candidates.push(nested as Record<string, unknown>);
      }
    }
  }
  for (const obj of candidates) {
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === "string" && v) return v;
    }
  }
  return null;
}

const TRACKING_NUMBER_KEYS = ["TRACKING-NUMBER", "TRACKING_NUMBER", "tracking-number", "tracking_number"];

export type OzonAddParcelInput = {
  receiver: string;
  phone: string;
  cityId: string; // ID Ozon (voir getCities), pas le nom
  address: string;
  note?: string;
  price: number;
  nature?: string;
  fragile?: boolean;
};

export type OzonAddParcelResult = { code: string; raw: unknown };

export async function addParcel(input: OzonAddParcelInput): Promise<OzonAddParcelResult> {
  const json = await request<Record<string, unknown>>(customerPath("/add-parcel"), {
    "parcel-receiver": input.receiver,
    "parcel-phone": input.phone,
    "parcel-city": input.cityId,
    "parcel-address": input.address,
    "parcel-note": input.note ?? "",
    "parcel-price": String(input.price),
    "parcel-nature": input.nature ?? "",
    "parcel-stock": "1", // valeur par défaut documentée (1 = stock, 0 = ramassage)
    "parcel-open": "1", // 1 = ouvrir le colis (documenté comme défaut)
    "parcel-fragile": input.fragile ? "1" : "0",
  });

  const code = extractField(json, TRACKING_NUMBER_KEYS);
  if (!code) {
    throw new Error(
      `Ozon AddParcel — numéro de suivi introuvable dans la réponse (forme non confirmée). Réponse brute: ${JSON.stringify(json).slice(0, 500)}`
    );
  }
  return { code, raw: json };
}

export type OzonParcelInfo = {
  code: string;
  receiver: string;
  phone: string;
  cityName: string;
  address: string;
  price: number;
};

export async function getParcelInfo(code: string): Promise<OzonParcelInfo | null> {
  const json = await request<Record<string, unknown>>(customerPath("/parcel-info"), {
    "tracking-number": code,
  });
  const infos = (json["PARCEL-INFO"] as any)?.INFOS as Record<string, unknown> | undefined;
  if (!infos) return null;
  return {
    code: String(infos["TRACKING-NUMBER"] ?? code),
    receiver: String(infos.RECEIVER ?? ""),
    phone: String(infos.PHONE ?? ""),
    cityName: String(infos.CITY_NAME ?? ""),
    address: String(infos.ADDRESS ?? ""),
    price: parseFloat(String(infos.PRICE ?? "0")),
  };
}

export type OzonTrackingEvent = { status: string; timeStr: string; comment: string };

export type OzonTracking = { status: string; history: OzonTrackingEvent[] };

// Forme réelle confirmée sur plusieurs vrais colis :
// { "TRACKING": { "RESULT", "HISTORY": { "1": {STATUT, TIME, TIME_STR,
// COMMENT}, ... }, "LAST_TRACKING": {STATUT, TIME, TIME_STR, COMMENT} } }.
// STATUT est le libellé FR brut (ex: "Mise en distribution") — Ozon
// n'expose aucun code machine séparé, contrairement à Forcelog.
export async function getTracking(code: string): Promise<OzonTracking> {
  const json = await request<{
    TRACKING?: { HISTORY?: Record<string, any>; LAST_TRACKING?: { STATUT?: string } };
  }>(customerPath("/tracking"), { "tracking-number": code });

  const historyObj = json.TRACKING?.HISTORY ?? {};
  const history: OzonTrackingEvent[] = Object.values(historyObj).map((h: any) => ({
    status: String(h.STATUT ?? ""),
    timeStr: String(h.TIME_STR ?? ""),
    comment: String(h.COMMENT ?? ""),
  }));
  const status = String(json.TRACKING?.LAST_TRACKING?.STATUT ?? history[history.length - 1]?.status ?? "");

  return { status, history };
}

export type OzonCity = { id: string; ref: string; name: string };

// Endpoint public, pas d'auth requise (vérifié en direct) — forme réelle
// confirmée : { "CITIES": { "<id>": {ID, REF, NAME, ...prix}, ... } },
// objet indexé par position comme les villes Forcelog.
export async function getCities(): Promise<OzonCity[]> {
  const res = await fetch(`${BASE_URL}/cities`);
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Réponse Ozon /cities non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`Ozon /cities — ${res.status}: ${JSON.stringify(json)}`);

  return Object.values(json.CITIES ?? {})
    .map((c: any) => ({ id: String(c.ID ?? ""), ref: String(c.REF ?? ""), name: String(c.NAME ?? "") }))
    .filter((c) => c.id && c.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Bon de livraison (BL) — flow en 4 étapes ──────────────────────────────
// Forme des réponses non vérifiée en pratique (pas encore de vrai BL créé
// via cette intégration) — extraction défensive comme pour addParcel.

const REF_KEYS = ["ref", "Ref", "REF"];

export async function addDeliveryNote(): Promise<{ ref: string; raw: unknown }> {
  const json = await request<Record<string, unknown>>(customerPath("/add-delivery-note"));
  const ref = extractField(json, REF_KEYS);
  if (!ref) {
    throw new Error(
      `Ozon AddDeliveryNote — référence introuvable dans la réponse (forme non confirmée). Réponse brute: ${JSON.stringify(json).slice(0, 500)}`
    );
  }
  return { ref, raw: json };
}

export async function addParcelToDeliveryNote(ref: string, codes: string[]): Promise<void> {
  const form: Record<string, string> = { Ref: ref };
  codes.forEach((code, i) => {
    form[`Codes[${i}]`] = code;
  });
  await request(customerPath("/add-parcel-to-delivery-note"), form);
}

export async function saveDeliveryNote(ref: string): Promise<void> {
  await request(customerPath("/save-delivery-note"), { Ref: ref });
}

export type DeliveryNotePdfVariant = "standard" | "a4" | "10x10";

export function getDeliveryNotePdfUrl(ref: string, variant: DeliveryNotePdfVariant = "standard"): string {
  const path =
    variant === "a4"
      ? "pdf-delivery-note-tickets"
      : variant === "10x10"
        ? "pdf-delivery-note-tickets-4-2"
        : "pdf-delivery-note";
  return `https://client.ozonexpress.ma/${path}?dn-ref=${encodeURIComponent(ref)}`;
}
