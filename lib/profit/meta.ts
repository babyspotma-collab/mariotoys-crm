// Dépenses Meta Ads par campagne et par jour (API Marketing, Graph API), pour les
// comptes réglés sur /rentabilite/reglages. Jeton : META_ACCESS_TOKEN (utilisateur
// système, permission ads_read) — jamais affiché ni écrit dans un message d'erreur.
//
// Chaque passage recharge les 7 derniers jours (Meta corrige ses chiffres après
// coup) ; le tout premier remonte au 1er septembre 2026 (début des données du CRM).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSettings, setSyncStatus } from "./settings";

const GRAPH = "https://graph.facebook.com";
const FIRST_DAY = "2026-09-01";
const DAY = 86_400_000;

const version = () => process.env.META_API_VERSION?.trim() || "v24.0";

type GraphPage<T> = { data: T[]; paging?: { next?: string } };

async function graphGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new Error(`Meta : ${e.message ?? `HTTP ${res.status}`}${e.code ? ` (code ${e.code})` : ""}`);
  }
  return json as T;
}

async function graphAll<T>(path: string, params: Record<string, string>, token: string): Promise<T[]> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  let url: string | undefined = `${GRAPH}/${version()}/${path}?${qs}`;
  const out: T[] = [];
  for (let page = 0; url && page < 50; page++) {
    const json: GraphPage<T> = await graphGet<GraphPage<T>>(url);
    out.push(...json.data);
    url = json.paging?.next;
  }
  return out;
}

/** Date du jour "YYYY-MM-DD" à l'heure du Maroc, décalée de `days` jours. */
function ymd(days = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date(Date.now() + days * DAY));
}

export type MetaSyncResult = { ok: boolean; message: string };

export async function syncMetaSpend(opts: { since?: string } = {}): Promise<MetaSyncResult> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  if (!token) {
    const message = "META_ACCESS_TOKEN n'est pas configuré sur Vercel";
    await setSyncStatus("meta", false, message);
    return { ok: false, message };
  }
  const { metaAccounts } = await getSettings();
  const until = ymd(0);
  const hasData = (await prisma.metaSpendDaily.count()) > 0;
  const since = opts.since && /^\d{4}-\d{2}-\d{2}$/.test(opts.since) ? opts.since : hasData ? ymd(-7) : FIRST_DAY;

  const done: string[] = [];
  const failed: string[] = [];
  for (const account of metaAccounts) {
    try {
      const act = `act_${account.id.replace(/^act_/, "")}`;
      const info = await graphGet<{ currency: string; name: string }>(
        `${GRAPH}/${version()}/${act}?${new URLSearchParams({ fields: "currency,name", access_token: token })}`
      );
      const [campaigns, insights] = await Promise.all([
        graphAll<{ id: string; name: string; effective_status?: string }>(`${act}/campaigns`, { fields: "id,name,effective_status", limit: "500" }, token),
        graphAll<{ campaign_id: string; campaign_name: string; spend: string; date_start: string }>(
          `${act}/insights`,
          { level: "campaign", fields: "campaign_id,campaign_name,spend", time_increment: "1", time_range: JSON.stringify({ since, until }), limit: "500" },
          token
        ),
      ]);

      const names = new Map(campaigns.map((c) => [c.id, { name: c.name, status: c.effective_status ?? null }]));
      for (const i of insights) if (!names.has(i.campaign_id)) names.set(i.campaign_id, { name: i.campaign_name, status: null });
      const accountId = act.slice(4);
      const spendRows = insights
        .map((i) => ({ campaignId: i.campaign_id, date: new Date(`${i.date_start}T00:00:00Z`), accountId, spend: new Prisma.Decimal(i.spend || "0"), currency: info.currency }))
        .filter((r) => r.spend.gt(0));

      await prisma.$transaction([
        ...[...names].map(([id, c]) =>
          prisma.metaCampaign.upsert({
            where: { id },
            create: { id, accountId, name: c.name, status: c.status, currency: info.currency },
            update: { accountId, name: c.name, currency: info.currency, ...(c.status ? { status: c.status } : {}) },
          })
        ),
        // Les jours sans dépense n'apparaissent pas dans les rapports Meta : on remplace toute la plage.
        prisma.metaSpendDaily.deleteMany({ where: { accountId, date: { gte: new Date(`${since}T00:00:00Z`), lte: new Date(`${until}T00:00:00Z`) } } }),
        prisma.metaSpendDaily.createMany({ data: spendRows }),
      ]);
      const total = spendRows.reduce((s, r) => s + Number(r.spend), 0);
      done.push(`${account.name} : ${total.toFixed(2)} ${info.currency}`);
    } catch (e) {
      failed.push(`${account.name} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const message = [`Du ${since} au ${until}`, ...done, ...failed].join(" · ");
  const ok = failed.length === 0;
  await setSyncStatus("meta", ok, message);
  return { ok, message };
}
