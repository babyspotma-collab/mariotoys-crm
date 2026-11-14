"use server";

import { revalidatePath } from "next/cache";
import type { CostType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { articleFilter, COST_TYPES, NO_SUPPLIER } from "@/lib/profit/article-filter";
import { cityKey, DEFAULT_CITY_KEY } from "@/lib/profit/city-rate";
import { costTypeOf, resolveCost } from "@/lib/profit/cost";
import { OVERHEAD_TARGET, SITE_TARGET } from "@/lib/profit/compute";
import { syncMetaSpend } from "@/lib/profit/meta";
import { saveSetting, type CasaRates, type MetaAccount } from "@/lib/profit/settings";
import { syncCatalog } from "@/lib/profit/shopify-catalog";
import { relinkOrderItem } from "@/app/orders/[id]/actions";
import { requireSession } from "@/lib/session";

const PAGES = ["/rentabilite", "/rentabilite/a-relier", "/rentabilite/articles", "/rentabilite/classement", "/rentabilite/campagnes", "/rentabilite/reglages"];
const refresh = () => PAGES.forEach((p) => revalidatePath(p));

const amount = (v: unknown, max = 1_000_000): number | null => {
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return String(v ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};
const clean = (v: unknown, max = 120) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const rowsOf = (formData: FormData): Record<string, string>[] => {
  try {
    const rows = JSON.parse(String(formData.get("rows") ?? "[]"));
    return Array.isArray(rows) ? rows.slice(0, 2000) : [];
  } catch {
    return [];
  }
};

export type ActionResult = { ok: boolean; message: string } | null;

// ── Actualiser (catalogue Shopify + dépenses Meta) ──────────────────────────
export async function refreshNow(_prev: ActionResult): Promise<ActionResult> {
  await requireSession();
  const parts: string[] = [];
  let ok = true;
  try {
    const c = await syncCatalog(25_000);
    parts.push(c.status === "done" ? `Catalogue : ${c.variants} variantes` : "Catalogue en préparation chez Shopify, réessayez dans une minute");
  } catch (e) {
    ok = false;
    parts.push(`Catalogue : ${e instanceof Error ? e.message : e}`);
  }
  const m = await syncMetaSpend();
  ok &&= m.ok;
  parts.push(m.ok ? "Dépenses Meta à jour" : m.message);
  refresh();
  return { ok, message: parts.join(" · ") };
}

// ── Réglages ────────────────────────────────────────────────────────────────
export async function saveGeneral(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const rate = amount(formData.get("usdToMad"), 100);
  const pct = amount(formData.get("damagedReturnPct"), 100);
  if (!rate || rate <= 0) return { ok: false, message: "Taux USD→MAD invalide." };
  if (pct === null) return { ok: false, message: "% de retours abîmés invalide (0 à 100)." };
  await saveSetting("usdToMad", rate);
  await saveSetting("damagedReturnPct", pct);
  refresh();
  return { ok: true, message: "Réglages enregistrés." };
}

export async function saveReturnFees(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const f = (k: string) => (String(formData.get(k) ?? "").trim() === "" ? null : amount(formData.get(k)));
  await saveSetting("returnFees", { FORCELOG: f("FORCELOG") ?? 0, OZON: f("OZON") });
  refresh();
  return { ok: true, message: "Frais de retour enregistrés." };
}

export async function saveMetaAccounts(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const accounts: MetaAccount[] = [];
  for (const r of rowsOf(formData)) {
    const id = clean(r.id, 40).replace(/^act_/, "");
    if (!id) continue;
    if (!/^\d{5,25}$/.test(id)) return { ok: false, message: `Identifiant de compte invalide : ${id}` };
    if (!accounts.some((a) => a.id === id)) accounts.push({ id, name: clean(r.name, 60) || id });
  }
  await saveSetting("metaAccounts", accounts);
  refresh();
  return { ok: true, message: `${accounts.length} compte(s) publicitaire(s) enregistré(s).` };
}

export async function saveCasa(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const defaultFee = amount(formData.get("defaultFee"));
  if (defaultFee === null) return { ok: false, message: "Tarif par défaut invalide." };
  const couriers: CasaRates["couriers"] = [];
  for (const r of rowsOf(formData)) {
    const name = clean(r.name, 40);
    if (!name) continue;
    const fee = amount(r.fee);
    if (fee === null) return { ok: false, message: `Tarif invalide pour ${name}.` };
    couriers.push({ name, fee });
  }
  await saveSetting("casa", { defaultFee, couriers });
  refresh();
  return { ok: true, message: "Tarifs des livreurs enregistrés." };
}

export async function saveRates(carrier: "FORCELOG" | "OZON", _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const rows = new Map<string, { carrier: "FORCELOG" | "OZON"; city: string; cityKey: string; fee: number }>();
  for (const r of rowsOf(formData)) {
    const city = clean(r.city);
    if (!city) continue;
    const fee = amount(r.fee);
    if (fee === null) return { ok: false, message: `Tarif invalide pour ${city}.` };
    const key = cityKey(city);
    if (key && !rows.has(key)) rows.set(key, { carrier, city, cityKey: key, fee });
  }
  const def = String(formData.get("defaultFee") ?? "").trim();
  if (def !== "") {
    const fee = amount(def);
    if (fee === null) return { ok: false, message: "Tarif par défaut invalide." };
    rows.set(DEFAULT_CITY_KEY, { carrier, city: "Autres villes (tarif par défaut)", cityKey: DEFAULT_CITY_KEY, fee });
  }
  await prisma.$transaction([prisma.shippingRate.deleteMany({ where: { carrier } }), prisma.shippingRate.createMany({ data: [...rows.values()] })]);
  refresh();
  return { ok: true, message: `${rows.size} tarif(s) enregistré(s).` };
}

// ── Associations variante Shopify -> article ALBASEET+ ─────────────────────
export type ArticleHit = { code: string; designation: string; barcode: string | null; fournisseur: string | null; costLabel: string; unitCost: number | null };

export async function searchArticles(q: string): Promise<ArticleHit[]> {
  await requireSession();
  const words = clean(q, 80).split(" ").filter(Boolean).slice(0, 5);
  if (!words.length) return [];
  const rows = await prisma.albaseetArticle.findMany({
    where: {
      OR: [
        { code: { equals: words.join(" "), mode: "insensitive" } },
        { barcode: { equals: words.join("") } },
        { AND: words.map((w) => ({ OR: [{ designation: { contains: w, mode: "insensitive" as const } }, { code: { contains: w, mode: "insensitive" as const } }] })) },
      ],
    },
    take: 12,
    orderBy: { designation: "asc" },
  });
  return rows.map((a) => {
    const c = resolveCost(costTypeOf(a), { prixAchat: a.prixAchat === null ? null : Number(a.prixAchat), prixGros: a.prixGros === null ? null : Number(a.prixGros) });
    return { code: a.code, designation: a.designation, barcode: a.barcode, fournisseur: a.fournisseur, costLabel: c.label, unitCost: c.unitCost };
  });
}

/** Lien choisi à la main (code null = « aucun article »). Jamais modifié par l'automatique. */
export async function setManualLink(variantId: string, code: string | null): Promise<void> {
  await requireSession();
  const id = clean(variantId, 100);
  if (!id.startsWith("gid://shopify/ProductVariant/")) return;
  if (code !== null && !(await prisma.albaseetArticle.findUnique({ where: { code }, select: { code: true } }))) return;
  await prisma.articleLink.upsert({
    where: { variantId: id },
    create: { variantId: id, albaseetCode: code, method: "MANUAL" },
    update: { albaseetCode: code, method: "MANUAL", score: null },
  });
  refresh();
}

/** « Valider » un lien trouvé par le nom : il devient manuel (définitif). */
export async function confirmLink(variantId: string): Promise<void> {
  await requireSession();
  await prisma.articleLink.updateMany({ where: { variantId, method: "NAME" }, data: { method: "MANUAL", score: null } });
  refresh();
}

/** Rend la variante à l'association automatique (le lien est recalculé à la prochaine synchro). */
export async function resetLink(variantId: string): Promise<void> {
  await requireSession();
  await prisma.articleLink.deleteMany({ where: { variantId } });
  refresh();
}

// ── Ventes sans coût : valider un article suggéré (/rentabilite/a-relier) ───
/**
 * Produit Shopify (variantId) : lien manuel vers l'article, valable pour toutes ses ventes.
 * Lignes tapées à la main (itemIds) : chaque ligne est reliée au catalogue comme avec
 * « Relier au catalogue » de la fiche commande (même total, titre d'origine gardé) —
 * via le produit Shopify suggéré s'il y en a un, sinon directement l'article ALBASEET+.
 */
export async function linkSuggestion(input: { variantId?: string | null; itemIds?: string[]; code: string; viaVariantId?: string | null }): Promise<{ error: string | null }> {
  await requireSession();
  const code = clean(input.code, 100);
  if (!code || !(await prisma.albaseetArticle.findUnique({ where: { code }, select: { code: true } }))) return { error: "Article ALBASEET+ introuvable." };

  if (input.variantId) {
    await setManualLink(input.variantId, code);
    return { error: null };
  }

  const ids = (input.itemIds ?? []).map((id) => clean(id, 40)).filter(Boolean).slice(0, 200);
  if (!ids.length) return { error: "Aucune ligne à relier." };
  const via = input.viaVariantId && (await prisma.articleLink.findFirst({ where: { variantId: input.viaVariantId, albaseetCode: code }, select: { variantId: true } }));
  const items = await prisma.orderItem.findMany({ where: { id: { in: ids } }, select: { id: true, quantity: true, price: true } });
  const errors: string[] = [];
  for (const it of items) {
    const base = { quantity: it.quantity, price: Number(it.price) };
    let res = via ? await relinkOrderItem(it.id, [{ ...base, variantId: via.variantId }]) : { error: "direct" };
    if (res.error) res = await relinkOrderItem(it.id, [{ ...base, albaseetCode: code }]);
    if (res.error) errors.push(res.error);
  }
  refresh();
  const done = items.length - errors.length;
  if (!errors.length) return { error: null };
  return { error: `${done} ligne(s) reliée(s), ${errors.length} non reliée(s) : ${errors[0]}` };
}

// ── Classement des articles (acheté localement / importé) ──────────────────
// Le type n'est modifié QUE par ces actions, jamais par la synchro ALBASEET+.
// Il ne sert que pour les articles sans fournisseur : les autres sont classés
// d'office par leur fournisseur (costTypeOf).
export async function classifyArticles(formData: FormData): Promise<void> {
  await requireSession();
  const type = String(formData.get("type")) as CostType;
  if (!COST_TYPES.includes(type)) return;
  const data = { costType: type, costTypeSetAt: new Date() };
  if (formData.get("scope") === "filter") {
    const p = (k: string) => String(formData.get(k) ?? "") || undefined;
    const where = articleFilter({ q: p("q"), fournisseur: p("fournisseur"), famille: p("famille"), type: p("filterType") });
    await prisma.albaseetArticle.updateMany({ where: { AND: [where, NO_SUPPLIER] }, data });
  } else {
    const codes = formData.getAll("code").map((c) => String(c)).slice(0, 1000);
    if (codes.length) await prisma.albaseetArticle.updateMany({ where: { AND: [{ code: { in: codes } }, NO_SUPPLIER] }, data });
  }
  refresh();
}

// ── Campagnes Meta -> produits / collections ───────────────────────────────
export type TargetHit = { type: "PRODUCT" | "COLLECTION"; id: string; title: string; imageUrl: string | null; detail: string };

export async function searchTargets(q: string): Promise<TargetHit[]> {
  await requireSession();
  const words = clean(q, 80).split(" ").filter(Boolean).slice(0, 5);
  if (!words.length) return [];
  const [variants, collections] = await Promise.all([
    prisma.shopifyVariant.findMany({
      where: { AND: words.map((w) => ({ productTitle: { contains: w, mode: "insensitive" as const } })) },
      distinct: ["productId"],
      select: { productId: true, productTitle: true, imageUrl: true, productStatus: true, price: true },
      take: 10,
      orderBy: { productTitle: "asc" },
    }),
    prisma.shopifyCollection.findMany({ where: { AND: words.map((w) => ({ title: { contains: w, mode: "insensitive" as const } })) }, take: 5, orderBy: { title: "asc" } }),
  ]);
  return [
    ...collections.map((c) => ({ type: "COLLECTION" as const, id: c.id, title: c.title, imageUrl: null, detail: "Collection" })),
    ...variants.map((v) => ({
      type: "PRODUCT" as const, id: v.productId, title: v.productTitle, imageUrl: v.imageUrl,
      detail: `${Math.round(Number(v.price))} DH${v.productStatus === "ACTIVE" ? "" : ` · ${v.productStatus === "DRAFT" ? "brouillon" : "archivé"}`}`,
    })),
  ];
}

export async function addCampaignLink(campaignId: string, target: Pick<TargetHit, "type" | "id" | "title">): Promise<void> {
  await requireSession();
  if (!(await prisma.metaCampaign.findUnique({ where: { id: campaignId }, select: { id: true } }))) return;
  if (target.type !== "PRODUCT" && target.type !== "COLLECTION") return;
  // Un seul type d'association : un produit ou une collection remplace « tout le site » / « frais généraux ».
  await prisma.$transaction([
    prisma.campaignLink.deleteMany({ where: { campaignId, targetType: { in: [SITE_TARGET, OVERHEAD_TARGET] } } }),
    prisma.campaignLink.upsert({
      where: { campaignId_targetType_targetId: { campaignId, targetType: target.type, targetId: clean(target.id, 100) } },
      create: { campaignId, targetType: target.type, targetId: clean(target.id, 100), targetTitle: clean(target.title, 200) },
      update: {},
    }),
  ]);
  refresh();
}

/** « Tout le site » ou « Frais généraux » : remplace toutes les autres associations de la campagne. */
export async function setCampaignScope(campaignId: string, scope: "SITE" | "OVERHEAD"): Promise<void> {
  await requireSession();
  if (scope !== SITE_TARGET && scope !== OVERHEAD_TARGET) return;
  if (!(await prisma.metaCampaign.findUnique({ where: { id: campaignId }, select: { id: true } }))) return;
  await prisma.$transaction([
    prisma.campaignLink.deleteMany({ where: { campaignId } }),
    prisma.campaignLink.create({
      data: { campaignId, targetType: scope, targetId: "*", targetTitle: scope === SITE_TARGET ? "Tout le site" : "Frais généraux (notoriété, magasin)" },
    }),
  ]);
  refresh();
}

export async function removeCampaignLink(id: string): Promise<void> {
  await requireSession();
  await prisma.campaignLink.deleteMany({ where: { id } });
  refresh();
}
