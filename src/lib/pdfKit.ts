// ============================================================
// CEOZEN — Utilitaires PDF partagés (jsPDF)
// ============================================================

import { jsPDF } from 'jspdf';
import { formatDateTime } from '@/lib/utils';

export const MARGIN = 14;
export const PAGE_W = 210;
export const PAGE_H = 297;

export const NAVY: [number, number, number]   = [15, 23, 42];
export const MUTED: [number, number, number]  = [100, 116, 139];
export const BLUE: [number, number, number]   = [3, 105, 161];
export const VIOLET: [number, number, number] = [109, 40, 217];
export const GREEN: [number, number, number]  = [5, 150, 105];
export const RED: [number, number, number]    = [220, 38, 38];
export const ORANGE: [number, number, number] = [217, 119, 6];
export const LIGHT: [number, number, number]  = [241, 245, 249];
export const BORDER: [number, number, number] = [226, 232, 240];

// Intl.NumberFormat('fr-FR') groups digits with a narrow no-break space (U+202F),
// which the core PDF Helvetica font (WinAnsi encoding) can't render. Group manually
// with a plain ASCII space instead.
export function fmtNum(n: number): string {
  const rounded = Math.round(n);
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (rounded < 0 ? '-' : '') + grouped;
}

export function fmt(n: number): string {
  return fmtNum(n) + ' FCFA';
}

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M FCFA';
  if (abs >= 1_000) return (n / 1_000).toFixed(0) + ' k FCFA';
  return fmt(n);
}

export interface PdfHeaderMeta {
  title: string;
  subtitle: string;
  logo?: string; // PNG data URL, preloaded via loadKtechLogoDataUrl()
}

// jsPDF can't embed SVG directly — rasterize the K-Tech logo to a PNG data URL
// once (in the browser) and reuse it on every header draw. Cached across calls
// within the same page session.
let cachedLogoDataUrl: string | null = null;

export async function loadKtechLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;

  const svgText = await fetch('/ktech-logo-blue.svg').then((r) => r.text());
  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Impossible de charger le logo K-Tech'));
    img.src = svgUrl;
  });

  const scale = 4; // supersample for a crisp print
  const canvas = document.createElement('canvas');
  canvas.width = (img.naturalWidth || 320) * scale;
  canvas.height = (img.naturalHeight || 160) * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(svgUrl);

  cachedLogoDataUrl = canvas.toDataURL('image/png');
  return cachedLogoDataUrl;
}

export function drawHeader(doc: jsPDF, meta: PdfHeaderMeta) {
  if (meta.logo) {
    doc.addImage(meta.logo, 'PNG', MARGIN, 5, 30, 15);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...BLUE);
    doc.text('CEOZEN', MARGIN, 15);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('by Tech big', MARGIN, 20);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(meta.title, PAGE_W - MARGIN, 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(meta.subtitle, PAGE_W - MARGIN, 18.5, { align: 'right' });

  doc.setFontSize(7);
  doc.text(`Généré le ${formatDateTime(new Date())}`, PAGE_W - MARGIN, 23, { align: 'right' });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 26, PAGE_W - MARGIN, 26);
}

export function drawFooter(doc: jsPDF) {
  const y = PAGE_H - 12;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('CEOZEN — Rapport confidentiel généré automatiquement', MARGIN, y + 5);
}

export function drawPageNumbers(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} / ${total}`, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' });
  }
}

export function ensureSpace(doc: jsPDF, y: number, needed: number, meta: PdfHeaderMeta): number {
  if (y + needed > PAGE_H - 20) {
    doc.addPage();
    drawHeader(doc, meta);
    drawFooter(doc);
    return 32;
  }
  return y;
}

export function sectionTitle(doc: jsPDF, text: string, y: number, color: [number, number, number] = NAVY): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...color);
  doc.text(text, MARGIN, y);
  return y + 6;
}

export function drawKpiBox(
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

export function emptyStateText(doc: jsPDF, text: string, y: number): number {
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(text, MARGIN, y + 2);
  return y + 10;
}
