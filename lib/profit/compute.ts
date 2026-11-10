// Calcul de la rentabilité d'une période, à partir des données déjà chargées
// (lib/profit/report.ts). Module pur, testé par compute.check.ts.
//
// Règles (validées) :
// - CA : même règle que l'Accueil (lib/revenue.ts) — commandes confirmées de la
//   période, livrées + en cours. Les non expédiées sont ignorées.
// - Coût d'achat : article ALBASEET+ relié à la variante, coût selon son type au
//   prix en vigueur à la date de la commande (lib/profit/cost.ts).
// - Livraison : tarif du transporteur selon la ville (ShippingRate) ; livreur Casa
//   selon son tarif (réglages). Payé pour les commandes livrées ET en cours.
// - Retour : le colis paie l'aller + les frais de retour, plus « % de retours
//   abîmés » du coût d'achat des produits retournés.
// - Pub Meta : dépense de la période convertie en MAD, répartie entre les
//   produits associés à la campagne selon leur CA ; sinon « pub non attribuée ».
// - Les coûts d'une commande (CA, livraison, retour) sont répartis entre ses
//   articles au prorata de leur montant.

import { revenueState, type RevenueOrder } from "@/lib/revenue";
import { findRate, type RateRow } from "./city-rate";
import { pricesAt, resolveCost, type CostArticle, type CostFlag, type CostResult, type PricePoint } from "./cost";
import type { ProfitSettings } from "./settings";
import { textKey } from "./text";

type Parcel = RevenueOrder["parcels"][number] & { cityName: string | null };
export type ProfitOrder = Omit<RevenueOrder, "parcels"> & {
  id: string;
  orderNumber: string;
  createdAt: Date;
  parcels: Parcel[]; // le plus récent en premier
  // albaseetCode : article ALBASEET+ choisi directement (produit absent de Shopify)
  items: { title: string; quantity: number; price: unknown; shopifyVariantId: string | null; albaseetCode?: string | null }[];
};

export type VariantInfo = {
  id: string;
  productId: string;
  productTitle: string;
  variantTitle: string | null;
  price: number;
  imageUrl: string | null;
  productStatus: string;
  collectionIds: string[];
};

export type CampaignSpend = { campaignId: string; name: string; accountId: string; currency: string; amount: number };
export type CampaignTarget = { campaignId: string; targetType: string; targetId: string; targetTitle: string };

export type ProfitInput = {
  orders: ProfitOrder[];
  variants: VariantInfo[];
  links: Map<string, string | null>; // variantId -> code ALBASEET+ (null = « aucun article » choisi à la main)
  articles: Map<string, CostArticle>;
  history: Map<string, PricePoint[]>;
  rates: Record<"FORCELOG" | "OZON", RateRow[]>;
  settings: Pick<ProfitSettings, "returnFees" | "casa" | "damagedReturnPct" | "usdToMad">;
  spend: CampaignSpend[]; // total de la période par campagne
  campaignLinks: CampaignTarget[];
};

export type ProductRow = {
  key: string;
  productId: string | null;
  title: string;
  imageUrl: string | null;
  qtySold: number;
  qtyReturned: number;
  ca: number;
  cogs: number;
  missingCostQty: number; // quantités vendues sans coût connu (comptées à 0)
  unitCost: number | null; // coût unitaire de la dernière vente
  costLabel: string | null; // type et source du coût retenu
  costFlag: CostFlag | null;
  delivery: number;
  returnLoss: number;
  ads: number;
  contribution: number; // CA - achat - livraison - retours (avant pub)
  net: number;
  marginPct: number | null;
};

export type CampaignRow = {
  id: string;
  name: string;
  accountId: string;
  currency: string;
  spend: number; // devise du compte
  spendMad: number;
  linkedCount: number;
  attributed: boolean;
  unattributedReason: string | null;
  margin: number; // marge (avant pub) des produits associés, au prorata de la dépense
  net: number;
  roas: number | null; // marge ÷ dépense (rentable à partir de 1)
};

export type LossSale = { title: string; orderNumber: string; paid: number; unitCost: number; costLabel: string; quantity: number };
export type MissingCost = { key: string; title: string; quantity: number; ca: number; reason: string };
/** Commande dont au moins une ligne ne correspond à aucun produit du catalogue (à corriger sur la fiche commande). */
export type UnlinkedOrder = { orderId: string; orderNumber: string; createdAt: Date; amount: number; titles: string[] };
export type ArticleAlert = { code: string; designation: string; quantity: number };

export type ProfitReport = {
  kpi: {
    ca: number;
    cogs: number;
    grossMargin: number;
    ads: number;
    delivery: number;
    returnLoss: number;
    net: number;
    marginPct: number | null;
    salesCount: number;
    returnCount: number;
    missingCostCa: number;
  };
  products: ProductRow[];
  campaigns: CampaignRow[];
  unattributedAds: number;
  alerts: {
    lossSales: LossSale[];
    missingCost: MissingCost[];
    unlinkedOrders: UnlinkedOrder[]; // montant décroissant
    toClassify: ArticleAlert[];
    grosMissing: ArticleAlert[];
    unprofitableCampaigns: CampaignRow[];
    unlinkedCampaigns: CampaignRow[];
    missingRates: { carrier: "FORCELOG" | "OZON"; orders: number }[];
  };
};

const num = (v: unknown): number => {
  const n = Number(v === null || v === undefined || v === "" ? 0 : String(v));
  return Number.isFinite(n) ? n : 0;
};

/** "Produit (variante : Bleu)" -> { base: "Produit", variant: "Bleu" } (format du webhook Shopify). */
export function splitItemTitle(title: string): { base: string; variant: string | null } {
  const m = title.match(/^(.*?)\s*\(variante\s*:\s*(.+)\)\s*$/i);
  return m ? { base: m[1], variant: m[2] } : { base: title, variant: null };
}

export function computeProfit(input: ProfitInput): ProfitReport {
  const { settings } = input;
  const variantById = new Map(input.variants.map((v) => [v.id, v]));
  const byTitle = new Map<string, VariantInfo[]>();
  for (const v of input.variants) {
    const k = textKey(v.productTitle);
    const list = byTitle.get(k);
    if (list) list.push(v);
    else byTitle.set(k, [v]);
  }
  const casaFees = settings.casa.couriers.map((c) => ({ key: textKey(c.name), fee: c.fee }));
  const casaFee = (name: string | null) => casaFees.find((c) => c.key === textKey(name ?? ""))?.fee ?? settings.casa.defaultFee;

  // Variante d'un article de commande : celle enregistrée, sinon retrouvée par le titre.
  const resolveVariant = (it: ProfitOrder["items"][number]): string | null => {
    if (it.shopifyVariantId && (variantById.has(it.shopifyVariantId) || input.links.has(it.shopifyVariantId))) return it.shopifyVariantId;
    const { base, variant } = splitItemTitle(it.title);
    const list = byTitle.get(textKey(base));
    if (!list?.length) return it.shopifyVariantId;
    if (variant) {
      const m = list.find((v) => v.variantTitle && textKey(v.variantTitle) === textKey(variant));
      if (m) return m.id;
    }
    if (list.length === 1) return list[0].id;
    return (list.find((v) => input.links.get(v.id)) ?? list[0]).id;
  };

  const deliveryOf = (o: ProfitOrder): { carrier: "FORCELOG" | "OZON" | "CASA" | null; fee: number | null } => {
    if (o.localDelivery) return { carrier: "CASA", fee: casaFee(o.localCourier) };
    const last = o.parcels[0];
    const carrier = last?.carrier ?? (o.forcelogCode ? "FORCELOG" : o.ozonCode ? "OZON" : null);
    if (!carrier) return { carrier: null, fee: 0 };
    const rates = input.rates[carrier];
    if (!rates.length) return { carrier, fee: null };
    return { carrier, fee: findRate(last?.cityName ?? null, rates).fee };
  };

  type Acc = ProductRow & { lastSaleAt: number; adsByCampaign: Map<string, number> };
  const products = new Map<string, Acc>();
  const product = (key: string, title: string, v: VariantInfo | undefined): Acc => {
    let p = products.get(key);
    if (!p) {
      p = {
        key, productId: v?.productId ?? null, title, imageUrl: v?.imageUrl ?? null,
        qtySold: 0, qtyReturned: 0, ca: 0, cogs: 0, missingCostQty: 0, unitCost: null, costLabel: null, costFlag: null,
        delivery: 0, returnLoss: 0, ads: 0, contribution: 0, net: 0, marginPct: null, lastSaleAt: 0, adsByCampaign: new Map(),
      };
      products.set(key, p);
    }
    if (!p.imageUrl && v?.imageUrl) p.imageUrl = v.imageUrl;
    return p;
  };

  const kpi = { ca: 0, cogs: 0, grossMargin: 0, ads: 0, delivery: 0, returnLoss: 0, net: 0, marginPct: null as number | null, salesCount: 0, returnCount: 0, missingCostCa: 0 };
  const lossSales: LossSale[] = [];
  const missingCost = new Map<string, MissingCost>();
  const unlinkedOrders: UnlinkedOrder[] = [];
  const toClassify = new Map<string, ArticleAlert>();
  const grosMissing = new Map<string, ArticleAlert>();
  const missingRates = { FORCELOG: 0, OZON: 0 };
  const damaged = Math.max(0, Math.min(100, settings.damagedReturnPct)) / 100;

  for (const o of input.orders) {
    const state = revenueState(o);
    const sold = state === "livree" || state === "en_cours";
    const returned = state === "retour";
    const lines = o.items.map((it) => {
      const direct = it.albaseetCode ? input.articles.get(it.albaseetCode) : undefined;
      if (direct) {
        // Article ALBASEET+ choisi directement : pas de variante Shopify.
        const cost = resolveCost(direct.costType, pricesAt(input.history.get(direct.code), direct, o.createdAt));
        const unit = num(it.price);
        return { it, v: undefined, variantId: null, title: direct.designation, key: `a:${direct.code}`, article: direct as CostArticle | undefined, cost: cost as CostResult | null, unit, value: unit * it.quantity };
      }
      const variantId = resolveVariant(it);
      const v = variantId ? variantById.get(variantId) : undefined;
      const title = v ? v.productTitle : splitItemTitle(it.title).base;
      const code = variantId ? input.links.get(variantId) ?? null : null;
      const article = code ? input.articles.get(code) : undefined;
      const cost: CostResult | null = article ? resolveCost(article.costType, pricesAt(input.history.get(article.code), article, o.createdAt)) : null;
      const unit = num(it.price);
      return { it, v, variantId, title, key: v ? v.productId : `t:${textKey(title)}`, article, cost, unit, value: unit * it.quantity };
    });

    // Vendu sous le prix d'achat : prix réellement payé, pour toute commande confirmée.
    for (const l of lines) {
      if (l.cost?.unitCost != null && l.unit > 0 && l.unit < l.cost.unitCost - 0.005) {
        lossSales.push({ title: l.title, orderNumber: o.orderNumber, paid: l.unit, unitCost: l.cost.unitCost, costLabel: l.cost.label, quantity: l.it.quantity });
      }
    }
    if (!sold && !returned) continue; // pas encore expédiée : hors calcul

    const total = lines.reduce((s, l) => s + l.value, 0);
    const delivery = deliveryOf(o);
    if (delivery.fee === null && (delivery.carrier === "FORCELOG" || delivery.carrier === "OZON")) missingRates[delivery.carrier]++;
    const fee = delivery.fee ?? 0;
    const returnFee = delivery.carrier === "FORCELOG" || delivery.carrier === "OZON" ? settings.returnFees[delivery.carrier] ?? 0 : 0;
    const orderCa = num(o.totalPrice);
    if (sold) kpi.salesCount++;
    else kpi.returnCount++;

    const orphans = lines.filter((l) => !l.v && !l.article);
    if (orphans.length) {
      const amount = orphans.reduce((s, l) => s + orderCa * (total > 0 ? l.value / total : 1 / lines.length), 0);
      unlinkedOrders.push({ orderId: o.id, orderNumber: o.orderNumber, createdAt: o.createdAt, amount, titles: orphans.map((l) => l.it.title) });
    }

    lines.forEach((l) => {
      const share = total > 0 ? l.value / total : 1 / lines.length;
      const p = product(l.key, l.title, l.v);
      const qty = l.it.quantity;
      if (sold) {
        const ca = orderCa * share;
        p.qtySold += qty;
        p.ca += ca;
        kpi.ca += ca;
        p.delivery += fee * share;
        kpi.delivery += fee * share;
        if (l.cost?.unitCost != null) {
          p.cogs += l.cost.unitCost * qty;
          kpi.cogs += l.cost.unitCost * qty;
        } else {
          p.missingCostQty += qty;
          kpi.missingCostCa += ca;
          const reason = !l.v && !l.article ? "produit Shopify introuvable" : !l.article ? "non associé à un article ALBASEET+" : "article sans prix d'achat";
          const m = missingCost.get(l.key) ?? { key: l.key, title: l.title, quantity: 0, ca: 0, reason };
          m.quantity += qty;
          m.ca += ca;
          missingCost.set(l.key, m);
        }
        if (l.article && l.cost?.flag === "A_CLASSER") addArticle(toClassify, l.article, qty);
        if (l.article && l.cost?.flag === "GROS_MANQUANT") addArticle(grosMissing, l.article, qty);
        if (o.createdAt.getTime() >= p.lastSaleAt && l.cost) {
          p.lastSaleAt = o.createdAt.getTime();
          p.unitCost = l.cost.unitCost;
          p.costLabel = l.cost.label;
          p.costFlag = l.cost.flag;
        }
      } else {
        const loss = (fee + returnFee) * share + (l.cost?.unitCost ?? 0) * qty * damaged;
        p.qtyReturned += qty;
        p.returnLoss += loss;
        kpi.returnLoss += loss;
      }
    });
  }

  // ── Pub Meta ──
  const productsByCollection = new Map<string, Set<string>>();
  for (const v of input.variants) {
    for (const c of v.collectionIds) {
      const set = productsByCollection.get(c) ?? new Set<string>();
      set.add(v.productId);
      productsByCollection.set(c, set);
    }
  }
  const targetsByCampaign = new Map<string, CampaignTarget[]>();
  for (const l of input.campaignLinks) targetsByCampaign.set(l.campaignId, [...(targetsByCampaign.get(l.campaignId) ?? []), l]);

  const campaigns: CampaignRow[] = [];
  let unattributedAds = 0;
  for (const s of input.spend) {
    if (s.amount <= 0) continue;
    const spendMad = s.amount * (s.currency === "MAD" ? 1 : settings.usdToMad);
    kpi.ads += spendMad;
    const targets = targetsByCampaign.get(s.campaignId) ?? [];
    const productIds = new Set<string>();
    for (const t of targets) {
      if (t.targetType === "COLLECTION") for (const id of productsByCollection.get(t.targetId) ?? []) productIds.add(id);
      else productIds.add(t.targetId);
    }
    const selling = [...productIds].map((id) => products.get(id)).filter((p): p is Acc => !!p && p.ca > 0);
    const row: CampaignRow = {
      id: s.campaignId, name: s.name, accountId: s.accountId, currency: s.currency, spend: s.amount, spendMad,
      linkedCount: targets.length, attributed: selling.length > 0, unattributedReason: null, margin: 0, net: 0, roas: null,
    };
    if (!targets.length) row.unattributedReason = "campagne non associée";
    else if (!selling.length) row.unattributedReason = "aucune vente des produits associés";
    if (!row.attributed) unattributedAds += spendMad;
    else {
      const totalCa = selling.reduce((sum, p) => sum + p.ca, 0);
      for (const p of selling) {
        const part = (spendMad * p.ca) / totalCa;
        p.ads += part;
        p.adsByCampaign.set(s.campaignId, (p.adsByCampaign.get(s.campaignId) ?? 0) + part);
      }
    }
    campaigns.push(row);
  }

  const rows = [...products.values()];
  for (const p of rows) {
    p.contribution = p.ca - p.cogs - p.delivery - p.returnLoss;
    p.net = p.contribution - p.ads;
    p.marginPct = p.ca > 0 ? p.net / p.ca : null;
  }
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  for (const p of rows) {
    if (p.ads <= 0) continue;
    for (const [cid, part] of p.adsByCampaign) {
      const c = byId.get(cid);
      if (c) c.margin += (p.contribution * part) / p.ads;
    }
  }
  for (const c of campaigns) {
    c.net = c.margin - c.spendMad;
    c.roas = c.attributed && c.spendMad > 0 ? c.margin / c.spendMad : null;
  }

  kpi.grossMargin = kpi.ca - kpi.cogs;
  kpi.net = kpi.grossMargin - kpi.ads - kpi.delivery - kpi.returnLoss;
  kpi.marginPct = kpi.ca > 0 ? kpi.net / kpi.ca : null;

  return {
    kpi,
    products: rows
      .map(({ lastSaleAt: _l, adsByCampaign: _a, ...p }) => p)
      .sort((a, b) => b.ca - a.ca || b.returnLoss - a.returnLoss),
    campaigns: campaigns.sort((a, b) => b.spendMad - a.spendMad),
    unattributedAds,
    alerts: {
      lossSales: lossSales.sort((a, b) => b.unitCost - b.paid - (a.unitCost - a.paid)),
      missingCost: [...missingCost.values()].sort((a, b) => b.ca - a.ca),
      unlinkedOrders: unlinkedOrders.sort((a, b) => b.amount - a.amount),
      toClassify: [...toClassify.values()].sort((a, b) => b.quantity - a.quantity),
      grosMissing: [...grosMissing.values()].sort((a, b) => b.quantity - a.quantity),
      unprofitableCampaigns: campaigns.filter((c) => c.roas !== null && c.roas < 1),
      unlinkedCampaigns: campaigns.filter((c) => c.linkedCount === 0),
      missingRates: (["FORCELOG", "OZON"] as const).filter((c) => missingRates[c] > 0).map((carrier) => ({ carrier, orders: missingRates[carrier] })),
    },
  };
}

function addArticle(map: Map<string, ArticleAlert>, a: CostArticle, qty: number) {
  const cur = map.get(a.code) ?? { code: a.code, designation: a.designation, quantity: 0 };
  cur.quantity += qty;
  map.set(a.code, cur);
}

export type BelowCost = { variantId: string; title: string; price: number; unitCost: number; costLabel: string };

/** Variantes Shopify actives dont le prix de vente est sous le coût d'achat actuel. */
export function shopifyBelowCost(variants: VariantInfo[], links: Map<string, string | null>, articles: Map<string, CostArticle>): BelowCost[] {
  const out: BelowCost[] = [];
  for (const v of variants) {
    if (v.productStatus !== "ACTIVE") continue;
    const code = links.get(v.id);
    const a = code ? articles.get(code) : undefined;
    if (!a) continue;
    const cost = resolveCost(a.costType, a);
    if (cost.unitCost != null && v.price > 0 && v.price < cost.unitCost - 0.005) {
      out.push({ variantId: v.id, title: v.variantTitle ? `${v.productTitle} — ${v.variantTitle}` : v.productTitle, price: v.price, unitCost: cost.unitCost, costLabel: cost.label });
    }
  }
  return out.sort((a, b) => b.unitCost - b.price - (a.unitCost - a.price));
}
