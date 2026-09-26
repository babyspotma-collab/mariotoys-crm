#!/usr/bin/env node
"use strict";

/**
 * Contourne les limites de l'API publique Forcelog (pagination cassée,
 * filtre STATUS ignoré, GetParcel en échec quasi systématique — vérifié
 * en pratique) en passant par leur dashboard web (customer.forcelog.ma),
 * dont les endpoints JSON internes (DataTables) ont, eux, une pagination
 * et un filtrage réellement fonctionnels.
 *
 * Récupère TOUS les colis depuis le 1er septembre 2026 (pas seulement ceux
 * déjà liés à une commande du CRM) — la vraie liste côté Forcelog, y
 * compris les colis créés en dehors du CRM. Voir prisma/schema.prisma
 * (modèle Parcel) et app/api/cron/sync-forcelog-web/route.ts.
 *
 * Ne tourne QUE dans GitHub Actions (voir .github/workflows/sync-tracking.yml)
 * — jamais sur Vercel, qui n'est pas un environnement adapté à Playwright
 * (pas de Chromium préinstallé, contraintes serverless). Playwright ne
 * sert ici qu'à la connexion (leur reCAPTCHA v3 invisible nécessite un
 * vrai navigateur) ; toute la récupération de données ensuite se fait en
 * simples requêtes HTTP authentifiées par le cookie de session obtenu.
 *
 * Usage : node scripts/sync-forcelog-web.js
 * Variables requises : FORCELOG_WEB_EMAIL, FORCELOG_WEB_PASSWORD,
 * CRM_BASE_URL, CRON_SECRET.
 */

require("dotenv").config();
const { chromium } = require("playwright");

const {
  FORCELOG_WEB_EMAIL,
  FORCELOG_WEB_PASSWORD,
  CRM_BASE_URL,
  CRON_SECRET,
} = process.env;

const SYNC_SINCE = "2026-09-01 00:00";

// Table CODE -> libellé FR extraite en direct du <select id="f_statut"> de
// la page "Liste des Colis" (pas devinée) — utilisée en sens inverse
// (libellé -> code) puisque le tableau de colis lui-même n'expose que le
// libellé, pas le code machine. Plusieurs codes peuvent partager un même
// libellé affiché (ex: CANCELED et DOESNT_ORDER -> "Annulé") ; comme
// lib/parcel-categories.ts regroupe déjà ces codes dans les mêmes
// catégories, n'importe lequel des deux convient pour la classification.
const LABEL_TO_CODE = {
  "Reçu Hub": "PICKED_UP",
  "Expédié vers la ville": "SENT",
  "Reçu ville": "RECEIVED",
  "En cours de livraison": "DISTRIBUTION",
  "En cours": "IN_PROGRESS",
  "Retourné": "RETURNED",
  "Livré": "DELIVERED",
  "Reporté": "POSTPONED",
  "Pas de réponse": "NO_ANSWER",
  "Injoignable": "UNREACHABLE",
  "Hors-zone": "OUT_OF_AREA",
  "Annulé": "CANCELED",
  "Refusé": "REFUSE",
  "En Voyage": "TRAVELLING",
  "Relancer": "RELAUNCH",
  "Relancer vers un nouveau client": "RELAUNCH_NEW",
  "Pas de réponse ( Suivi )": "NO_ANSWER_TEAM",
  "Injoignable ( Suivi )": "UNREACHABLE_TEAM",
  "Reporté ( Suivi )": "POSTPONED_TEAM",
  "Annulé ( Suivi )": "CANCELED_TEAM",
  "Boîte vocale": "VOICEMAIL",
  "Préparation retour": "PREPAR_RETURN",
  "Attente Confirmation": "ATT_CONF",
  "Confirmé par forcelog": "CONF",
  "Traitement Suivi en cours": "TSUIVI",
  "En cours de traitement par Forcelog": "SUIVI_TEAM",
  "Colis dêja préparer": "PREPAREDCOLIS",
  "Colis Non Reçu - Hub casablanca": "NOREC",
  "Relancer vers une nouvelle ville (Meme zone)": "RELAUNCH_NEW_CITY",
  "Eligible pour relancer vers nouvelle ville meme Zone": "EL_REZ",
  "Programmé": "PROGRAMMED",
  "Demande de retour (Par client)": "RERETURN",
  "Aucune réponse depuis 3 jours": "NOANSWER3",
  "Numéro invalide": "NUMBERERROR",
  "Ramassé": "PICKED_UP_1",
  "Livré - Facturé": "DELIVERED_INVOICED",
  "Livré - Non Facturé": "DELIVERED_NOT_INVOICED",
};

const PAGE_LENGTH = 100;

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyDh(text) {
  const n = parseFloat(String(text ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normPhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("212")) d = "0" + d.slice(3);
  else if (d.startsWith("00212")) d = "0" + d.slice(5);
  else if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d;
}

async function login(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://customer.forcelog.ma/index/login", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.fill("#login_email", FORCELOG_WEB_EMAIL);
  await page.fill("#login_password", FORCELOG_WEB_PASSWORD);
  // Laisse le temps au reCAPTCHA v3 invisible de générer son token avant soumission.
  await page.waitForTimeout(3000);
  // Cliquer le vrai bouton (pas form.submit()) : leur JS intercepte le clic
  // pour injecter le token reCAPTCHA dans le champ caché avant l'envoi —
  // soumettre le formulaire directement contourne cette étape et échoue.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 }).catch(() => null),
    page.click("button[type=submit]"),
  ]);
  await page.waitForTimeout(1000);

  if (!page.url().includes("/index/home")) {
    throw new Error(`Échec de connexion Forcelog — URL finale inattendue: ${page.url()}`);
  }

  const cookies = await context.cookies();
  await page.close();
  return cookies
    .filter((c) => c.domain.includes("forcelog"))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function dataTablesColumns(names) {
  const params = {};
  names.forEach((name, i) => {
    params[`columns[${i}][data]`] = name;
    params[`columns[${i}][searchable]`] = "true";
    params[`columns[${i}][orderable]`] = "true";
    params[`columns[${i}][search][value]`] = "";
    params[`columns[${i}][search][regex]`] = "false";
  });
  return params;
}

async function fetchAllPages(cookieHeader, url, baseParams, columns) {
  const rows = [];
  let start = 0;
  // Garde-fou : jamais plus de 200 pages (20 000 lignes) sur un run,
  // au cas où iTotalDisplayRecords serait incohérent.
  for (let i = 0; i < 200; i++) {
    const params = new URLSearchParams({
      draw: "1",
      ...dataTablesColumns(columns),
      start: String(start),
      length: String(PAGE_LENGTH),
      "search[value]": "",
      "search[regex]": "false",
      ...baseParams,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`${url} — HTTP ${res.status}`);
    const data = await res.json();
    const page = data.aaData ?? [];
    rows.push(...page);

    start += PAGE_LENGTH;
    if (start >= (data.iTotalDisplayRecords ?? 0) || page.length === 0) break;
  }
  return rows;
}

async function collectParcels(cookieHeader) {
  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
  const rows = await fetchAllPages(
    cookieHeader,
    "https://customer.forcelog.ma/index/Parcels/Json",
    {
      f_city: "0",
      f_situation: "0",
      f_statut: "0",
      f_parcel_type: "",
      f_date: "C_DATE",
      f_return: "",
      f_claim: "",
      f_product: "0",
      f_cstmr_staff: "0",
      f_time_s: SYNC_SINCE,
      f_time_e: nowStr,
    },
    ["CODE", "PROD", "DATE", "RECEIVER", "SITUATION", "STATUT", "DAGENT", "D_DATE", "CITY", "PRICE", "CLAIM", "ACTIONS", "NOTES"]
  );

  const parcels = [];
  for (const row of rows) {
    const code = (stripHtml(row.CODE).match(/^\S+/) || [])[0] ?? "";
    if (!code) continue;

    const receiverParts = String(row.RECEIVER ?? "").split("<br/>");
    const receiver = stripHtml(receiverParts[0] ?? "");
    const phone = normPhone(stripHtml(receiverParts[1] ?? ""));

    const status = stripHtml(row.STATUT);
    const statusCode = LABEL_TO_CODE[status] ?? null;

    parcels.push({
      code,
      receiver,
      phone,
      cityName: stripHtml(row.CITY),
      price: parseMoneyDh(row.PRICE),
      status,
      statusCode,
      carrierCreatedAt: row.DATE || null,
    });
  }
  return parcels;
}

async function collectInvoices(cookieHeader) {
  const rows = await fetchAllPages(
    cookieHeader,
    "https://customer.forcelog.ma/index/CRBT/Json",
    {
      f_statut: "ALL",
      f_date: "C_DATE",
      f_time_s: "2020-01-01 00:00",
      f_time_e: "2030-12-31 23:59",
    },
    ["REF", "C_DATE", "PAY_DATE", "STATUT", "PRACELS", "FEES", "BALANCE", "FEES_AMOUNT", "AMOUNT", "ACTIONS"]
  );

  return rows.map((row) => ({
    ref: stripHtml(row.REF),
    cDate: row.C_DATE ?? null,
    payDate: row.PAY_DATE ?? null,
    statut: stripHtml(row.STATUT),
    parcelsCount: parseInt(row.PRACELS, 10) || 0,
    fees: parseInt(row.FEES, 10) || 0,
    feesAmount: parseMoneyDh(row.FEES_AMOUNT),
    balance: parseMoneyDh(row.BALANCE),
    amount: parseMoneyDh(row.AMOUNT),
  }));
}

async function main() {
  for (const key of ["FORCELOG_WEB_EMAIL", "FORCELOG_WEB_PASSWORD", "CRM_BASE_URL", "CRON_SECRET"]) {
    if (!process.env[key]) throw new Error(`Variable manquante: ${key}`);
  }

  const browser = await chromium.launch();
  let cookieHeader;
  try {
    console.log("Connexion à customer.forcelog.ma...");
    cookieHeader = await login(browser);
  } finally {
    await browser.close();
  }
  console.log("Connecté.");

  console.log(`Récupération de tous les colis depuis le ${SYNC_SINCE}...`);
  const parcels = await collectParcels(cookieHeader);
  console.log(`Total colis: ${parcels.length}`);

  console.log("Récupération des factures CRBT...");
  const invoices = await collectInvoices(cookieHeader);
  console.log(`Total factures: ${invoices.length}`);

  console.log(`Envoi vers ${CRM_BASE_URL}/api/cron/sync-forcelog-web...`);
  const res = await fetch(`${CRM_BASE_URL}/api/cron/sync-forcelog-web`, {
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
