// ============================================================
// CEOZEN — Notifications par email (Resend)
// ============================================================
// Variables d'environnement requises :
//   RESEND_API_KEY   → clé API Resend (re_xxxx)
//   NOTIFY_EMAIL     → email destinataire du gérant
// ============================================================

import { Resend } from 'resend';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

async function sendEmail(subject: string, html: string): Promise<boolean> {
  const primary = process.env.NOTIFY_EMAIL;
  if (!process.env.RESEND_API_KEY || !primary) {
    console.warn('[Notify] Variables d\'environnement manquantes — notification ignorée');
    return false;
  }

  // Destinataires : NOTIFY_EMAIL + NOTIFY_EMAIL_CC (optionnel, séparés par virgule)
  const extras = process.env.NOTIFY_EMAIL_CC
    ? process.env.NOTIFY_EMAIL_CC.split(',').map(e => e.trim()).filter(Boolean)
    : [];
  const to = [primary, ...extras];

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: 'CEOZEN <onboarding@resend.dev>',
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[Notify] Erreur Resend:', error);
      return false;
    }
    console.log('[Notify] Email envoyé :', subject);
    return true;
  } catch (e) {
    console.error('[Notify] Erreur réseau:', e);
    return false;
  }
}

// ── Template HTML de base ─────────────────────────────────────────────────────

function emailTemplate(title: string, emoji: string, color: string, rows: [string, string][]): string {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 12px;color:#94a3b8;font-size:14px;border-bottom:1px solid #1e293b;">${label}</td>
        <td style="padding:8px 12px;color:#f1f5f9;font-size:14px;font-weight:600;border-bottom:1px solid #1e293b;text-align:right;">${value}</td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#0f172a;border-radius:12px;overflow:hidden;border:1px solid #1e293b;">
    <div style="background:${color};padding:20px 24px;">
      <span style="font-size:28px;">${emoji}</span>
      <div style="display:inline-block;vertical-align:middle;margin-left:12px;">
        <div style="color:#fff;font-size:18px;font-weight:700;">${title}</div>
        <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:2px;">CEOZEN by SenseLab</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${rowsHtml}
    </table>
    <div style="padding:16px 24px;text-align:center;color:#475569;font-size:12px;">
      ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}
    </div>
  </div>
</body>
</html>`;
}

// ── Notifications métier ──────────────────────────────────────────────────────

export async function notifyVente(data: {
  sale_number: string;
  client_name?: string;
  total: number;
  payment_method: string;
  seller_name: string;
  items_count: number;
}) {
  const html = emailTemplate('Nouvelle vente', '🛒', 'linear-gradient(135deg,#0ea5e9,#6366f1)', [
    ['N° vente', data.sale_number],
    ['Client', data.client_name ?? 'Anonyme'],
    ['Articles', String(data.items_count)],
    ['Paiement', data.payment_method],
    ['Vendeur', data.seller_name],
    ['Montant total', fmt(data.total)],
  ]);
  return sendEmail(`🛒 Vente ${data.sale_number} — ${fmt(data.total)}`, html);
}

export async function notifyAvoir(data: {
  avoir_number: string;
  sale_number: string;
  client_name?: string;
  total: number;
  reason: string;
}) {
  const html = emailTemplate('Avoir / Remboursement', '↩️', 'linear-gradient(135deg,#f59e0b,#ef4444)', [
    ['N° avoir', data.avoir_number],
    ['Vente liée', data.sale_number],
    ['Client', data.client_name ?? 'Anonyme'],
    ['Motif', data.reason],
    ['Montant', fmt(data.total)],
  ]);
  return sendEmail(`↩️ Avoir ${data.avoir_number} — ${fmt(data.total)}`, html);
}

export async function notifyDepense(data: {
  description: string;
  amount: number;
  category: string;
  payment_method: string;
}) {
  const html = emailTemplate('Dépense enregistrée', '💸', 'linear-gradient(135deg,#ef4444,#b91c1c)', [
    ['Description', data.description],
    ['Catégorie', data.category],
    ['Paiement', data.payment_method],
    ['Montant', fmt(data.amount)],
  ]);
  return sendEmail(`💸 Dépense — ${data.description} (${fmt(data.amount)})`, html);
}

export async function notifyTroc(data: {
  troc_number: string;
  client_name?: string;
  product_given: string;
  product_received: string;
  complement: number;
  payment_method: string;
}) {
  const html = emailTemplate('Troc enregistré', '🔄', 'linear-gradient(135deg,#8b5cf6,#6366f1)', [
    ['N° troc', data.troc_number],
    ['Client', data.client_name ?? 'Anonyme'],
    ['Article cédé', data.product_given],
    ['Article reçu', data.product_received],
    ['Complément', fmt(data.complement)],
    ['Paiement', data.payment_method],
  ]);
  return sendEmail(`🔄 Troc ${data.troc_number} — ${data.client_name ?? 'Anonyme'}`, html);
}

export async function notifyEntreeStock(data: {
  product_name: string;
  qty: number;
  new_stock: number;
}) {
  const html = emailTemplate('Entrée de stock', '📦', 'linear-gradient(135deg,#10b981,#059669)', [
    ['Produit', data.product_name],
    ['Quantité ajoutée', `+${data.qty}`],
    ['Stock actuel', String(data.new_stock)],
  ]);
  return sendEmail(`📦 Entrée stock — ${data.product_name} (+${data.qty})`, html);
}

export async function notifySortieStock(data: {
  product_name: string;
  qty: number;
  new_stock: number;
  is_low_stock: boolean;
}) {
  if (data.is_low_stock) {
    return notifyAlertStock({
      product_name: data.product_name,
      stock_qty: data.new_stock,
      stock_min: data.new_stock,
    });
  }
  const html = emailTemplate('Sortie de stock', '📤', 'linear-gradient(135deg,#f59e0b,#d97706)', [
    ['Produit', data.product_name],
    ['Quantité retirée', `-${data.qty}`],
    ['Stock actuel', String(data.new_stock)],
  ]);
  return sendEmail(`📤 Sortie stock — ${data.product_name} (-${data.qty})`, html);
}

export async function notifyAlertStock(data: {
  product_name: string;
  stock_qty: number;
  stock_min: number;
}) {
  const html = emailTemplate('Alerte stock bas', '⚠️', 'linear-gradient(135deg,#ef4444,#f59e0b)', [
    ['Produit', data.product_name],
    ['Stock restant', String(data.stock_qty)],
    ['Seuil minimum', String(data.stock_min)],
  ]);
  return sendEmail(`⚠️ Stock bas — ${data.product_name} (${data.stock_qty} restant)`, html);
}
