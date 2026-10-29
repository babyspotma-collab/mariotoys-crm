import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { STATE_FILL, carrierFill, exportRow, monthBanner, monthPeriod } from "@/lib/orders-export";
import { monthLabel } from "@/lib/date-range";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BANNER_FILL = "FFFFF4B8"; // jaune pastel
const HEADER_FILL = "FFE6E6EA"; // gris pastel
const LINE = { style: "thin" as const, color: { argb: "FFD9D9DE" } };

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// GET /orders/export?month=2026-10 : toutes les commandes CONFIRMÉES du mois
// (date de création de la commande, heure du Maroc), en fichier Excel, dans la
// présentation de la feuille de suivi : bandeau du mois, une ligne par
// commande, lignes vertes = livrées, pêche = retours.
// Protégé par la session comme le reste du CRM (middleware).
export async function GET(req: NextRequest) {
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
      items: { select: { title: true, quantity: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const rows = orders.map(exportRow);

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

  // Une ligne par commande ; la date n'est écrite qu'à la première commande du jour.
  let lastDate = "";
  rows.forEach((r, i) => {
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
    ];
    lastDate = r.date;
    const stateFill = STATE_FILL[r.state];
    for (let c = 1; c <= last; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: "top", wrapText: true, horizontal: c === 2 || c >= 7 && c <= 8 ? "center" : undefined };
      cell.border = { top: LINE, bottom: LINE, left: LINE, right: LINE };
      if (stateFill) cell.fill = fill(stateFill);
    }
    const carrier = carrierFill(r.livrePar);
    if (carrier) row.getCell(6).fill = fill(carrier);
    if (r.state === "retour") row.getCell(8).font = { bold: true, color: { argb: "FFB4552D" } };
  });

  // Pied : total des commandes non retournées (un retour n'a rien encaissé).
  const total = ws.getRow(rows.length + 3);
  const kept = rows.filter((r) => r.state !== "retour");
  const returnedCount = rows.length - kept.length;
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

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="commandes-confirmees-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
