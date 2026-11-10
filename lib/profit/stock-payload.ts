// Lecture du corps envoyé par l'appli de stock à POST /api/stock-sync. Module
// pur, testé par stock-payload.check.ts. Contrat :
//   { "sent_at": "ISO", "items": [ { "code", "barcode", "designation",
//     "prix_achat", "prix_gros", "prix_vente", "stock", "fournisseur",
//     "famille", "updated_at" } ] }   (500 articles au maximum)
// Un article invalide est écarté (et signalé dans "errors") sans bloquer le lot.
// Un champ ABSENT (prix_gros, fournisseur, famille…) garde la valeur en base ;
// un champ à null l'efface.

export const MAX_ITEMS = 500;

export type StockItem = {
  code: string;
  barcode: string | null | undefined;
  designation: string;
  prixAchat: number | null;
  prixGros: number | null | undefined;
  prixVente: number | null | undefined;
  stock: number | null | undefined;
  fournisseur: string | null | undefined;
  famille: string | null | undefined;
  updatedAt: Date | null;
};

export type StockPayload = { sentAt: Date | null; items: StockItem[]; errors: { index: number; code: string | null; message: string }[]; received: number };

class FieldError extends Error {}

function text(v: unknown, field: string, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number") v = String(v);
  if (typeof v !== "string") throw new FieldError(`${field} : texte attendu`);
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

function amount(v: unknown, field: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new FieldError(`${field} : nombre attendu`);
  if (n < 0 || n > 10_000_000) throw new FieldError(`${field} : valeur hors limites`);
  return Math.round(n * 100) / 100;
}

// Le stock peut être négatif dans ALBASEET+ (vente avant réception) : gardé tel quel.
function quantity(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e9) throw new FieldError("stock : nombre attendu");
  return Math.round(n * 1000) / 1000;
}

function date(v: unknown, field: string): Date | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new FieldError(`${field} : date ISO attendue`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new FieldError(`${field} : date ISO invalide`);
  return d;
}

/** Lève une Error (réponse 400) si le corps entier est inutilisable. */
export function parseStockPayload(body: unknown): StockPayload {
  if (!body || typeof body !== "object") throw new Error("Corps JSON attendu");
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items)) throw new Error("items : liste attendue");
  if (b.items.length > MAX_ITEMS) throw new Error(`items : ${MAX_ITEMS} articles au maximum par appel (reçu ${b.items.length})`);
  let sentAt: Date | null;
  try {
    sentAt = date(b.sent_at, "sent_at");
  } catch (e) {
    throw new Error((e as Error).message);
  }

  const byCode = new Map<string, StockItem>(); // un code en double dans le lot : le dernier gagne
  const errors: StockPayload["errors"] = [];
  b.items.forEach((raw, index) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    let code: string | null = null;
    try {
      code = text(r.code, "code", 100) ?? null;
      if (!code) throw new FieldError("code : obligatoire");
      const designation = text(r.designation, "designation", 300) ?? code;
      const prixAchat = amount(r.prix_achat, "prix_achat");
      byCode.set(code, {
        code,
        barcode: text(r.barcode, "barcode", 100),
        designation,
        prixAchat: prixAchat ?? null,
        prixGros: amount(r.prix_gros, "prix_gros"),
        prixVente: amount(r.prix_vente, "prix_vente"),
        stock: quantity(r.stock),
        fournisseur: text(r.fournisseur, "fournisseur", 150),
        famille: text(r.famille, "famille", 150),
        updatedAt: date(r.updated_at, "updated_at"),
      });
    } catch (e) {
      if (!(e instanceof FieldError)) throw e;
      errors.push({ index, code, message: e.message });
    }
  });
  return { sentAt, items: [...byCode.values()], errors, received: b.items.length };
}
