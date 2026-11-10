// Chargement des données de la page Rentabilité pour une période, puis calcul
// (lib/profit/compute.ts). Quelques requêtes en parallèle, aucune écriture.

import { prisma } from "@/lib/db";
import type { RateRow } from "./city-rate";
import { computeProfit, shopifyBelowCost, type BelowCost, type CampaignSpend, type ProfitReport, type VariantInfo } from "./compute";
import type { CostArticle, PricePoint } from "./cost";
import { getSettings, getSyncStatus, type ProfitSettings, type SyncName, type SyncStatus } from "./settings";

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(String(v)));
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(d);

export type CatalogData = {
  variants: VariantInfo[];
  links: Map<string, string | null>;
  articles: Map<string, CostArticle>;
};

/** Catalogue Shopify, liens et articles ALBASEET+ (partagé avec les autres écrans). */
export async function loadCatalog(): Promise<CatalogData> {
  const [variants, links, articles] = await Promise.all([
    prisma.shopifyVariant.findMany(),
    prisma.articleLink.findMany({ select: { variantId: true, albaseetCode: true } }),
    prisma.albaseetArticle.findMany({ select: { code: true, designation: true, costType: true, prixAchat: true, prixGros: true } }),
  ]);
  return {
    variants: variants.map((v) => ({ ...v, price: Number(v.price) })),
    links: new Map(links.map((l) => [l.variantId, l.albaseetCode])),
    articles: new Map(articles.map((a) => [a.code, { ...a, prixAchat: n(a.prixAchat), prixGros: n(a.prixGros) }])),
  };
}

export async function loadRates(): Promise<Record<"FORCELOG" | "OZON", RateRow[]>> {
  const rows = await prisma.shippingRate.findMany();
  const pick = (c: "FORCELOG" | "OZON") => rows.filter((r) => r.carrier === c).map((r) => ({ city: r.city, cityKey: r.cityKey, fee: Number(r.fee) }));
  return { FORCELOG: pick("FORCELOG"), OZON: pick("OZON") };
}

export type PageReport = {
  report: ProfitReport;
  belowCost: BelowCost[];
  settings: ProfitSettings;
  status: Partial<Record<SyncName, SyncStatus>>;
  counts: { articles: number; linkedVariants: number; variants: number; ozonRates: number };
};

export async function loadProfitReport(range: { start: Date; end: Date }): Promise<PageReport> {
  const [orders, catalog, rates, settings, status, spendRows, campaignLinks, articleCount] = await Promise.all([
    prisma.order.findMany({
      where: { status: "CONFIRMEE", createdAt: { gte: range.start, lt: range.end } },
      select: {
        id: true, orderNumber: true, createdAt: true, totalPrice: true,
        localDelivery: true, localCourier: true, localStatus: true,
        forcelogCode: true, ozonCode: true, forcelogStatusCode: true, forcelogStatus: true, ozonStatus: true,
        parcels: { select: { carrier: true, statusCode: true, status: true, cityName: true }, orderBy: { carrierCreatedAt: { sort: "desc", nulls: "last" } }, take: 1 },
        items: { select: { title: true, quantity: true, price: true, shopifyVariantId: true, albaseetCode: true } },
      },
    }),
    loadCatalog(),
    loadRates(),
    getSettings(),
    getSyncStatus(),
    // Dates Meta = jours calendaires : du premier au dernier jour de la période.
    prisma.metaSpendDaily.groupBy({
      by: ["campaignId", "currency"],
      where: { date: { gte: new Date(`${ymd(range.start)}T00:00:00Z`), lte: new Date(`${ymd(new Date(range.end.getTime() - 1))}T00:00:00Z`) } },
      _sum: { spend: true },
    }),
    prisma.campaignLink.findMany(),
    prisma.albaseetArticle.count(),
  ]);

  const campaigns = new Map(
    (await prisma.metaCampaign.findMany({ where: { id: { in: spendRows.map((s) => s.campaignId) } } })).map((c) => [c.id, c])
  );
  const spend: CampaignSpend[] = spendRows.map((s) => ({
    campaignId: s.campaignId,
    name: campaigns.get(s.campaignId)?.name ?? s.campaignId,
    accountId: campaigns.get(s.campaignId)?.accountId ?? "",
    currency: s.currency,
    amount: Number(s._sum.spend ?? 0),
  }));

  // Historique des prix des articles reliés à Shopify (une ligne par changement de prix).
  const linkedCodes = [...new Set([...catalog.links.values()].filter((c): c is string => !!c))];
  const historyRows = linkedCodes.length
    ? await prisma.albaseetPriceHistory.findMany({
        where: { code: { in: linkedCodes } },
        select: { code: true, effectiveAt: true, prixAchat: true, prixGros: true },
        orderBy: { effectiveAt: "asc" },
      })
    : [];
  const history = new Map<string, PricePoint[]>();
  for (const h of historyRows) {
    history.set(h.code, [...(history.get(h.code) ?? []), { effectiveAt: h.effectiveAt, prixAchat: n(h.prixAchat), prixGros: n(h.prixGros) }]);
  }

  const report = computeProfit({ orders, ...catalog, history, rates, settings, spend, campaignLinks });
  return {
    report,
    belowCost: shopifyBelowCost(catalog.variants, catalog.links, catalog.articles),
    settings,
    status,
    counts: {
      articles: articleCount,
      linkedVariants: [...catalog.links.values()].filter(Boolean).length,
      variants: catalog.variants.length,
      ozonRates: rates.OZON.length,
    },
  };
}
