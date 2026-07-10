// ============================================================
// CEOZEN — Génération PDF du rapport de gestion (jsPDF)
// ============================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { VStockAlert } from '@/types';

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

const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;

const NAVY: [number, number, number]   = [15, 23, 42];
const MUTED: [number, number, number]  = [100, 116, 139];
const BLUE: [number, number, number]   = [3, 105, 161];
const VIOLET: [number, number, number] = [109, 40, 217];
const GREEN: [number, number, number]  = [5, 150, 105];
const RED: [number, number, number]    = [220, 38, 38];
const ORANGE: [number, number, number] = [217, 119, 6];
const LIGHT: [number, number, number]  = [241, 245, 249];
const BORDER: [number, number, number] = [226, 232, 240];

// Intl.NumberFormat('fr-FR') groups digits with a narrow no-break space (U+202F),
// which the core PDF Helvetica font (WinAnsi encoding) can't render. Group manually
// with a plain ASCII space instead.
function fmtNum(n: number): string {
  const rounded = Math.round(n);
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (rounded < 0 ? '-' : '') + grouped;
}

function fmt(n: number): string {
  return fmtNum(n) + ' FCFA';
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M FCFA';
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + ' k FCFA';
  return fmt(n);
}

function drawHeader(doc: jsPDF, meta: { periodFrom: string; periodTo: string }) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BLUE);
  doc.text('CEOZEN', MARGIN, 15);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('by Tech big', MARGIN, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text('Rapport de gestion', PAGE_W - MARGIN, 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(
    `Période : ${formatDate(meta.periodFrom)} au ${formatDate(meta.periodTo)}`,
    PAGE_W - MARGIN, 18.5, { align: 'right' }
  );

  doc.setFontSize(7);
  doc.text(`Généré le ${formatDateTime(new Date())}`, PAGE_W - MARGIN, 23, { align: 'right' });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 26, PAGE_W - MARGIN, 26);
}

function drawFooter(doc: jsPDF) {
  const y = PAGE_H - 12;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('CEOZEN — Rapport confidentiel généré automatiquement', MARGIN, y + 5);
}

function drawPageNumbers(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} / ${total}`, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });
  }
}

function ensureSpace(doc: jsPDF, y: number, needed: number, meta: { periodFrom: string; periodTo: string }): number {
  if (y + needed > PAGE_H - 20) {
    doc.addPage();
    drawHeader(doc, meta);
    drawFooter(doc);
    return 32;
  }
  return y;
}

function sectionTitle(doc: jsPDF, text: string, y: number, color: [number, number, number] = NAVY): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...color);
  doc.text(text, MARGIN, y);
  return y + 6;
}

function drawKpiBox(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, accent: [number, number, number]
) {
  doc.setFillColor(...LIGHT);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD');

  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 1.4, h, 0.7, 0.7, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(label, x + 5, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...NAVY);
  doc.text(value, x + 5, y + 15.5);
}

export async function generateReportPDF(data: ReportPdfData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const meta = { periodFrom: data.periodFrom, periodTo: data.periodTo };

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
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Aucune vente sur la période.', MARGIN, y + 2);
    y += 10;
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
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Aucune dépense sur la période.', MARGIN, y + 2);
    y += 10;
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
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Aucune vente sur la période.', MARGIN, y + 2);
    y += 10;
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
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Aucun produit en stock.', MARGIN, y + 2);
  }

  drawPageNumbers(doc);
  doc.save(`ceozen-rapport-${data.periodFrom}-${data.periodTo}.pdf`);
}
