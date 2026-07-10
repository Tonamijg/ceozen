// ============================================================
// CEOZEN — Génération PDF du rapport de gestion (jsPDF)
// ============================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from '@/lib/utils';
import type { VStockAlert } from '@/types';
import {
  MARGIN, PAGE_W, NAVY, MUTED, BLUE, VIOLET, GREEN, RED, ORANGE, LIGHT,
  fmt, fmtNum, fmtCompact, drawHeader, drawFooter, drawPageNumbers,
  ensureSpace, sectionTitle, drawKpiBox, emptyStateText, type PdfHeaderMeta,
} from '@/lib/pdfKit';

interface TopProduct {
  product_name: string;
  total_qty: number;
  total_revenue: number;
}

interface SellerStat {
  seller_name: string;
  sale_count: number;
  total_revenue: number;
}

interface ExpenseByCat {
  name: string;
  color: string;
  total: number;
}

export interface ReportPdfData {
  periodFrom: string;
  periodTo: string;
  totalRevenue: number;
  totalExpenses: number;
  margin: number;
  salesCount: number;
  avgSale: number;
  trocsCount: number;
  trocsRevenue: number;
  totalStockValue: number;
  topProducts: TopProduct[];
  sellerStats: SellerStat[];
  expensesByCat: ExpenseByCat[];
  stockSnapshot: VStockAlert[];
}

export async function generateReportPDF(data: ReportPdfData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const meta: PdfHeaderMeta = {
    title: 'Rapport de gestion',
    subtitle: `Période : ${formatDate(data.periodFrom)} au ${formatDate(data.periodTo)}`,
  };

  drawHeader(doc, meta);
  drawFooter(doc);

  // ── KPIs ──────────────────────────────────────────────────
  let y = sectionTitle(doc, 'Vue d\'ensemble', 33);

  const gap = 4;
  const boxW = (PAGE_W - 2 * MARGIN - 3 * gap) / 4;
  const boxH = 20;

  const kpis: { label: string; value: string; accent: [number, number, number] }[] = [
    { label: "Chiffre d'affaires", value: fmtCompact(data.totalRevenue), accent: BLUE },
    { label: 'Dépenses totales', value: fmtCompact(data.totalExpenses), accent: ORANGE },
    { label: 'Marge nette', value: fmtCompact(data.margin), accent: data.margin >= 0 ? GREEN : RED },
    { label: 'Nombre de ventes', value: data.salesCount.toLocaleString('fr-FR'), accent: VIOLET },
    { label: 'Panier moyen', value: fmtCompact(data.avgSale), accent: MUTED },
    { label: `Trocs (${data.trocsCount})`, value: fmtCompact(data.trocsRevenue), accent: VIOLET },
    { label: 'Valeur du stock', value: fmtCompact(data.totalStockValue), accent: BLUE },
    { label: 'Produits en alerte', value: String(data.stockSnapshot.filter(p => p.is_low_stock).length), accent: ORANGE },
  ];

  kpis.forEach((kpi, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = MARGIN + col * (boxW + gap);
    const by = y + row * (boxH + gap);
    drawKpiBox(doc, x, by, boxW, boxH, kpi.label, kpi.value, kpi.accent);
  });

  y = y + 2 * (boxH + gap) + 4;

  // ── Top produits ──────────────────────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Top produits (CA)', y, BLUE);

  if (data.topProducts.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Rang', 'Produit', 'Qté vendue', 'CA (FCFA)']],
      body: data.topProducts.map((p, i) => [
        String(i + 1), p.product_name, String(p.total_qty), fmtNum(p.total_revenue),
      ]),
      theme: 'plain',
      styles: { fontSize: 8.5, textColor: NAVY, cellPadding: 2.2 },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 34, halign: 'right' },
      },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  } else {
    y = emptyStateText(doc, 'Aucune vente sur la période.', y);
  }

  // ── Dépenses par catégorie ────────────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Dépenses par catégorie', y, ORANGE);

  if (data.expensesByCat.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Catégorie', 'Total (FCFA)', '% du total']],
      body: data.expensesByCat.map((e) => [
        e.name, fmtNum(e.total),
        data.totalExpenses > 0 ? ((e.total / data.totalExpenses) * 100).toFixed(1) + ' %' : '0 %',
      ]),
      theme: 'plain',
      styles: { fontSize: 8.5, textColor: NAVY, cellPadding: 2.2 },
      headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        1: { cellWidth: 34, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
      },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  } else {
    y = emptyStateText(doc, 'Aucune dépense sur la période.', y);
  }

  // ── Performance par vendeur ───────────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Performance par vendeur', y, VIOLET);

  if (data.sellerStats.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Vendeur', 'Nb ventes', 'CA (FCFA)']],
      body: data.sellerStats.map((s) => [s.seller_name, String(s.sale_count), fmtNum(s.total_revenue)]),
      theme: 'plain',
      styles: { fontSize: 8.5, textColor: NAVY, cellPadding: 2.2 },
      headStyles: { fillColor: VIOLET, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 34, halign: 'right' },
      },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  } else {
    y = emptyStateText(doc, 'Aucune vente sur la période.', y);
  }

  // ── État du stock ─────────────────────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, `État du stock à date — Valeur totale : ${fmt(data.totalStockValue)}`, y, BLUE);

  if (data.stockSnapshot.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Référence', 'Produit', 'Catégorie', 'Qté', 'Prix achat (FCFA)', 'Valeur (FCFA)', 'Statut']],
      body: data.stockSnapshot.map((p) => [
        p.reference ?? '', p.name ?? '', p.category ?? '',
        String(p.stock_qty ?? 0), fmtNum(p.buy_price ?? 0), fmtNum(p.stock_value ?? 0),
        p.stock_qty === 0 ? 'Rupture' : p.is_low_stock ? 'Stock bas' : 'OK',
      ]),
      theme: 'plain',
      styles: { fontSize: 7.5, textColor: NAVY, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 20, halign: 'center' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 6) {
          const v = hookData.cell.raw as string;
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.textColor = (v === 'Rupture' ? RED : v === 'Stock bas' ? ORANGE : GREEN);
        }
      },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
  } else {
    emptyStateText(doc, 'Aucun produit en stock.', y);
  }

  drawPageNumbers(doc);
  doc.save(`ceozen-rapport-${data.periodFrom}-${data.periodTo}.pdf`);
}
