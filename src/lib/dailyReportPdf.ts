// ============================================================
// CEOZEN — Génération PDF du rapport journalier (clôture du jour)
// ============================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PAYMENT_LABELS, type PaymentMethod } from '@/types';
import {
  MARGIN, PAGE_W, NAVY, MUTED, BLUE, VIOLET, GREEN, RED, ORANGE, LIGHT,
  fmtNum, fmtCompact, drawHeader, drawFooter, drawPageNumbers,
  ensureSpace, sectionTitle, drawKpiBox, emptyStateText, type PdfHeaderMeta,
} from '@/lib/pdfKit';

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function payLabel(pm: string): string {
  return PAYMENT_LABELS[pm as PaymentMethod] ?? pm;
}

export interface DailySaleRow {
  created_at: string;
  sale_number: string;
  client_name?: string | null;
  seller_name: string;
  payment_method: string;
  total: number;
  is_avoir?: boolean;
}

export interface DailyTrocRow {
  created_at: string;
  troc_number: string;
  client_name?: string | null;
  product_given_name: string;
  product_received_name: string;
  complement: number;
  payment_method: string;
}

export interface DailyExpenseRow {
  created_at: string;
  category_name: string;
  description: string;
  amount: number;
  payment_method: string;
}

export interface DailyTreasuryRow {
  name: string;
  soldeDebut: number;
  entrees: number;
  sorties: number;
  soldeFin: number;
}

export interface DailyCreditRow {
  type: 'Créance' | 'Dette';
  reference: string;
  party: string;
  amount: number;
  due_date?: string | null;
}

export interface DailySellerRow {
  seller_name: string;
  sale_count: number;
  total_revenue: number;
}

export interface DailyReportData {
  date: string; // YYYY-MM-DD
  revenue: number;
  expenses: number;
  salesCount: number;
  avgSale: number;
  trocsCount: number;
  trocsRevenue: number;
  sales: DailySaleRow[];
  trocs: DailyTrocRow[];
  dailyExpenses: DailyExpenseRow[];
  treasury: DailyTreasuryRow[];
  newCredits: DailyCreditRow[];
  sellerStats: DailySellerRow[];
}

export async function generateDailyReportPDF(data: DailyReportData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date(data.date + 'T12:00:00'));

  const meta: PdfHeaderMeta = {
    title: 'Rapport journalier',
    subtitle: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1),
  };

  drawHeader(doc, meta);
  drawFooter(doc);

  const margin = data.revenue - data.expenses;

  // ── KPIs ──────────────────────────────────────────────────
  let y = sectionTitle(doc, "Résumé du jour", 33);

  const gap = 4;
  const boxW = (PAGE_W - 2 * MARGIN - 2 * gap) / 3;
  const boxH = 20;

  const kpis: { label: string; value: string; accent: [number, number, number] }[] = [
    { label: "Chiffre d'affaires", value: fmtCompact(data.revenue), accent: BLUE },
    { label: 'Dépenses', value: fmtCompact(data.expenses), accent: ORANGE },
    { label: 'Marge', value: fmtCompact(margin), accent: margin >= 0 ? GREEN : RED },
    { label: 'Nombre de ventes', value: data.salesCount.toLocaleString('fr-FR'), accent: VIOLET },
    { label: 'Panier moyen', value: fmtCompact(data.avgSale), accent: MUTED },
    { label: `Trocs (${data.trocsCount})`, value: fmtCompact(data.trocsRevenue), accent: VIOLET },
  ];

  kpis.forEach((kpi, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = MARGIN + col * (boxW + gap);
    const by = y + row * (boxH + gap);
    drawKpiBox(doc, x, by, boxW, boxH, kpi.label, kpi.value, kpi.accent);
  });

  y = y + 2 * (boxH + gap) + 4;

  // ── Ventes du jour ────────────────────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Ventes du jour', y, BLUE);

  if (data.sales.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Heure', 'N°', 'Client', 'Vendeur', 'Paiement', 'Montant (FCFA)']],
      body: data.sales.map((s) => [
        fmtTime(s.created_at),
        s.sale_number + (s.is_avoir ? ' (avoir)' : ''),
        s.client_name || 'Anonyme',
        s.seller_name,
        payLabel(s.payment_method),
        (s.is_avoir ? '-' : '') + fmtNum(Math.abs(s.total)),
      ]),
      theme: 'plain',
      styles: { fontSize: 8, textColor: NAVY, cellPadding: 2 },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 16 },
        5: { cellWidth: 32, halign: 'right' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && data.sales[hookData.row.index]?.is_avoir) {
          hookData.cell.styles.textColor = RED;
        }
      },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  } else {
    y = emptyStateText(doc, 'Aucune vente aujourd\'hui.', y);
  }

  // ── Trocs du jour ─────────────────────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Trocs du jour', y, VIOLET);

  if (data.trocs.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Heure', 'N°', 'Client', 'Remis', 'Repris', 'Complément (FCFA)']],
      body: data.trocs.map((t) => [
        fmtTime(t.created_at), t.troc_number, t.client_name || 'Anonyme',
        t.product_given_name, t.product_received_name, fmtNum(t.complement),
      ]),
      theme: 'plain',
      styles: { fontSize: 8, textColor: NAVY, cellPadding: 2 },
      headStyles: { fillColor: VIOLET, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 16 },
        5: { cellWidth: 32, halign: 'right' },
      },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  } else {
    y = emptyStateText(doc, 'Aucun troc aujourd\'hui.', y);
  }

  // ── Dépenses du jour ──────────────────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Dépenses du jour', y, ORANGE);

  if (data.dailyExpenses.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Heure', 'Catégorie', 'Description', 'Paiement', 'Montant (FCFA)']],
      body: data.dailyExpenses.map((e) => [
        fmtTime(e.created_at), e.category_name, e.description, payLabel(e.payment_method), fmtNum(e.amount),
      ]),
      theme: 'plain',
      styles: { fontSize: 8, textColor: NAVY, cellPadding: 2 },
      headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 16 },
        4: { cellWidth: 32, halign: 'right' },
      },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  } else {
    y = emptyStateText(doc, 'Aucune dépense aujourd\'hui.', y);
  }

  // ── Réconciliation trésorerie ─────────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Réconciliation trésorerie', y, BLUE);

  if (data.treasury.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Compte', 'Solde début', 'Entrées', 'Sorties', 'Solde fin (FCFA)']],
      body: data.treasury.map((t) => [
        t.name, fmtNum(t.soldeDebut),
        t.entrees > 0 ? '+' + fmtNum(t.entrees) : '0',
        t.sorties > 0 ? '-' + fmtNum(t.sorties) : '0',
        fmtNum(t.soldeFin),
      ]),
      theme: 'plain',
      styles: { fontSize: 8.5, textColor: NAVY, cellPadding: 2.2 },
      headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      foot: [['Total', '', '', '', fmtNum(data.treasury.reduce((s, t) => s + t.soldeFin, 0))]],
      footStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'right' },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  } else {
    y = emptyStateText(doc, 'Aucun compte de trésorerie configuré.', y);
  }

  // ── Nouvelles créances & dettes du jour ───────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Nouvelles créances & dettes du jour', y, VIOLET);

  if (data.newCredits.length) {
    autoTable(doc, {
      startY: y,
      margin: { top: 30, left: MARGIN, right: MARGIN },
      head: [['Type', 'Référence', 'Client / Fournisseur', 'Échéance', 'Montant (FCFA)']],
      body: data.newCredits.map((c) => [
        c.type, c.reference, c.party, c.due_date ? new Date(c.due_date).toLocaleDateString('fr-FR') : '—', fmtNum(c.amount),
      ]),
      theme: 'plain',
      styles: { fontSize: 8.5, textColor: NAVY, cellPadding: 2.2 },
      headStyles: { fillColor: VIOLET, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        4: { cellWidth: 32, halign: 'right' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 0) {
          const v = hookData.cell.raw as string;
          hookData.cell.styles.textColor = v === 'Dette' ? RED : GREEN;
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  } else {
    y = emptyStateText(doc, 'Aucune nouvelle créance ou dette aujourd\'hui.', y);
  }

  // ── Performance vendeurs du jour ──────────────────────────
  y = ensureSpace(doc, y, 20, meta);
  y = sectionTitle(doc, 'Performance vendeurs du jour', y, VIOLET);

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
  } else {
    emptyStateText(doc, 'Aucune vente aujourd\'hui.', y);
  }

  drawPageNumbers(doc);
  doc.save(`ceozen-rapport-journalier-${data.date}.pdf`);
}
