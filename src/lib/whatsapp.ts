// ============================================================
// CEOZEN — WhatsApp Cloud API (Meta) — Token permanent
// ============================================================
// Variables d'environnement requises dans .env.local :
//   WHATSAPP_TOKEN        → System User Token permanent (Meta Business)
//   WHATSAPP_PHONE_ID     → Phone Number ID (dashboard Meta for Developers)
//   WHATSAPP_RECIPIENT    → Numéro destinataire avec indicatif (+22962369645)
// ============================================================

const WA_API_URL = 'https://graph.facebook.com/v19.0';

async function sendWhatsApp(message: string): Promise<boolean> {
  const token     = process.env.WHATSAPP_TOKEN;
  const phoneId   = process.env.WHATSAPP_PHONE_ID;
  const recipient = process.env.WHATSAPP_RECIPIENT;

  if (!token || !phoneId || !recipient) {
    console.warn('[WhatsApp] Variables d\'environnement manquantes — notification ignorée');
    return false;
  }

  try {
    const res = await fetch(`${WA_API_URL}/${phoneId}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:                recipient,
        type:              'text',
        text:              { body: message },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      console.error('[WhatsApp] Erreur API Meta:', JSON.stringify(json));
      return false;
    }
    console.log('[WhatsApp] Succès Meta:', JSON.stringify(json));
    return true;
  } catch (e) {
    console.error('[WhatsApp] Erreur réseau:', e);
    return false;
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

function now() {
  return new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Messages métier ───────────────────────────────────────────────────────────

export async function notifyVente(data: {
  sale_number: string;
  client_name?: string;
  total: number;
  payment_method: string;
  seller_name: string;
  items_count: number;
}) {
  const msg =
    `🛒 *NOUVELLE VENTE — CEOZEN*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 N° : *${data.sale_number}*\n` +
    `👤 Client : ${data.client_name ?? 'Anonyme'}\n` +
    `🛍️ Articles : ${data.items_count}\n` +
    `💳 Paiement : ${data.payment_method}\n` +
    `💰 *Total : ${fmt(data.total)}*\n` +
    `👨‍💼 Vendeur : ${data.seller_name}\n` +
    `🕐 ${now()}`;
  return sendWhatsApp(msg);
}

export async function notifyAvoir(data: {
  avoir_number: string;
  sale_number: string;
  client_name?: string;
  total: number;
  reason: string;
}) {
  const msg =
    `🔄 *AVOIR CRÉÉ — CEOZEN*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 N° Avoir : *${data.avoir_number}*\n` +
    `🔗 Vente : ${data.sale_number}\n` +
    `👤 Client : ${data.client_name ?? 'Anonyme'}\n` +
    `💬 Motif : ${data.reason}\n` +
    `💰 *Remboursement : -${fmt(data.total)}*\n` +
    `🕐 ${now()}`;
  return sendWhatsApp(msg);
}

export async function notifyDepense(data: {
  description: string;
  amount: number;
  category: string;
  payment_method: string;
}) {
  const msg =
    `💸 *DÉPENSE ENREGISTRÉE — CEOZEN*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📝 : ${data.description}\n` +
    `🏷️ Catégorie : ${data.category}\n` +
    `💳 Paiement : ${data.payment_method}\n` +
    `💰 *Montant : ${fmt(data.amount)}*\n` +
    `🕐 ${now()}`;
  return sendWhatsApp(msg);
}

export async function notifyEntreeStock(data: {
  product_name: string;
  qty: number;
  new_stock: number;
}) {
  const msg =
    `📦 *ENTRÉE EN STOCK — CEOZEN*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📱 Produit : *${data.product_name}*\n` +
    `➕ Quantité ajoutée : ${data.qty}\n` +
    `📊 Stock total : ${data.new_stock} unité(s)\n` +
    `🕐 ${now()}`;
  return sendWhatsApp(msg);
}

export async function notifySortieStock(data: {
  product_name: string;
  qty: number;
  new_stock: number;
  is_low_stock: boolean;
}) {
  const alerte = data.is_low_stock ? '\n⚠️ *STOCK FAIBLE — Penser à réapprovisionner !*' : '';
  const msg =
    `📤 *SORTIE DE STOCK — CEOZEN*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📱 Produit : *${data.product_name}*\n` +
    `➖ Quantité sortie : ${data.qty}\n` +
    `📊 Stock restant : ${data.new_stock} unité(s)` +
    alerte + `\n🕐 ${now()}`;
  return sendWhatsApp(msg);
}

export async function notifyTroc(data: {
  troc_number: string;
  client_name?: string;
  product_given: string;
  product_received: string;
  complement: number;
  payment_method: string;
}) {
  const msg =
    `🔁 *TROC ENREGISTRÉ — CEOZEN*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 N° : *${data.troc_number}*\n` +
    `👤 Client : ${data.client_name ?? 'Anonyme'}\n` +
    `📤 Donné : ${data.product_given}\n` +
    `📥 Repris : ${data.product_received}\n` +
    `💳 Paiement : ${data.payment_method}\n` +
    `💰 *Complément : ${fmt(data.complement)}*\n` +
    `🕐 ${now()}`;
  return sendWhatsApp(msg);
}

export async function notifyAlertStock(data: {
  product_name: string;
  stock_qty: number;
  stock_min: number;
}) {
  const msg =
    `⚠️ *ALERTE STOCK FAIBLE — CEOZEN*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📱 Produit : *${data.product_name}*\n` +
    `📊 Stock actuel : *${data.stock_qty}* unité(s)\n` +
    `🔴 Seuil minimum : ${data.stock_min}\n` +
    `👉 Penser à réapprovisionner !\n` +
    `🕐 ${now()}`;
  return sendWhatsApp(msg);
}
