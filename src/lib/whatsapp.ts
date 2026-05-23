// ============================================================
// CEOZEN — WhatsApp Cloud API (Meta) — Templates approuvés
// ============================================================
// Variables d'environnement requises dans .env.local :
//   WHATSAPP_TOKEN        → System User Token permanent
//   WHATSAPP_PHONE_ID     → Phone Number ID
//   WHATSAPP_RECIPIENT    → Numéro destinataire (+22962369645)
// ============================================================

const WA_API_URL = 'https://graph.facebook.com/v19.0';

// ── Fonction interne : envoyer un template ────────────────────────────────────

async function sendTemplate(
  templateName: string,
  params: string[]
): Promise<boolean> {
  const token     = process.env.WHATSAPP_TOKEN;
  const phoneId   = process.env.WHATSAPP_PHONE_ID;
  const recipient = process.env.WHATSAPP_RECIPIENT;

  if (!token || !phoneId || !recipient) {
    console.warn('[WhatsApp] Variables d\'environnement manquantes — notification ignorée');
    return false;
  }

  const parameters = params.map((text) => ({ type: 'text', text }));

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
        type:              'template',
        template: {
          name:     templateName,
          language: { code: 'fr' },
          components: [
            {
              type:       'body',
              parameters,
            },
          ],
        },
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n));
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
  return sendTemplate('ceozen_vente', [
    data.sale_number,
    data.client_name ?? 'Anonyme',
    String(data.items_count),
    data.payment_method,
    fmt(data.total),
    data.seller_name,
  ]);
}

export async function notifyAvoir(data: {
  avoir_number: string;
  sale_number: string;
  client_name?: string;
  total: number;
  reason: string;
}) {
  return sendTemplate('ceozen_avoir', [
    data.avoir_number,
    data.sale_number,
    data.client_name ?? 'Anonyme',
    data.reason,
    fmt(data.total),
  ]);
}

export async function notifyDepense(data: {
  description: string;
  amount: number;
  category: string;
  payment_method: string;
}) {
  return sendTemplate('ceozen_depense', [
    data.description,
    data.category,
    data.payment_method,
    fmt(data.amount),
  ]);
}

export async function notifyTroc(data: {
  troc_number: string;
  client_name?: string;
  product_given: string;
  product_received: string;
  complement: number;
  payment_method: string;
}) {
  return sendTemplate('ceozen_troc', [
    data.troc_number,
    data.client_name ?? 'Anonyme',
    data.product_given,
    data.product_received,
    fmt(data.complement),
    data.payment_method,
  ]);
}

export async function notifyEntreeStock(data: {
  product_name: string;
  qty: number;
  new_stock: number;
}) {
  // Réutilise le template dépense pour les mouvements de stock
  return sendTemplate('ceozen_depense', [
    `Entree stock : ${data.product_name}`,
    'Stock',
    `+${data.qty} unites`,
    String(data.new_stock),
  ]);
}

export async function notifySortieStock(data: {
  product_name: string;
  qty: number;
  new_stock: number;
  is_low_stock: boolean;
}) {
  if (data.is_low_stock) {
    return sendTemplate('ceozen_alerte_stock', [
      data.product_name,
      String(data.new_stock),
      'Seuil atteint',
    ]);
  }
  return sendTemplate('ceozen_depense', [
    `Sortie stock : ${data.product_name}`,
    'Stock',
    `-${data.qty} unites`,
    String(data.new_stock),
  ]);
}

export async function notifyAlertStock(data: {
  product_name: string;
  stock_qty: number;
  stock_min: number;
}) {
  return sendTemplate('ceozen_alerte_stock', [
    data.product_name,
    String(data.stock_qty),
    String(data.stock_min),
  ]);
}
