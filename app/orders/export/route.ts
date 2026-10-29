import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { exportRow, monthPeriod } from "@/lib/orders-export";
import { monthLabel } from "@/lib/date-range";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /orders/export?month=2026-10 : toutes les commandes CONFIRMÉES du mois
// (date de création de la commande, heure du Maroc), en fichier Excel.
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
      parcels: { select: { carrier: true }, take: 1 },
      items: { select: { title: true, quantity: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const rows = orders.map(exportRow);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(monthLabel(month).slice(0, 31));
  ws.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Articles", key: "articles", width: 48 },
    { header: "Client", key: "client", width: 26 },
    { header: "Ville", key: "ville", width: 18 },
    { header: "Transporteur", key: "transporteur", width: 16 },
    { header: "Frais de livraison", key: "fraisLivraison", width: 18, style: { numFmt: '#,##0.00 "DH"' } },
    { header: "Prix de la commande", key: "prix", width: 20, style: { numFmt: '#,##0.00 "DH"' } },
  ];
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  const total = ws.addRow({
    date: "Total",
    articles: `${rows.length} commande${rows.length > 1 ? "s" : ""}`,
    fraisLivraison: rows.reduce((s, r) => s + (r.fraisLivraison ?? 0), 0),
    prix: rows.reduce((s, r) => s + r.prix, 0),
  });
  total.font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="commandes-confirmees-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
