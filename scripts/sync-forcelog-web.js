#!/usr/bin/env node
"use strict";

/**
 * Contourne les limites de l'API publique Forcelog (pagination cassée,
 * filtre STATUS ignoré, GetParcel en échec quasi systématique — vérifié
 * en pratique) en passant par leur dashboard web (customer.forcelog.ma),
 * dont les endpoints JSON internes (DataTables) ont, eux, une pagination
 * et un filtrage réellement fonctionnels.
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

// STATUS_CODE réels confirmés via le <select id="f_statut"> de la page
// "Liste des Colis" du dashboard (pas une supposition) : les deux
// libellés "Pas de réponse" et les deux "Annulé" + "Refusé".
const PARCEL_STATUS_CODES = ["NO_ANSWER", "NO_ANSWER_SMS", "CANCELED", "DOESNT_ORDER", "REFUSE"];

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
  const parcelsByCode = new Map();

  for (const statusCode of PARCEL_STATUS_CODES) {
    const rows = await fetchAllPages(
      cookieHeader,
      "https://customer.forcelog.ma/index/Parcels/Json",
      {
        f_city: "0",
        f_situation: "0",
        f_statut: statusCode,
        f_parcel_type: "",
        f_date: "C_DATE",
        f_return: "",
        f_claim: "",
        f_product: "0",
        f_cstmr_staff: "0",
        f_time_s: "2020-01-01 00:00",
        f_time_e: "2030-12-31 23:59",
      },
      ["CODE", "PROD", "DATE", "RECEIVER", "SITUATION", "STATUT", "DAGENT", "D_DATE", "CITY", "PRICE", "CLAIM", "ACTIONS", "NOTES"]
    );

    for (const row of rows) {
      const code = stripHtml(row.CODE).trim();
      if (!code) continue;
      const status = stripHtml(row.STATUT);
      parcelsByCode.set(code, { code, statusCode, status });
    }
    console.log(`  ${statusCode}: ${rows.length} colis trouvés`);
  }

  return [...parcelsByCode.values()];
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

  console.log("Récupération des colis (Pas de réponse / Annulé / Refusé)...");
  const parcels = await collectParcels(cookieHeader);
  console.log(`Total colis uniques: ${parcels.length}`);

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
