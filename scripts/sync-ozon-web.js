#!/usr/bin/env node
"use strict";

/**
 * Ozon Express n'a aucun endpoint API public pour lister tous les colis
 * (uniquement parcel-info/tracking par numéro de suivi — vérifié via leur
 * documentation ET en testant plusieurs chemins plausibles en direct,
 * tous inexistants). Même contournement que Forcelog (voir
 * sync-forcelog-web.js) : passer par leur dashboard web
 * (client.ozoneexpress.ma — avec un "e", pas ozonexpress.ma comme l'API),
 * dont l'endpoint interne /parcels_json (DataTables, même techno que
 * Forcelog) liste réellement tout le compte, paginé et filtrable par date.
 *
 * Récupère TOUS les colis depuis le 1er septembre 2026, y compris ceux
 * créés en dehors du CRM. Voir prisma/schema.prisma (modèle Parcel) et
 * app/api/cron/sync-ozon-web/route.ts.
 *
 * Ne tourne QUE dans GitHub Actions — jamais sur Vercel (Playwright,
 * mêmes contraintes que pour Forcelog).
 *
 * Usage : node scripts/sync-ozon-web.js
 * Variables requises : OZON_WEB_EMAIL, OZON_WEB_PASSWORD, CRM_BASE_URL,
 * CRON_SECRET.
 */

require("dotenv").config();
const { chromium } = require("playwright");

const { OZON_WEB_EMAIL, OZON_WEB_PASSWORD, CRM_BASE_URL, CRON_SECRET } = process.env;

const SYNC_SINCE = "2026-09-01 00:00";
const PAGE_LENGTH = 100;

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyDh(text) {
  // BUG corrigé (2026-09-27) : appliqué tel quel sur du HTML brut (ex:
  // `<span class="text-success">6157 DH</span>`), le tiret de la classe
  // CSS "text-success"/"text-danger" passait le filtre [^\d.,-] et se
  // retrouvait collé aux chiffres une fois les autres caractères
  // supprimés — "6157" devenait "-6157". D'où les montants Ozon tous
  // négatifs en base alors que ce sont des virements REÇUS. On retire
  // donc les balises AVANT d'extraire le nombre, et on force en positif
  // (Math.abs) : ce sont toujours des sommes qu'Ozon nous verse, jamais
  // un solde qu'on lui devrait, quel que soit le formatage source.
  const n = parseFloat(stripHtml(text).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

// Même règle que normalizeMoroccanPhone (lib/phone.ts), y compris
// "+212 0612…" (13 chiffres "2120…") — garder les deux synchronisées.
function normPhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00212")) d = d.slice(5);
  else if (d.startsWith("212") && d.length >= 12) d = d.slice(3);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d;
}

async function login(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://client.ozoneexpress.ma/login", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.fill("#email", OZON_WEB_EMAIL);
  await page.fill("#password", OZON_WEB_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => null),
    page.click("button[type=submit]"),
  ]);
  await page.waitForTimeout(1000);

  if (!page.url().includes("/home")) {
    throw new Error(`Échec de connexion Ozon Express — URL finale inattendue: ${page.url()}`);
  }

  const cookies = await context.cookies();
  await page.close();
  return cookies
    .filter((c) => c.domain.includes("ozoneexpress"))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function dataTablesColumns(names) {
  const params = {};
  names.forEach((name, i) => {
    params[`columns[${i}][data]`] = name;
    params[`columns[${i}][name]`] = "";
    params[`columns[${i}][searchable]`] = "true";
    params[`columns[${i}][orderable]`] = "true";
    params[`columns[${i}][search][value]`] = "";
    params[`columns[${i}][search][regex]`] = "false";
  });
  return params;
}

const PARCEL_COLUMNS = [
  "PARCEL_CODE",
  "PARCEL_RECEIVER",
  "PARCEL_PRODUCTS",
  "PARCEL_COMMENT",
  "PARCEL_PICKUP_TIME",
  "PARCEL_STATUT",
  "PARCEL_CITY",
  "PARCEL_PRICE",
  "PARCEL_ACTION",
  "PARCEL_NOTES",
];

async function fetchAllParcels(cookieHeader) {
  const rows = [];
  let start = 0;
  for (let i = 0; i < 200; i++) {
    const params = new URLSearchParams({
      draw: "1",
      ...dataTablesColumns(PARCEL_COLUMNS),
      start: String(start),
      length: String(PAGE_LENGTH),
      "search[value]": "",
      "search[regex]": "false",
      filter_situation: "0",
      filter_status: "0",
      filter_zone: "0",
      filter_city: "0",
      filter_address: "0",
      filter_users: "0",
      filter_by_date: "LAST_UPDATE",
      f_time_s: SYNC_SINCE,
      f_time_e: new Date().toISOString().slice(0, 16).replace("T", " "),
    });

    const res = await fetch("https://client.ozoneexpress.ma/parcels_json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`/parcels_json — HTTP ${res.status}`);
    const data = await res.json();
    const page = data.aaData ?? [];
    rows.push(...page);

    start += PAGE_LENGTH;
    if (start >= (data.iTotalDisplayRecords ?? 0) || page.length === 0) break;
  }
  return rows;
}

function collectParcels(rows) {
  const parcels = [];
  for (const row of rows) {
    const code = (stripHtml(row.PARCEL_CODE).match(/^\S+/) || [])[0] ?? "";
    if (!code) continue;

    const receiverParts = String(row.PARCEL_RECEIVER ?? "").split("<br>");
    const receiver = stripHtml(receiverParts[0] ?? "");
    const phone = normPhone(stripHtml(receiverParts[1] ?? ""));

    // PARCEL_STATUT contient deux badges (statut de livraison, puis
    // situation de paiement) séparés par "<br><br>" — seul le premier
    // nous intéresse pour la catégorisation (voir lib/ozon-categories.ts).
    const statusHtml = String(row.PARCEL_STATUT ?? "").split("<br><br>")[0];
    const status = stripHtml(statusHtml);

    const dateMatch = String(row.PARCEL_PICKUP_TIME ?? "").match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);

    parcels.push({
      code,
      receiver,
      phone,
      cityName: stripHtml(row.PARCEL_CITY),
      price: parseMoneyDh(row.PARCEL_PRICE),
      status,
      carrierCreatedAt: dateMatch ? dateMatch[0] : null,
    });
  }
  return parcels;
}

// Page "Liste Virements" (client.ozoneexpress.ma/V2/Invoices) : même
// technologie DataTables que /parcels_json, mais endpoint et noms de
// colonnes différents — trouvé en observant le réseau au chargement de
// la page (POST vers /V2/Invoices?action=json, pas une URL séparée comme
// pour les colis). Colonnes réelles : REF/DATE/STATUT/P_DATE/COLIS/TOTAL
// (+ ACTIONS, ignorée) — PAS de détail de frais (contrairement au CRBT
// Forcelog), voir prisma/schema.prisma. f_time_s très ancien pour
// récupérer tout l'historique (pas de raison de le borner comme pour les
// colis, peu de virements au total).
const INVOICE_COLUMNS = ["REF", "DATE", "STATUT", "P_DATE", "COLIS", "TOTAL", "ACTIONS"];
const INVOICES_SINCE = "2024-01-01 00:00";

async function fetchAllInvoiceRows(cookieHeader) {
  const rows = [];
  let start = 0;
  for (let i = 0; i < 50; i++) {
    const params = new URLSearchParams({
      draw: "1",
      ...dataTablesColumns(INVOICE_COLUMNS),
      start: String(start),
      length: String(PAGE_LENGTH),
      "search[value]": "",
      "search[regex]": "false",
      filter_status: "",
      f_time_s: INVOICES_SINCE,
      f_time_e: new Date().toISOString().slice(0, 16).replace("T", " "),
    });

    const res = await fetch("https://client.ozoneexpress.ma/V2/Invoices?action=json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`/V2/Invoices?action=json — HTTP ${res.status}`);
    const data = await res.json();
    const page = data.aaData ?? [];
    rows.push(...page);

    start += PAGE_LENGTH;
    if (start >= (data.iTotalDisplayRecords ?? 0) || page.length === 0) break;
  }
  return rows;
}

function collectInvoices(rows) {
  const invoices = [];
  for (const row of rows) {
    const ref = (stripHtml(row.REF).match(/^\S+/) || [])[0] ?? "";
    if (!ref) continue;

    const cDateMatch = String(row.DATE ?? "").match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    if (!cDateMatch) continue;

    const statutText = stripHtml(row.STATUT).split(/(?=Paiement prévu)/)[0].trim();
    // "P_DATE" n'est une vraie date de paiement effectif que si le
    // statut est "Payé" — sinon c'est une date prévisionnelle (badge
    // "Programmé" + "Paiement prévu le...").
    const payDateMatch = statutText === "Payé" ? String(row.P_DATE ?? "").match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/) : null;

    invoices.push({
      ref,
      cDate: cDateMatch[0],
      payDate: payDateMatch ? payDateMatch[0] : null,
      statut: statutText,
      parcelsCount: parseInt(stripHtml(String(row.COLIS ?? "")), 10) || 0,
      amount: parseMoneyDh(row.TOTAL),
    });
  }
  return invoices;
}

async function main() {
  for (const key of ["OZON_WEB_EMAIL", "OZON_WEB_PASSWORD", "CRM_BASE_URL", "CRON_SECRET"]) {
    if (!process.env[key]) throw new Error(`Variable manquante: ${key}`);
  }

  const browser = await chromium.launch();
  let cookieHeader;
  try {
    console.log("Connexion à client.ozoneexpress.ma...");
    cookieHeader = await login(browser);
  } finally {
    await browser.close();
  }
  console.log("Connecté.");

  console.log(`Récupération de tous les colis depuis le ${SYNC_SINCE}...`);
  const rows = await fetchAllParcels(cookieHeader);
  const parcels = collectParcels(rows);
  console.log(`Total colis: ${parcels.length}`);

  console.log("Récupération des factures (Liste Virements)...");
  const invoiceRows = await fetchAllInvoiceRows(cookieHeader);
  const invoices = collectInvoices(invoiceRows);
  console.log(`Total factures: ${invoices.length}`);

  console.log(`Envoi vers ${CRM_BASE_URL}/api/cron/sync-ozon-web...`);
  const res = await fetch(`${CRM_BASE_URL}/api/cron/sync-ozon-web`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ parcels, invoices }),
  });
  const result = await res.json();
  if (!res.ok) {
    console.error("Échec:", JSON.stringify(result));
    process.exit(1);
  }
  console.log("OK:", JSON.stringify(result));
}

main().catch((err) => {
  console.error("Erreur:", err.message);
  process.exit(1);
});
