// Ventes sans coût d'achat sur une période, regroupées, avec les articles
// ALBASEET+ les plus probables (écran /rentabilite/a-relier). Lecture seule.
// Mêmes règles que la page Rentabilité (lineResolver), donc ce qui est listé ici
// est exactement ce qui manque dans « Coût d'achat des ventes ».

import { prisma } from "@/lib/db";
import { lineResolver } from "./compute";
import { costTypeOf, resolveCost } from "./cost";
import { loadCatalog, loadHistory } from "./report";
import { buildSuggester, looksMultiProduct, type Suggestion } from "./suggest";
import { textKey } from "./text";

export type ToLinkOrder = { id: string; orderNumber: string };
export type ToLinkGroup = {
  key: string;
  /** VARIANT : produit Shopify sans article ALBASEET+ (le lien vaut pour toutes ses ventes).
   *  LINES   : lignes tapées à la main, sans produit du catalogue (reliées une par une, en lot).
   *  MULTI   : ligne avec plusieurs produits, à découper sur la fiche commande.
   *  NO_PRICE: article ALBASEET+ trouvé mais sans prix (à corriger dans ALBASEET+). */
  kind: "VARIANT" | "LINES" | "MULTI" | "NO_PRICE";
  title: string;
  variantId: string | null;
  itemIds: string[];
  quantity: number;
  amount: number;
  orders: ToLinkOrder[];
  suggestions: Suggestion[];
  articleCode: string | null;
};

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(String(v)));

export async function loadToLink(range: { start: Date; end: Date }): Promise<ToLinkGroup[]> {
  const [catalog, orders, articles] = await Promise.all([
    loadCatalog(),
    prisma.order.findMany({
      where: { status: "CONFIRMEE", createdAt: { gte: range.start, lt: range.end } },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        items: { select: { id: true, title: true, quantity: true, price: true, shopifyVariantId: true, albaseetCode: true } },
      },
    }),
    prisma.albaseetArticle.findMany({ select: { code: true, designation: true, fournisseur: true, costType: true, prixAchat: true, prixGros: true } }),
  ]);
  const history = await loadHistory(catalog, orders);
  const resolve = lineResolver({ ...catalog, history });

  // Candidats : articles qui ont un coût, au prix actuel, avec la règle du fournisseur.
  const candidates = articles.flatMap((a) => {
    const c = resolveCost(costTypeOf(a), { prixAchat: n(a.prixAchat), prixGros: n(a.prixGros) });
    return c.unitCost === null ? [] : [{ code: a.code, designation: a.designation, unitCost: c.unitCost, costLabel: c.label }];
  });
  const variants = catalog.variants.flatMap((v) => {
    const code = catalog.links.get(v.id);
    return code ? [{ id: v.id, code, name: v.variantTitle ? `${v.productTitle} ${v.variantTitle}` : v.productTitle }] : [];
  });
  const suggest = buildSuggester(candidates, variants);

  const groups = new Map<string, ToLinkGroup>();
  for (const o of orders) {
    const lines = resolve({ createdAt: o.createdAt, items: o.items.map((i) => ({ ...i, price: Number(i.price) })) });
    lines.forEach((l, idx) => {
      if (l.cost?.unitCost != null) return;
      const item = o.items[idx];
      const amount = Number(item.price) * item.quantity;
      let key: string;
      let base: Omit<ToLinkGroup, "itemIds" | "quantity" | "amount" | "orders" | "suggestions">;
      if (l.article) {
        key = `p:${l.article.code}`;
        base = { key, kind: "NO_PRICE", title: l.article.designation, variantId: null, articleCode: l.article.code };
      } else if (l.v && l.variantId) {
        const name = l.v.variantTitle ? `${l.v.productTitle} ${l.v.variantTitle}` : l.v.productTitle;
        key = `v:${l.variantId}`;
        base = { key, kind: "VARIANT", title: name, variantId: l.variantId, articleCode: null };
      } else {
        const multi = looksMultiProduct(item.title);
        key = multi ? `m:${item.id}` : `t:${textKey(item.title)}`;
        base = { key, kind: multi ? "MULTI" : "LINES", title: item.title, variantId: null, articleCode: null };
      }
      const g = groups.get(key) ?? { ...base, itemIds: [], quantity: 0, amount: 0, orders: [], suggestions: [] };
      g.itemIds.push(item.id);
      g.quantity += item.quantity;
      g.amount += amount;
      if (!g.orders.some((x) => x.id === o.id)) g.orders.push({ id: o.id, orderNumber: o.orderNumber });
      groups.set(key, g);
    });
  }

  const out = [...groups.values()].sort((a, b) => b.amount - a.amount);
  for (const g of out) if (g.kind === "VARIANT" || g.kind === "LINES") g.suggestions = suggest(g.title);
  return out;
}
