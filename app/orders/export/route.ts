import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { STATE_FILL, carrierFill, exportRow, monthBanner, monthPeriod } from "@/lib/orders-export";
import { monthLabel } from "@/lib/date-range";
import { revenueState } from "@/lib/revenue";
import { profitCells, type ProfitCells } from "@/lib/orders-export-profit";
import { lineResolver } from "@/lib/profit/compute";
import { loadCatalog, loadHistory } from "@/lib/profit/report";
import { hasSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BANNER_FILL = "FFFFF4B8"; // jaune pastel
const HEADER_FILL = "FFE6E6EA"; // gris pastel
const NOT_SHIPPED_FILL = "FFFFF1C9"; // jaune clair : confirmée mais pas encore partie
const UNLINKED_FILL = "FFFFC48A"; // orange : ligne reliée à aucun article ALBASEET+
const LINE ={ style: "thin" as const, color: { argb: "FFD9D9DE" } };

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// GET /orders/export?month=2026-10 : toutes les commandes CONFIRMÉES du mois
// (date de création de la commande, heure du Maroc), en fichier Excel, dans la
// présentation de la feuille de suivi : bandeau du mois, une ligne par
// produit (colonnes de la commande répétées), lignes vertes = livrées, pêche =
// retours, orange = produit relié à aucun article ALBASEET+. À la fin : prix
// d'achat et de gros ALBASEET+ en vigueur à la date de la commande.
// Protégé par la session comme le reste du CRM (middleware).
export async function GET(req: NextRequest) {
  if (!(await hasSession())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const month = req.nextUrl.searchParams.get("month");
  const range = monthPeriod(month);
  if (!month || !range) {
    return NextResponse.json({ error: "Paramètre month=AAAA-MM invalide." }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMEE", createdAt: { gte: range.start, lt: range.end } },
    select: {
      orderNumber: true,
      localNote: true,
      createdAt: true,
      customerName: true,
      city: true,
      totalPrice: true,
      shippingFee: true,
      carrier: true,
      forcelogCode: true,
      ozonCode: true,
      localDelivery: true,
      localCourier: true,
      localStatus: true,
      forcelogStatusCode: true,
      forcelogStatus: true,
      ozonStatus: true,
      parcels: { select: { carrier: true, statusCode: true, status: true }, orderBy: { carrierCreatedAt: { sort: "desc", nulls: "last" } }, take: 1 },
      items: { select: { title: true, quantity: true, price: true, shopifyVariantId: true, albaseetCode: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  // Même règle que le chiffre d'affaires du CRM : une commande confirmée mais pas
  // partie (sans colis, ou colis jamais pris en charge) n'entre pas dans le total.
  const rows = orders.map((o) => {
    const row = exportRow(o);
    const notShipped = revenueState(o) === "a_expedier";
    return { ...row, notShipped, statut: notShipped ? "à expédier" : row.statut };
  });

  // Prix ALBASEET+ : même résolution des lignes et mêmes prix datés que la page Rentabilité.
  const catalog = await loadCatalog();
  const resolve = lineResolver({ ...catalog, history: await loadHistory(catalog, orders) });
  const EMPTY: ProfitCells = { designation: "", prixAchat: null, prixGros: null, type: null, coutUnitaire: null, coutTotal: null, ca: null, marge: null, unlinked: false };
  const lineRows = rows.flatMap((r, i) => {
    const o = orders[i];
    const cells = o.items.length ? profitCells(Number(String(o.totalPrice)), resolve(o), false) : [EMPTY];
    return cells.map((c) => ({ order: r, cells: c }));
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(monthLabel(month).slice(0, 31));
  const COLS = [
    { header: "N°", key: "numero", width: 9 },
    { header: "Date", key: "date", width: 12 },
    { header: "ARTICLE", key: "articles", width: 52 },
    { header: "NOM & PRENOM", key: "client", width: 26 },
    { header: "Ville", key: "ville", width: 18 },
    { header: "LIVRE PAR", key: "livrePar", width: 16 },
    { header: "Confirmation", key: "confirmation", width: 14 },
    { header: "Status", key: "statut", width: 12 },
    { header: "Prix", key: "prix", width: 12, style: { numFmt: '#,##0.00' } },
    { header: "Prix de la livraison", key: "fraisLivraison", width: 14, style: { numFmt: '#,##0.00' } },
    { header: "Prix Gros", key: "prixGros", width: 12, style: { numFmt: '#,##0.00' } },
    { header: "Remarque", key: "remarque", width: 28 },
    { header: "Prix d'achat unitaire", key: "prixAchat", width: 13, style: { numFmt: '#,##0.00' } },
    { header: "Prix de gros unitaire", key: "prixGrosUnit", width: 13, style: { numFmt: '#,##0.00' } },
  ];
  const last = COLS.length;

  // Ligne 1 : bandeau du mois. Ligne 2 : en-têtes.
  ws.mergeCells(1, 1, 1, last);
  const banner = ws.getCell(1, 1);
  banner.value = monthBanner(month);
  banner.font = { bold: true, size: 12 };
  banner.fill = fill(BANNER_FILL);
  banner.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 22;

  ws.getRow(2).values = COLS.map((c) => c.header);
  ws.getRow(2).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = fill(HEADER_FILL);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: LINE, bottom: LINE, left: LINE, right: LINE };
  });
  ws.getRow(2).height = 24;
  COLS.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width;
    if (c.style) col.numFmt = c.style.numFmt;
  });
  ws.views = [{ state: "frozen", ySplit: 2 }];

  // Une ligne par produit ; la date n'est écrite qu'à la première ligne du jour.
  let lastDate = "";
  lineRows.forEach(({ order: r, cells: p }, i) => {
    const row = ws.getRow(i + 3);
    row.values = [
      r.numero,
      r.date === lastDate ? "" : r.date,
      r.articles,
      r.client,
      r.ville,
      r.livrePar,
      r.confirmation,
      r.statut,
      r.prix,
      r.fraisLivraison,
      null,
      r.remarque,
      p.prixAchat,
      p.prixGros,
    ];
    lastDate = r.date;
    const stateFill = p.unlinked ? UNLINKED_FILL : r.notShipped ? NOT_SHIPPED_FILL : STATE_FILL[r.state];
    for (let c = 1; c <= last; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: "top", wrapText: true, horizontal: c === 2 || c >= 7 && c <= 8 ? "center" : undefined };
      cell.border = { top: LINE, bottom: LINE, left: LINE, right: LINE };
      if (stateFill) cell.fill = fill(stateFill);
    }
    const carrier = carrierFill(r.livrePar);
    if (carrier && !p.unlinked) row.getCell(6).fill = fill(carrier);
    if (r.state === "retour") row.getCell(8).font = { bold: true, color: { argb: "FFB4552D" } };
  });

  // Pied : total des commandes parties, hors retours (rien encaissé) et hors commandes pas encore expédiées.
  const total = ws.getRow(lineRows.length + 3);
  const kept = rows.filter((r) => r.state !== "retour" && !r.notShipped);
  const returnedCount = rows.filter((r) => r.state === "retour").length;
  const pending = rows.filter((r) => r.notShipped);
  total.values = [
    "Total",
    "",
    `${kept.length} commande${kept.length > 1 ? "s" : ""}${returnedCount ? ` · ${returnedCount} retour${returnedCount > 1 ? "s" : ""}` : ""}`,
    "",
    "",
    "",
    "",
    "",
    kept.reduce((s, r) => s + (r.prix ?? 0), 0),
    kept.reduce((s, r) => s + (r.fraisLivraison ?? 0), 0),
    null,
    "",
  ];
  for (let c = 1; c <= last; c++) {
    const cell = total.getCell(c);
    cell.font = { bold: true };
    cell.fill = fill(HEADER_FILL);
    cell.border = { top: LINE, bottom: LINE, left: LINE, right: LINE };
  }

  if (pending.length > 0) {
    const note = ws.getRow(lineRows.length + 4);
    note.getCell(1).value = "Pas encore expédiées";
    note.getCell(3).value = `${pending.length} commande${pending.length > 1 ? "s" : ""} confirmée${pending.length > 1 ? "s" : ""}, non comptées dans le total`;
    note.getCell(9).value = pending.reduce((s, r) => s + (r.prix ?? 0), 0);
    for (let c = 1; c <= last; c++) {
      const cell = note.getCell(c);
      cell.font = { italic: true };
      cell.fill = fill(NOT_SHIPPED_FILL);
      cell.border = { top: LINE, bottom: LINE, left: LINE, right: LINE };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="commandes-confirmees-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
