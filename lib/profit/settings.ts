// Réglages de la page Rentabilité (table ProfitSetting, clé -> JSON) et état des
// synchronisations. Une clé absente prend la valeur par défaut ci-dessous.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type CasaRates = { defaultFee: number; couriers: { name: string; fee: number }[] };
export type MetaAccount = { id: string; name: string };
export type ReturnFees = { FORCELOG: number | null; OZON: number | null };

export type ProfitSettings = {
  usdToMad: number;
  damagedReturnPct: number; // % du coût d'achat des produits retournés compté comme perte
  metaAccounts: MetaAccount[];
  casa: CasaRates;
  returnFees: ReturnFees; // frais de retour EN PLUS du tarif aller (un colis retourné paie toujours l'aller)
};

export const DEFAULT_SETTINGS: ProfitSettings = {
  usdToMad: 10.2,
  damagedReturnPct: 0,
  metaAccounts: [
    { id: "774579314518013", name: "ADS 5" },
    { id: "1854409869273588", name: "ADS 15" },
  ],
  casa: {
    defaultFee: 20,
    couriers: [
      { name: "Amine", fee: 0 },
      { name: "Retrait Magasin", fee: 0 },
      { name: "Retrait Dépot", fee: 0 },
    ],
  },
  returnFees: { FORCELOG: 0, OZON: null },
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof ProfitSettings)[];

export async function getSettings(): Promise<ProfitSettings> {
  const rows = await prisma.profitSetting.findMany({ where: { key: { in: KEYS } } });
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as ProfitSettings;
}

export async function saveSetting<K extends keyof ProfitSettings>(key: K, value: ProfitSettings[K]): Promise<void> {
  const json = value as unknown as Prisma.InputJsonValue;
  await prisma.profitSetting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } });
}

// ── État des synchronisations (affiché sur la page, jamais de secret dedans) ──
export type SyncStatus = { at: string; ok: boolean; message: string };
export type SyncName = "stock" | "meta" | "catalog";

export async function getSyncStatus(): Promise<Partial<Record<SyncName, SyncStatus>>> {
  const rows = await prisma.profitSetting.findMany({ where: { key: { startsWith: "status." } } });
  return Object.fromEntries(rows.map((r) => [r.key.slice("status.".length), r.value as SyncStatus]));
}

export async function setSyncStatus(name: SyncName, ok: boolean, message: string): Promise<void> {
  const value = { at: new Date().toISOString(), ok, message: message.slice(0, 500) } as Prisma.InputJsonValue;
  const key = `status.${name}`;
  await prisma.profitSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

// Valeur interne libre (ex. opération groupée Shopify en cours).
export async function getInternal<T>(key: string): Promise<T | null> {
  const row = await prisma.profitSetting.findUnique({ where: { key: `internal.${key}` } });
  return (row?.value as T) ?? null;
}

export async function setInternal(key: string, value: unknown): Promise<void> {
  const k = `internal.${key}`;
  if (value === null) {
    await prisma.profitSetting.deleteMany({ where: { key: k } });
    return;
  }
  const json = value as Prisma.InputJsonValue;
  await prisma.profitSetting.upsert({ where: { key: k }, create: { key: k, value: json }, update: { value: json } });
}
