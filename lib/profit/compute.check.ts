// Vérification rapide : npx tsx lib/profit/compute.check.ts
import assert from "node:assert";
import { cityKey, DEFAULT_CITY_KEY } from "./city-rate";
import { computeProfit, shopifyBelowCost, splitItemTitle, type ProfitOrder, type VariantInfo } from "./compute";
import type { CostArticle } from "./cost";

const close = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ""} attendu ${b}, obtenu ${a}`);

const base = {
  localDelivery: false, localCourier: null, localStatus: null, forcelogCode: null, ozonCode: null,
  forcelogStatusCode: null, forcelogStatus: null, ozonStatus: null,
};
let n = 0;
const order = (o: Partial<ProfitOrder>): ProfitOrder =>
  ({ ...base, id: `o${++n}`, orderNumber: `#${n}`, createdAt: new Date("2026-10-10T10:00:00Z"), totalPrice: 0, parcels: [], items: [], ...o }) as ProfitOrder;
const forcelog = (status: string, cityName: string) => ({ carrier: "FORCELOG" as const, statusCode: null, status, cityName });

const variants: VariantInfo[] = [
  { id: "vMoto", productId: "pMoto", productTitle: "Moto BMW GS 1200", variantTitle: null, price: 2999, imageUrl: null, productStatus: "ACTIVE", collectionIds: ["cVehicules"] },
  { id: "vChatR", productId: "pChat", productTitle: "Chat Interactif", variantTitle: "Rose", price: 300, imageUrl: null, productStatus: "ACTIVE", collectionIds: [] },
  { id: "vChatB", productId: "pChat", productTitle: "Chat Interactif", variantTitle: "Bleu", price: 300, imageUrl: null, productStatus: "ACTIVE", collectionIds: [] },
  { id: "vUno", productId: "pUno", productTitle: "UNO", variantTitle: null, price: 39, imageUrl: null, productStatus: "ACTIVE", collectionIds: [] },
];
const articles = new Map<string, CostArticle>([
  ["MOTO", { code: "MOTO", designation: "MOTO GS", costType: "IMPORTE", prixAchat: 3499, prixGros: null }],
  ["CHAT", { code: "CHAT", designation: "CHAT", costType: "LOCAL", prixAchat: 120, prixGros: 90 }],
]);
const links = new Map<string, string | null>([["vMoto", "MOTO"], ["vChatR", "CHAT"], ["vChatB", "CHAT"]]);

const orders: ProfitOrder[] = [
  // 1. Livrée à Casablanca (18 DH) : chat rose (via variante) + UNO (sans article)
  order({ totalPrice: 400, forcelogCode: "F1", parcels: [forcelog("Livré", "Casablanca - Californie")],
    items: [{ title: "Chat Interactif (variante : Rose)", quantity: 1, price: 300, shopifyVariantId: "vChatR" }, { title: "UNO", quantity: 2, price: 50, shopifyVariantId: null }] }),
  // 2. Commande manuelle sans variante : chat retrouvé par le titre + variante, Casa chez Nizar (20 DH)
  order({ totalPrice: 300, localDelivery: true, localCourier: "nizar", localStatus: "A_LIVRER",
    items: [{ title: "Chat Interactif (variante : Bleu)", quantity: 1, price: 300, shopifyVariantId: null }] }),
  // 3. Retour Forcelog à Zagora (tarif par défaut 45) : moto
  order({ totalPrice: 2999, forcelogCode: "F3", parcels: [forcelog("Retourné", "Zagora")],
    items: [{ title: "Moto BMW GS 1200", quantity: 1, price: 2999, shopifyVariantId: "vMoto" }] }),
  // 4. Pas encore expédiée : hors calcul, mais vendue sous le coût -> alerte
  order({ totalPrice: 2999, items: [{ title: "Moto BMW GS 1200", quantity: 1, price: 2999, shopifyVariantId: "vMoto" }] }),
  // 5. Livrée par Amine (0 DH)
  order({ totalPrice: 120, localDelivery: true, localCourier: "Amine", localStatus: "LIVREE",
    items: [{ title: "Chat Interactif", quantity: 1, price: 120, shopifyVariantId: "vChatR" }] }),
];

const report = computeProfit({
  orders,
  variants,
  links,
  articles,
  history: new Map(),
  rates: {
    FORCELOG: [
      { city: "Casablanca", cityKey: cityKey("Casablanca"), fee: 18 },
      { city: "Autres villes", cityKey: DEFAULT_CITY_KEY, fee: 45 },
    ],
    OZON: [],
  },
  settings: {
    usdToMad: 10,
    damagedReturnPct: 10,
    returnFees: { FORCELOG: 0, OZON: null },
    casa: { defaultFee: 20, couriers: [{ name: "Amine", fee: 0 }] },
  },
  spend: [
    { campaignId: "c1", name: "Chat Interactif", accountId: "A", currency: "USD", amount: 10 }, // 100 MAD
    { campaignId: "c2", name: "Vehicule", accountId: "A", currency: "USD", amount: 5 }, // 50 MAD, moto pas vendue
    { campaignId: "c3", name: "Hallo", accountId: "A", currency: "USD", amount: 2 }, // 20 MAD, non associée
  ],
  campaignLinks: [
    { campaignId: "c1", targetType: "PRODUCT", targetId: "pChat", targetTitle: "Chat Interactif" },
    { campaignId: "c2", targetType: "COLLECTION", targetId: "cVehicules", targetTitle: "Véhicules" },
  ],
});

const k = report.kpi;
assert.equal(k.salesCount, 3);
assert.equal(k.returnCount, 1);
close(k.ca, 400 + 300 + 120, "CA");
close(k.cogs, 120 * 3, "achat : 3 chats LOCAL à 120");
close(k.delivery, 18 + 20 + 0, "livraison");
close(k.returnLoss, 45 + 3499 * 0.1, "retour : aller 45 + 10 % du coût (prix d'achat, gros manquant)");
close(k.ads, 170, "pub");
close(report.unattributedAds, 70, "c2 (aucune vente) + c3 (non associée)");
close(k.net, 820 - 360 - 38 - 394.9 - 170, "bénéfice net");
close(k.missingCostCa, 100, "UNO : 400 x 100/400");

const chat = report.products.find((p) => p.productId === "pChat")!;
assert.equal(chat.qtySold, 3);
close(chat.ca, 300 + 300 + 120);
close(chat.ads, 100);
assert.equal(chat.costLabel, "Local · prix d'achat");
const uno = report.products.find((p) => p.title === "UNO")!;
assert.equal(uno.missingCostQty, 2);
assert.equal(report.alerts.missingCost[0].reason, "non associé à un article ALBASEET+");

const c1 = report.campaigns.find((c) => c.id === "c1")!;
assert.ok(c1.attributed);
close(c1.margin, chat.contribution, "toute la marge du chat va à c1");
close(c1.roas!, chat.contribution / 100);
assert.deepEqual(report.alerts.unlinkedCampaigns.map((c) => c.id), ["c3"]);

// Moto vendue 2 999 pour un coût de 3 499 (commandes 3 et 4)
assert.equal(report.alerts.lossSales.length, 2);
assert.equal(report.alerts.lossSales[0].unitCost, 3499);
assert.equal(report.alerts.grosMissing.length, 0, "la moto n'est pas vendue (retour) : pas d'alerte de vente");
assert.deepEqual(shopifyBelowCost(variants, links, articles).map((b) => b.variantId), ["vMoto"]);

assert.deepEqual(splitItemTitle("Chat (variante : Rose)"), { base: "Chat", variant: "Rose" });

// Ligne reliée directement à un article ALBASEET+ (produit absent de Shopify) et commande introuvable dans le catalogue
{
  const r = computeProfit({
    orders: [
      order({ id: "oA", orderNumber: "M-A", totalPrice: 500, localDelivery: true, localCourier: "amine", localStatus: "LIVREE",
        items: [{ title: "MOTO GS", quantity: 1, price: 500, shopifyVariantId: null, albaseetCode: "MOTO" }] }),
      order({ id: "oB", orderNumber: "M-B", totalPrice: 900, localDelivery: true, localCourier: "amine", localStatus: "LIVREE",
        items: [{ title: "Quad x1, Vespa x1", quantity: 1, price: 600, shopifyVariantId: null }, { title: "Moto BMW GS 1200", quantity: 1, price: 300, shopifyVariantId: "vMoto" }] }),
      order({ id: "oC", orderNumber: "M-C", totalPrice: 100, localDelivery: true, localCourier: "amine", localStatus: "LIVREE",
        items: [{ title: "Truc inconnu", quantity: 1, price: 100, shopifyVariantId: null }] }),
    ],
    variants, links, articles, history: new Map(),
    rates: { FORCELOG: [], OZON: [] },
    settings: { returnFees: { FORCELOG: 0, OZON: null }, casa: { defaultFee: 20, couriers: [{ name: "Amine", fee: 0 }] }, damagedReturnPct: 0, usdToMad: 10.2 },
    spend: [], campaignLinks: [],
  });
  close(r.kpi.cogs, 3499 * 2, "coût de l'article ALBASEET+ direct + moto");
  const a = r.products.find((p) => p.key === "a:MOTO")!;
  assert.equal(a.title, "MOTO GS");
  assert.deepEqual(r.alerts.unlinkedOrders.map((u) => [u.orderNumber, Math.round(u.amount)]), [["M-B", 600], ["M-C", 100]], "montant décroissant");
  assert.equal(r.alerts.missingCost.find((m) => m.title === "Truc inconnu")?.reason, "produit Shopify introuvable");
}

// Campagnes « tout le site » et « frais généraux »
{
  const run = (links: { campaignId: string; targetType: string; targetId: string; targetTitle: string }[]) =>
    computeProfit({
      orders: [
        order({ totalPrice: 2999, localDelivery: true, localCourier: "amine", localStatus: "LIVREE",
          items: [{ title: "Moto BMW GS 1200", quantity: 1, price: 2999, shopifyVariantId: "vMoto" }] }),
        order({ totalPrice: 300, localDelivery: true, localCourier: "amine", localStatus: "LIVREE",
          items: [{ title: "Chat Interactif (variante : Rose)", quantity: 1, price: 300, shopifyVariantId: "vChatR" }] }),
      ],
      variants, links: new Map([["vMoto", "MOTO"], ["vChatR", "CHAT"]]), articles, history: new Map(),
      rates: { FORCELOG: [], OZON: [] },
      settings: { returnFees: { FORCELOG: 0, OZON: null }, casa: { defaultFee: 20, couriers: [{ name: "Amine", fee: 0 }] }, damagedReturnPct: 0, usdToMad: 10 },
      spend: [
        { campaignId: "cSite", name: "Site", accountId: "a", currency: "USD", amount: 33 },
        { campaignId: "cOver", name: "Magasin", accountId: "a", currency: "USD", amount: 10 },
      ],
      campaignLinks: links,
    });
  const r = run([
    { campaignId: "cSite", targetType: "SITE", targetId: "*", targetTitle: "Tout le site" },
    { campaignId: "cOver", targetType: "OVERHEAD", targetId: "*", targetTitle: "Frais généraux" },
  ]);
  const site = r.campaigns.find((c) => c.id === "cSite")!;
  const over = r.campaigns.find((c) => c.id === "cOver")!;
  // Marge de toutes les ventes : (2999 - 3499) + (300 - 120) = -320
  assert.equal(site.scope, "SITE");
  close(site.margin, -320, "marge tout le site");
  close(site.roas!, -320 / 330, "ROAS tout le site");
  close(r.products.find((p) => p.key === "pMoto")!.ads, (330 * 2999) / 3299, "pub répartie au prorata du CA");
  assert.equal(over.scope, "OVERHEAD");
  assert.equal(over.roas, null);
  close(r.overheadAds, 100, "frais généraux");
  close(r.unattributedAds, 0, "frais généraux séparés de la pub non attribuée");
  close(r.kpi.ads, 430);
  close(r.kpi.net, 3299 - 3619 - 430, "frais généraux déduits du bénéfice");
  assert.ok(!r.alerts.unlinkedCampaigns.some((c) => c.id === "cOver"), "pas d'alerte « sans produit »");
  // Mélange (ne devrait pas arriver) : frais généraux l'emportent
  const mixed = run([
    { campaignId: "cSite", targetType: "SITE", targetId: "*", targetTitle: "Tout le site" },
    { campaignId: "cSite", targetType: "OVERHEAD", targetId: "*", targetTitle: "Frais généraux" },
  ]);
  assert.equal(mixed.campaigns.find((c) => c.id === "cSite")!.scope, "OVERHEAD");
}
console.log("compute checks OK");
