// ============================================================
// CEOZEN — Utilitaire d'impression (reçus)
// ============================================================

function fmtCFA(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

const RECEIPT_STYLE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 320px;
    margin: 0 auto;
    padding: 16px 8px;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .small  { font-size: 10px; color: #555; }
  .divider-solid { border-top: 1px solid #000; margin: 8px 0; }
  .divider-dash  { border-top: 1px dashed #000; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 3px 4px; vertical-align: top; }
  .total-row td { font-weight: bold; font-size: 14px; padding-top: 6px; }
  .footer {
    margin-top: 12px;
    text-align: center;
    font-size: 10px;
    color: #555;
    line-height: 1.8;
    border-top: 1px solid #000;
    padding-top: 8px;
  }
  .header-wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .logo-box {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 9px;
    color: #aaa;
    text-align: center;
    flex-shrink: 0;
  }
  .boutique-info {
    text-align: right;
    line-height: 1.6;
  }
  .boutique-name {
    font-size: 15px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  @media print {
    @page { margin: 0; size: 80mm auto; }
    body { width: 100%; padding: 4px; }
  }
`;

function openPrintWindow(html: string, title: string) {
  const win = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>${RECEIPT_STYLE}</style>
    </head>
    <body>${html}</body>
    </html>
  `);
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
}

// ── Reçu de vente ────────────────────────────────────────────────────────────
interface SaleReceiptItem {
  name: string;
  reference?: string;
  qty: number;
  unit_price: number;
  discount?: number;
}

interface SaleReceiptData {
  sale_number: string;
  created_at: string;
  client_name?: string;
  seller_name: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  total: number;
  notes?: string;
  items: SaleReceiptItem[];
}

export function printSaleReceipt(data: SaleReceiptData) {
  const date = new Date(data.created_at).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const itemsHTML = data.items.map(item => `
    <tr>
      <td>${item.name}${item.reference ? `<br><span class="small">${item.reference}</span>` : ''}</td>
      <td class="right">${item.qty}</td>
      <td class="right">${fmtCFA(item.unit_price)}</td>
      <td class="right">${fmtCFA(item.qty * item.unit_price - (item.discount ?? 0))}</td>
    </tr>
  `).join('');

  const html = `
    <!-- En-tête : Logo gauche + infos boutique droite -->
    <div class="header-wrap">
      <div class="logo-box">
        <img src="/ktech-logo.svg" alt="K-Tech" style="width:56px;height:56px;object-fit:contain;"
          onerror="this.parentNode.innerHTML='<span>K-TECH</span>'" />
      </div>
      <div class="boutique-info">
        <div class="boutique-name">K-TECH</div>
        <div class="small">Vente &amp; réparation de téléphones</div>
        <div class="small">Cotonou, Bénin</div>
        <div class="small">+229 01 94 17 18 38</div>
      </div>
    </div>

    <div class="divider-solid"></div>

    <table>
      <tr><td class="bold">N° Reçu</td><td class="right bold">${data.sale_number}</td></tr>
      <tr><td class="small">Client</td><td class="right small">${data.client_name ?? 'Client anonyme'}</td></tr>
      <tr><td class="small">Vendeur</td><td class="right small">${data.seller_name}</td></tr>
    </table>

    <div class="divider-dash"></div>

    <table>
      <thead>
        <tr style="border-bottom:1px solid #ccc;">
          <th style="text-align:left;">Article</th>
          <th class="right">Qté</th>
          <th class="right">P.U.</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHTML}</tbody>
    </table>

    <div class="divider-dash"></div>

    <table>
      <tr><td>Sous-total</td><td class="right">${fmtCFA(data.subtotal)}</td></tr>
      ${data.discount > 0 ? `<tr><td>Remise</td><td class="right">- ${fmtCFA(data.discount)}</td></tr>` : ''}
      <tr class="total-row">
        <td>TOTAL</td>
        <td class="right">${fmtCFA(data.total)}</td>
      </tr>
      <tr><td class="small">Paiement</td><td class="right small">${data.payment_method}</td></tr>
    </table>

    ${data.notes ? `<div class="divider-dash"></div><div class="small" style="font-style:italic;">${data.notes}</div>` : ''}

    <div class="footer">
      Merci pour votre confiance !<br>
      <span style="font-size:9px;">Conservez ce reçu comme preuve d'achat</span><br>
      <span style="font-size:9px;color:#999;">Reçu édité par CEOZEN · by SenseLab · ${date}</span>
    </div>
  `;

  openPrintWindow(html, `Reçu ${data.sale_number}`);
}

// ── Reçu de troc ─────────────────────────────────────────────────────────────
interface TrocReceiptData {
  troc_number: string;
  created_at: string;
  client_name?: string;
  client_phone?: string;
  product_given_name: string;
  product_given_price: number;
  product_received_name: string;
  product_received_value: number;
  complement: number;
  payment_method: string;
  notes?: string;
}

export function printTrocReceipt(data: TrocReceiptData) {
  const date = new Date(data.created_at).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const html = `
    <!-- En-tête : Logo gauche + infos boutique droite -->
    <div class="header-wrap">
      <div class="logo-box">
        <img src="/ktech-logo.svg" alt="K-Tech" style="width:56px;height:56px;object-fit:contain;"
          onerror="this.parentNode.innerHTML='<span>K-TECH</span>'" />
      </div>
      <div class="boutique-info">
        <div class="boutique-name">K-TECH</div>
        <div class="small">Vente &amp; réparation de téléphones</div>
        <div class="small">Cotonou, Bénin</div>
        <div class="small">+229 01 94 17 18 38</div>
      </div>
    </div>

    <div class="divider-solid"></div>

    <div class="center bold" style="font-size:13px;margin:4px 0;">REÇU DE TROC</div>

    <table>
      <tr><td class="bold">N° Troc</td><td class="right bold">${data.troc_number}</td></tr>
      <tr><td class="small">Client</td><td class="right small">${data.client_name ?? 'Client anonyme'}</td></tr>
      ${data.client_phone ? `<tr><td class="small">Téléphone</td><td class="right small">${data.client_phone}</td></tr>` : ''}
    </table>

    <div class="divider-dash"></div>

    <div style="margin-bottom:6px;">
      <div class="small" style="text-transform:uppercase;font-weight:bold;margin-bottom:4px;">Téléphone remis au client</div>
      <table>
        <tr>
          <td>${data.product_given_name}</td>
          <td class="right bold">${fmtCFA(data.product_given_price)}</td>
        </tr>
      </table>
    </div>

    <div>
      <div class="small" style="text-transform:uppercase;font-weight:bold;margin-bottom:4px;">Téléphone repris au client</div>
      <table>
        <tr>
          <td>${data.product_received_name}</td>
          <td class="right bold">- ${fmtCFA(data.product_received_value)}</td>
        </tr>
      </table>
    </div>

    <div class="divider-dash"></div>

    <table>
      <tr class="total-row">
        <td>COMPLÉMENT À PAYER</td>
        <td class="right">${fmtCFA(data.complement)}</td>
      </tr>
      <tr><td class="small">Paiement</td><td class="right small">${data.payment_method}</td></tr>
    </table>

    ${data.notes ? `<div class="divider-dash"></div><div class="small" style="font-style:italic;">${data.notes}</div>` : ''}

    <div class="footer">
      Merci pour votre confiance !<br>
      <span style="font-size:9px;">Les deux parties reconnaissent cet échange</span><br>
      <span style="font-size:9px;color:#999;">Reçu édité par CEOZEN · by SenseLab · ${date}</span>
    </div>
  `;

  openPrintWindow(html, `Reçu Troc ${data.troc_number}`);
}
