// ============================================================
// CEOZEN — Génération PDF du point financier (réconciliation trésorerie du jour)
// ============================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  MARGIN, PAGE_W, NAVY, MUTED, BLUE, GREEN, RED, ORANGE, LIGHT, BORDER,
  fmtNum, fmtCompact, drawHeader, drawFooter, drawPageNumbers,
  sectionTitle, drawKpiBox, emptyStateText,
  loadKtechLogoDataUrl, type PdfHeaderMeta,
} from '@/lib/pdfKit';

export interface PointFinancierAccountRow {
  name: string;
  soldeInitial: number;
  encaissementVentes: number;
  complementTrocs: number;
  apportsDG: number;
  reglementsClients: number;
  decaissementsAchats: number;
  decaissementsTrocs: number;
  retraitDG: number;
  autresDepenses: number;
  soldeFinal: number;
}

export interface PointFinancierData {
  date: string; // YYYY-MM-DD
  accounts: PointFinancierAccountRow[];
}

type RowKind = 'anchor' | 'detail' | 'subtotal-in' | 'subtotal-out';

interface TableRow {
  label: string;
  kind: RowKind;
  values: number[]; // one per account, same order as data.accounts
}

function cellText(n: number): string {
  return n === 0 ? '—' : fmtNum(n);
}

export async function generatePointFinancierPDF(data: PointFinancierData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadKtechLogoDataUrl().catch(() => undefined);

  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(new Date(data.date + 'T12:00:00'));

  const meta: PdfHeaderMeta = {
    title: 'Point financier',
    subtitle: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1),
    logo,
  };

  drawHeader(doc, meta);
  drawFooter(doc);

  const accounts = data.accounts;
  const totalSoldeInitial = accounts.reduce((s, a) => s + a.soldeInitial, 0);
  const totalEntrees = accounts.reduce(
    (s, a) => s + a.encaissementVentes + a.complementTrocs + a.apportsDG + a.reglementsClients, 0
  );
  const totalSorties = accounts.reduce(
    (s, a) => s + a.decaissementsAchats + a.decaissementsTrocs + a.retraitDG + a.autresDepenses, 0
  );
  const totalSoldeFinal = accounts.reduce((s, a) => s + a.soldeFinal, 0);

  // ── KPIs ──────────────────────────────────────────────────
  let y = sectionTitle(doc, 'Résumé global', 33);

  const gap = 4;
  const boxW = (PAGE_W - 2 * MARGIN - 3 * gap) / 4;
  const boxH = 20;

  const kpis: { label: string; value: string; accent: [number, number, number] }[] = [
    { label: 'Solde initial',   value: fmtCompact(totalSoldeInitial), accent: NAVY },
    { label: "Total entrées",   value: fmtCompact(totalEntrees),      accent: GREEN },
    { label: 'Total sorties',   value: fmtCompact(totalSorties),      accent: RED },
    { label: 'Solde final',     value: fmtCompact(totalSoldeFinal),   accent: BLUE },
  ];

  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (boxW + gap);
    drawKpiBox(doc, x, y, boxW, boxH, kpi.label, kpi.value, kpi.accent);
  });

  y += boxH + 10;

  // ── Table de réconciliation ──────────────────────────────────
  y = sectionTitle(doc, 'Réconciliation par compte', y, BLUE);

  if (!accounts.length) {
    emptyStateText(doc, 'Aucun compte de trésorerie configuré.', y);
    drawPageNumbers(doc);
    doc.save(`ceozen-point-financier-${data.date}.pdf`);
    return;
  }

  const rows: TableRow[] = [
    { label: 'Solde initial',                          kind: 'anchor',       values: accounts.map(a => a.soldeInitial) },
    { label: 'Encaissement sur ventes de la journée',   kind: 'detail',       values: accounts.map(a => a.encaissementVentes) },
    { label: 'Complément reçus sur trocs',              kind: 'detail',       values: accounts.map(a => a.complementTrocs) },
    { label: 'Apports DG',                              kind: 'detail',       values: accounts.map(a => a.apportsDG) },
    { label: 'Règlements clients reçus ce jour',        kind: 'detail',       values: accounts.map(a => a.reglementsClients) },
    { label: "Total des entrées d'argent",              kind: 'subtotal-in',  values: accounts.map(a => a.encaissementVentes + a.complementTrocs + a.apportsDG + a.reglementsClients) },
    { label: 'Décaissements sur achats de téléphones',  kind: 'detail',       values: accounts.map(a => a.decaissementsAchats) },
    { label: 'Décaissements sur trocs réalisés',        kind: 'detail',       values: accounts.map(a => a.decaissementsTrocs) },
    { label: 'Retrait DG',                              kind: 'detail',       values: accounts.map(a => a.retraitDG) },
    { label: 'Autres dépenses',                         kind: 'detail',       values: accounts.map(a => a.autresDepenses) },
    { label: 'Total des sorties d\'argent',             kind: 'subtotal-out', values: accounts.map(a => a.decaissementsAchats + a.decaissementsTrocs + a.retraitDG + a.autresDepenses) },
    { label: 'Solde Final',                             kind: 'anchor',       values: accounts.map(a => a.soldeFinal) },
  ];

  autoTable(doc, {
    startY: y,
    margin: { top: 30, left: MARGIN, right: MARGIN },
    head: [['', ...accounts.map(a => a.name), 'Total']],
    body: rows.map(r => [r.label, ...r.values.map(cellText), fmtNum(r.values.reduce((s, v) => s + v, 0))]),
    theme: 'plain',
    styles: { fontSize: 8.5, textColor: NAVY, cellPadding: 2.6, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 62, halign: 'left' },
      [accounts.length + 1]: { fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body') return;
      const row = rows[hookData.row.index];
      const isLabelCol = hookData.column.index === 0;
      const isTotalCol = hookData.column.index === accounts.length + 1;
      if (!isLabelCol) hookData.cell.styles.halign = 'right';
      if (!isLabelCol && hookData.cell.raw === '—') hookData.cell.styles.textColor = [180, 188, 199];

      if (row.kind === 'anchor') {
        hookData.cell.styles.fillColor = NAVY;
        hookData.cell.styles.textColor = 255;
        hookData.cell.styles.fontStyle = 'bold';
      } else if (row.kind === 'subtotal-in') {
        hookData.cell.styles.fillColor = [220, 245, 235];
        hookData.cell.styles.textColor = GREEN;
        hookData.cell.styles.fontStyle = 'bold';
      } else if (row.kind === 'subtotal-out') {
        hookData.cell.styles.fillColor = [253, 226, 226];
        hookData.cell.styles.textColor = RED;
        hookData.cell.styles.fontStyle = 'bold';
      } else {
        hookData.cell.styles.fillColor = hookData.row.index % 2 === 0 ? 255 : LIGHT;
        if (isTotalCol) hookData.cell.styles.textColor = MUTED;
      }
    },
    didDrawPage: () => { drawHeader(doc, meta); drawFooter(doc); },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    "« Décaissements sur trocs réalisés » correspond aux trocs où le magasin a reversé de l'argent au client (valeur reprise > valeur remise).",
    MARGIN, y
  );

  drawPageNumbers(doc);
  doc.save(`ceozen-point-financier-${data.date}.pdf`);
}
