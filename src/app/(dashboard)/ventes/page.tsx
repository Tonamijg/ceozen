'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCFA, formatDate, cn } from '@/lib/utils';
import { printSaleReceipt } from '@/lib/print';
import type { Product, VSale, Client, SaleItem } from '@/types';
import { PAYMENT_LABELS, PAYMENT_BADGE_CLASS } from '@/types';
import type { PaymentMethod } from '@/types';
import {
  Plus, X, Loader2, ShoppingCart, Search,
  ChevronDown, Trash2, CheckCircle2, AlertCircle,
  UserPlus, RotateCcw, FileX, Eye, Minus, Printer
} from 'lucide-react';

interface AvoirRow {
  id: string;
  avoir_number: string;
  sale_id: string;
  sale_number: string;
  client_name: string | null;
  reason: string;
  total: number;
  created_at: string;
}

interface SaleLineInput {
  product: Product;
  qty: number;
  unit_price: number;
  discount: number;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'especes',      label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'carte',        label: 'Carte bancaire' },
  { value: 'virement',     label: 'Virement' },
  { value: 'credit',       label: 'Crédit (à régler plus tard)' },
];

export default function VentesPage() {
  const supabase = createClient();

  /* ---- État formulaire vente ---- */
  const [showForm,       setShowForm]       = useState(false);
  const [products,       setProducts]       = useState<Product[]>([]);
  const [clients,        setClients]        = useState<Client[]>([]);
  const [search,         setSearch]         = useState('');
  const [clientSearch,   setClientSearch]   = useState('');
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [lines,          setLines]          = useState<SaleLineInput[]>([]);
  const [paymentMethod,  setPaymentMethod]  = useState<PaymentMethod>('especes');
  const [clientName,     setClientName]     = useState('');
  const [clientId,       setClientId]       = useState<string | null>(null);
  const [creditDueDate,  setCreditDueDate]  = useState('');
  const [notes,          setNotes]          = useState('');
  const [saving,         setSaving]         = useState(false);
  const [success,        setSuccess]        = useState('');
  const [error,          setError]          = useState('');

  /* ---- État historique ---- */
  const [sales,          setSales]          = useState<VSale[]>([]);
  const [avoirs,         setAvoirs]         = useState<AvoirRow[]>([]);
  const [loadingSales,   setLoadingSales]   = useState(true);
  const [filterDate,     setFilterDate]     = useState('');

  /* ---- Avoir ---- */
  const [showAvoir,      setShowAvoir]      = useState(false);
  const [avoirSale,      setAvoirSale]      = useState<VSale | null>(null);
  const [avoirReason,    setAvoirReason]    = useState('');
  const [avoirSaving,    setAvoirSaving]    = useState(false);

  /* ---- Détail vente ---- */
  const [showDetail,     setShowDetail]     = useState(false);
  const [detailSale,     setDetailSale]     = useState<VSale | null>(null);
  const [detailItems,    setDetailItems]    = useState<SaleItem[]>([]);
  const [loadingDetail,  setLoadingDetail]  = useState(false);

  /* ---- Rôle utilisateur ---- */
  const [userRole,       setUserRole]       = useState<string>('');
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);
  const [confirmDelete,  setConfirmDelete]  = useState<VSale | null>(null);

  /* ---- Chargements initiaux ---- */
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*, category:product_categories(name)').eq('is_active', true).order('name'),
      supabase.from('clients').select('*').eq('is_active', true).order('name'),
      supabase.auth.getUser().then(({ data: { user } }) =>
        user ? supabase.from('profiles').select('role').eq('id', user.id).single() : null
      ),
    ]).then(([{ data: prods }, { data: cls }, roleRes]) => {
      setProducts((prods as Product[]) ?? []);
      setClients((cls as Client[]) ?? []);
      if (roleRes?.data) setUserRole((roleRes.data as { role: string }).role);
    });
  }, [supabase]);

  /* ---- Chargement ventes + avoirs ---- */
  const loadSales = useCallback(async () => {
    setLoadingSales(true);
    let q = supabase.from('v_sales').select('*').order('created_at', { ascending: false }).limit(100);
    if (filterDate) {
      q = q.gte('created_at', filterDate + 'T00:00:00').lte('created_at', filterDate + 'T23:59:59');
    }
    const { data } = await q;
    setSales((data as VSale[]) ?? []);

    // Avoirs
    const { data: avoirData } = await supabase
      .from('sale_avoirs')
      .select('id, avoir_number, sale_id, reason, total, created_at, sale:sales(sale_number, client_name)')
      .order('created_at', { ascending: false })
      .limit(100);

    setAvoirs((avoirData ?? []).map((a: Record<string, unknown>) => {
      const sale = Array.isArray(a.sale) ? a.sale[0] : a.sale as Record<string,unknown>;
      return {
        id:           a.id as string,
        avoir_number: a.avoir_number as string,
        sale_id:      a.sale_id as string,
        sale_number:  (sale?.sale_number ?? '—') as string,
        client_name:  (sale?.client_name ?? null) as string | null,
        reason:       a.reason as string,
        total:        a.total as number,
        created_at:   a.created_at as string,
      };
    }));

    setLoadingSales(false);
  }, [supabase, filterDate]);

  useEffect(() => { loadSales(); }, [loadSales]);

  /* ---- Calculs ---- */
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const discount = lines.reduce((s, l) => s + l.discount, 0);
  const total    = subtotal - discount;

  /* ---- Gestion lignes ---- */
  function addLine(product: Product) {
    if (product.stock_qty <= 0) {
      setError(`"${product.name}" est en rupture de stock — vente impossible.`);
      setTimeout(() => setError(''), 4000);
      return;
    }
    setLines(prev => {
      const idx = prev.findIndex(l => l.product.id === product.id);
      if (idx >= 0) {
        const alreadyInCart = prev[idx].qty;
        if (alreadyInCart >= product.stock_qty) {
          setError(`Stock insuffisant — seulement ${product.stock_qty} unité(s) disponible(s).`);
          setTimeout(() => setError(''), 4000);
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { product, qty: 1, unit_price: product.sell_price, discount: 0 }];
    });
    setSearch('');
  }

  function removeLine(idx: number) { setLines(prev => prev.filter((_, i) => i !== idx)); }

  function updateLine(idx: number, field: 'qty' | 'unit_price' | 'discount', value: number) {
    setLines(prev => {
      const next = [...prev];
      if (field === 'qty') {
        const stockMax = next[idx].product.stock_qty;
        if (value > stockMax) {
          setError(`Stock insuffisant — seulement ${stockMax} unité(s) disponible(s) pour "${next[idx].product.name}".`);
          setTimeout(() => setError(''), 4000);
          value = stockMax; // plafonne à la valeur max
        }
        if (value < 1) value = 1;
      }
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  /* ---- Sélection client ---- */
  function selectClient(client: Client) {
    setClientId(client.id);
    setClientName(client.name);
    setShowClientDrop(false);
    setClientSearch('');
  }

  function clearClient() { setClientId(null); setClientName(''); }

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone ?? '').includes(clientSearch)
  );

  /* ---- Soumission vente ---- */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return;

    // Vérification finale stock avant soumission
    for (const line of lines) {
      if (line.qty > line.product.stock_qty) {
        setError(`Stock insuffisant pour "${line.product.name}" — ${line.product.stock_qty} dispo, ${line.qty} demandé(s).`);
        setTimeout(() => setError(''), 5000);
        return;
      }
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: sale, error } = await supabase.from('sales').insert({
      seller_id:       user!.id,
      payment_method:  paymentMethod,
      notes:           notes || null,
      client_id:       clientId || null,
      client_name:     clientName || null,
      credit_due_date: paymentMethod === 'credit' ? creditDueDate || null : null,
      is_settled:      paymentMethod !== 'credit',
    }).select('id').single();

    if (error || !sale) { setSaving(false); return; }

    // Auto-sauvegarder le client dans la base s'il est nouveau
    if (clientName && !clientId) {
      await supabase.from('clients')
        .upsert({ name: clientName.trim() }, { onConflict: 'name', ignoreDuplicates: true });
    }

    await supabase.from('sale_items').insert(
      lines.map(l => ({
        sale_id:    sale.id,
        product_id: l.product.id,
        qty:        l.qty,
        unit_price: l.unit_price,
        discount:   l.discount,
      }))
    );

    // Notification WhatsApp
    const { data: { user: seller } } = await supabase.auth.getUser();
    const sellerProfile = seller ? await supabase.from('profiles').select('full_name').eq('id', seller.id).single() : null;
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'vente',
        data: {
          sale_number:    sale.id,
          client_name:    clientName || undefined,
          total,
          payment_method: PAYMENT_LABELS[paymentMethod],
          seller_name:    sellerProfile?.data?.full_name ?? 'Vendeur',
          items_count:    lines.length,
        },
      }),
    }).catch(() => {});

    setSaving(false);
    setSuccess('Vente enregistrée avec succès !');
    setTimeout(() => setSuccess(''), 3000);
    setLines([]);
    setNotes('');
    setClientName('');
    setClientId(null);
    setCreditDueDate('');
    setPaymentMethod('especes');
    setShowForm(false);
    loadSales();
  }

  /* ---- Annulation (avoir) ---- */
  async function handleAvoir(e: React.FormEvent) {
    e.preventDefault();
    if (!avoirSale || !avoirReason.trim()) return;
    setAvoirSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    // Créer l'avoir
    await supabase.from('sale_avoirs').insert({
      sale_id:    avoirSale.id,
      reason:     avoirReason.trim(),
      total:      avoirSale.total,
      created_by: user!.id,
    });

    // Récupérer les lignes de la vente pour remettre en stock
    const { data: items } = await supabase
      .from('sale_items')
      .select('product_id, qty')
      .eq('sale_id', avoirSale.id);

    if (items && items.length > 0) {
      await supabase.from('stock_movements').insert(
        items.map((item: { product_id: string; qty: number }) => ({
          product_id:     item.product_id,
          type:           'entree',
          qty:            item.qty,
          reference_id:   avoirSale.id,
          reference_type: 'avoir',
          notes:          `Avoir sur vente ${avoirSale.sale_number}`,
          created_by:     user!.id,
        }))
      );
    }

    // Notification WhatsApp
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'avoir',
        data: {
          avoir_number: `AV-${Date.now()}`,
          sale_number:  avoirSale.sale_number,
          client_name:  avoirSale.client_name ?? undefined,
          total:        avoirSale.total,
          reason:       avoirReason.trim(),
        },
      }),
    }).catch(() => {});

    setAvoirSaving(false);
    setShowAvoir(false);
    setAvoirSale(null);
    setAvoirReason('');
    setSuccess(`Avoir créé — stock remis à jour automatiquement`);
    setTimeout(() => setSuccess(''), 4000);
    loadSales();
  }

  /* ---- Suppression vente (admin) — via API route service role ---- */
  async function handleDeleteSale(sale: VSale) {
    setDeletingSaleId(sale.id);
    try {
      const res = await fetch('/api/admin/delete-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: sale.id, sale_number: sale.sale_number }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Erreur lors de la suppression');
        setTimeout(() => setError(''), 5000);
        return;
      }
      setConfirmDelete(null);
      setSuccess('Vente supprimée — stock restauré automatiquement');
      setTimeout(() => setSuccess(''), 4000);
      loadSales();
    } finally {
      setDeletingSaleId(null);
    }
  }

  /* ---- Ouvrir détail vente ---- */
  async function openDetail(sale: VSale) {
    setDetailSale(sale);
    setShowDetail(true);
    setLoadingDetail(true);
    const { data } = await supabase
      .from('sale_items')
      .select('*, product:products(name, reference)')
      .eq('sale_id', sale.id);
    setDetailItems((data as SaleItem[]) ?? []);
    setLoadingDetail(false);
  }

  /* ---- Set des ventes déjà remboursées (avoir existant) ---- */
  const salesWithAvoir = new Set(avoirs.map(a => a.sale_id));

  /* ---- Lignes combinées (ventes + avoirs) triées par date ---- */
  type CombinedRow = { _t: 'sale'; d: VSale } | { _t: 'avoir'; d: AvoirRow };
  const combinedRows: CombinedRow[] = [
    ...sales.map(s  => ({ _t: 'sale'  as const, d: s })),
    ...avoirs.map(a => ({ _t: 'avoir' as const, d: a })),
  ].sort((a, b) =>
    new Date(b.d.created_at).getTime() - new Date(a.d.created_at).getTime()
  );

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.reference.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Toast */}
      {success && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 shadow-xl">
          <CheckCircle2 className="w-5 h-5" />
          {success}
        </div>
      )}
      {error && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 shadow-xl">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Ventes</h2>
          <p className="text-sm text-slate-500">{sales.length} vente(s) chargée(s)</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nouvelle vente
        </button>
      </div>

      {/* ===== FORMULAIRE NOUVELLE VENTE ===== */}
      {showForm && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-200">Saisie de vente</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Client */}
          <div>
            <label className="label">Client</label>
            {clientName ? (
              <div className="flex items-center gap-3 bg-dark-700 rounded-xl px-4 py-2.5">
                <div className="w-7 h-7 rounded-lg bg-neon-blue/10 border border-neon-blue/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-neon-blue">{clientName.charAt(0).toUpperCase()}</span>
                </div>
                <span className="flex-1 text-sm text-slate-200 font-medium">{clientName}</span>
                <button type="button" onClick={clearClient} className="text-slate-500 hover:text-red-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input className="input pl-9"
                      placeholder="Chercher un client existant…"
                      value={clientSearch}
                      onChange={(e) => { setClientSearch(e.target.value); setShowClientDrop(true); }}
                      onFocus={() => setShowClientDrop(true)}
                    />
                  </div>
                  <button type="button"
                    onClick={() => { setClientName(clientSearch); setClientId(null); setShowClientDrop(false); }}
                    className="btn-secondary text-xs px-3"
                    title="Nouveau client rapide"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
                {showClientDrop && clientSearch && filteredClients.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-dark-700 border border-dark-600 rounded-xl overflow-hidden shadow-xl max-h-40 overflow-y-auto">
                    {filteredClients.slice(0, 6).map(c => (
                      <button key={c.id} type="button" onClick={() => selectClient(c)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-600 text-left transition-colors"
                      >
                        <div className="w-6 h-6 rounded-lg bg-neon-blue/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-neon-blue">{c.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm text-slate-200">{c.name}</p>
                          {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {clientSearch && (
                  <p className="text-xs text-slate-500 mt-1">
                    Client introuvable ?
                    <button type="button" className="text-neon-blue ml-1 hover:underline"
                      onClick={() => { setClientName(clientSearch); setClientId(null); setShowClientDrop(false); }}
                    >
                      Saisir &quot;{clientSearch}&quot; directement
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Recherche produit */}
          <div>
            <label className="label">Ajouter un produit</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input className="input pl-9" placeholder="Nom ou référence du produit…"
                value={search} onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search && filteredProducts.length > 0 && (
              <div className="mt-2 bg-dark-700 border border-dark-600 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                {filteredProducts.slice(0, 8).map(p => (
                  <button key={p.id} type="button"
                    onClick={() => addLine(p)}
                    disabled={p.stock_qty <= 0}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2.5 transition-colors text-left",
                      p.stock_qty <= 0
                        ? "opacity-40 cursor-not-allowed bg-dark-800"
                        : "hover:bg-dark-600"
                    )}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-200">{p.name}</p>
                      <p className={cn("text-xs", p.stock_qty <= 0 ? "text-red-400" : "text-slate-500")}>
                        {p.reference} · stock: {p.stock_qty <= 0 ? "Rupture" : p.stock_qty}
                      </p>
                    </div>
                    <span className={cn("text-sm font-semibold", p.stock_qty <= 0 ? "text-slate-600" : "text-neon-blue")}>
                      {formatCFA(p.sell_price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lignes de vente */}
          {lines.length > 0 && (
            <div className="space-y-2">
              <label className="label">Articles sélectionnés</label>
              {lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-dark-700 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{line.product.name}</p>
                    <p className="text-xs text-slate-500">{line.product.reference}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div>
                      <p className="text-[10px] text-slate-500 mb-0.5 text-center">Qté</p>
                      <input type="number" min={1} value={line.qty}
                        onChange={(e) => updateLine(idx, 'qty', Number(e.target.value))}
                        className="input w-16 text-center text-sm py-1.5"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Prix unit.</p>
                      <input type="number" min={0} value={line.unit_price}
                        onChange={(e) => updateLine(idx, 'unit_price', Number(e.target.value))}
                        className="input w-28 text-sm py-1.5"
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 mb-0.5">Remise</p>
                      <input type="number" min={0} value={line.discount}
                        onChange={(e) => updateLine(idx, 'discount', Number(e.target.value))}
                        className="input w-24 text-sm py-1.5"
                      />
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 mb-0.5">Total</p>
                      <p className="text-sm font-semibold text-white w-24 text-right">
                        {formatCFA(line.qty * line.unit_price - line.discount)}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeLine(idx)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-end gap-6 pt-2 border-t border-dark-600">
                {discount > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Remise totale</p>
                    <p className="text-sm text-orange-400 font-medium">- {formatCFA(discount)}</p>
                  </div>
                )}
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total à payer</p>
                  <p className="text-2xl font-bold gradient-text">{formatCFA(total)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Mode de paiement + crédit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Mode de paiement *</label>
              <div className="relative">
                <select value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="input appearance-none pr-9"
                >
                  {PAYMENT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>
            {paymentMethod === 'credit' && (
              <div>
                <label className="label">Date d&apos;échéance</label>
                <input type="date" value={creditDueDate}
                  onChange={(e) => setCreditDueDate(e.target.value)}
                  className="input"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}
          </div>

          {paymentMethod === 'credit' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Cette vente sera enregistrée comme créance jusqu&apos;au règlement du client.
            </div>
          )}

          <div>
            <label className="label">Notes (optionnel)</label>
            <textarea className="input min-h-16 resize-none" placeholder="Informations complémentaires…"
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Annuler</button>
            <button onClick={handleSubmit} disabled={lines.length === 0 || saving} className="btn-primary min-w-36">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              {saving ? 'Enregistrement…' : 'Valider la vente'}
            </button>
          </div>
        </div>
      )}

      {/* Filtre date */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-400">Filtrer par date :</label>
        <input type="date" value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="input w-48 py-1.5 text-sm"
        />
        {filterDate && (
          <button onClick={() => setFilterDate('')} className="text-slate-500 hover:text-slate-200 text-xs">
            Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau historique */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">N° Document</th>
                <th className="px-5 py-3 font-medium whitespace-nowrap">Date</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Vendeur</th>
                <th className="px-5 py-3 font-medium">Articles</th>
                <th className="px-5 py-3 font-medium">Paiement</th>
                <th className="px-5 py-3 font-medium text-right">Montant</th>
                <th className="px-5 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {loadingSales ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-5 py-3.5"><div className="h-3 bg-dark-700 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : combinedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-600">
                    Aucune vente trouvée
                  </td>
                </tr>
              ) : (
                combinedRows.map((row) => {
                  /* ── Ligne AVOIR (négatif) ── */
                  if (row._t === 'avoir') {
                    const a = row.d;
                    return (
                      <tr key={'avo-' + a.id} className="bg-red-500/5 border-l-2 border-red-500/40">
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-red-400">{a.avoir_number}</span>
                          <p className="text-[10px] text-slate-500 mt-0.5">Avoir sur {a.sale_number}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">
                          {formatDate(a.created_at)}
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs">{a.client_name ?? '—'}</td>
                        <td className="px-5 py-3 text-slate-500 text-xs italic">{a.reason}</td>
                        <td className="px-5 py-3" />
                        <td className="px-5 py-3">
                          <span className="badge badge-red text-xs flex items-center gap-1 w-fit">
                            <Minus className="w-3 h-3" /> Avoir
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-red-400">
                          − {formatCFA(a.total)}
                        </td>
                        <td className="px-5 py-3" />
                      </tr>
                    );
                  }

                  /* ── Ligne VENTE normale ── */
                  const sale = row.d;
                  return (
                    <tr key={sale.id} className={cn(
                      'hover:bg-dark-700/40 transition-colors cursor-pointer',
                      sale.payment_method === 'credit' && !sale.is_settled && 'bg-orange-500/5'
                    )}
                      onClick={() => openDetail(sale)}
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-neon-blue">{sale.sale_number}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                        {formatDate(sale.created_at)}
                      </td>
                      <td className="px-5 py-3.5">
                        {sale.client_name
                          ? <span className="text-slate-300 text-sm">{sale.client_name}</span>
                          : <span className="text-slate-600 text-xs italic">—</span>
                        }
                      </td>
                      <td className="px-5 py-3.5 text-slate-300 text-sm">{sale.seller_name}</td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs">{sale.item_count} art.</td>
                      <td className="px-5 py-3.5">
                        <span className={cn('badge text-xs', PAYMENT_BADGE_CLASS[sale.payment_method])}>
                          {PAYMENT_LABELS[sale.payment_method]}
                        </span>
                        {sale.payment_method === 'credit' && !sale.is_settled && sale.credit_due_date && (
                          <p className="text-[10px] text-orange-400 mt-0.5 whitespace-nowrap">
                            Éch. : {formatDate(sale.credit_due_date)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-white">
                        {formatCFA(sale.total)}
                      </td>
                      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openDetail(sale)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-neon-blue hover:bg-neon-blue/10 transition-colors"
                            title="Voir le détail"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setAvoirSale(sale); setShowAvoir(true); }}
                            disabled={salesWithAvoir.has(sale.id)}
                            className={cn(
                              "p-1.5 rounded-lg transition-colors",
                              salesWithAvoir.has(sale.id)
                                ? "text-slate-600 cursor-not-allowed opacity-40"
                                : "text-slate-500 hover:text-orange-400 hover:bg-orange-500/10"
                            )}
                            title={salesWithAvoir.has(sale.id) ? "Avoir déjà émis sur cette vente" : "Créer un avoir"}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          {userRole === 'admin' && (
                            <button
                              onClick={() => setConfirmDelete(sale)}
                              disabled={deletingSaleId === sale.id}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                              title="Supprimer la vente (Admin)"
                            >
                              {deletingSaleId === sale.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== MODAL DÉTAIL VENTE ===== */}
      {showDetail && detailSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowDetail(false)}
        >
          <div className="card w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm text-neon-blue font-semibold">{detailSale.sale_number}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDate(detailSale.created_at)} · {detailSale.seller_name}
                  {detailSale.client_name && ` · ${detailSale.client_name}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!loadingDetail) {
                      printSaleReceipt({
                        sale_number:    detailSale.sale_number,
                        created_at:     detailSale.created_at,
                        client_name:    detailSale.client_name,
                        seller_name:    detailSale.seller_name,
                        payment_method: PAYMENT_LABELS[detailSale.payment_method],
                        subtotal:       detailSale.subtotal,
                        discount:       detailSale.discount,
                        total:          detailSale.total,
                        notes:          detailSale.notes,
                        items: detailItems.map(item => {
                          const prod = Array.isArray(item.product) ? item.product[0] : item.product as { name?: string; reference?: string } | undefined;
                          return {
                            name:       prod?.name ?? '—',
                            reference:  prod?.reference,
                            qty:        item.qty,
                            unit_price: item.unit_price,
                            discount:   item.discount,
                          };
                        }),
                      });
                    }
                  }}
                  disabled={loadingDetail}
                  title="Imprimer le reçu"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                             bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white
                             disabled:opacity-40 transition-all"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Reçu
                </button>
                <button onClick={() => setShowDetail(false)} className="text-slate-500 hover:text-slate-200">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Articles */}
            <div className="bg-dark-700 rounded-xl overflow-hidden">
              {loadingDetail ? (
                <div className="py-8 text-center text-slate-500 text-sm">Chargement…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-600 text-xs text-slate-500">
                      <th className="px-4 py-2.5 text-left font-medium">Article</th>
                      <th className="px-4 py-2.5 text-center font-medium">Qté</th>
                      <th className="px-4 py-2.5 text-right font-medium">P.U.</th>
                      <th className="px-4 py-2.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-600/50">
                    {detailItems.map((item) => {
                      const prod = Array.isArray(item.product) ? item.product[0] : item.product as { name?: string; reference?: string } | undefined;
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5">
                            <p className="text-slate-200 font-medium">{prod?.name ?? '—'}</p>
                            <p className="text-xs text-slate-500">{prod?.reference ?? ''}</p>
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-300">{item.qty}</td>
                          <td className="px-4 py-2.5 text-right text-slate-300">{formatCFA(item.unit_price)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-white">
                            {formatCFA(item.qty * item.unit_price - (item.discount ?? 0))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Totaux + paiement */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className={cn('badge text-xs', PAYMENT_BADGE_CLASS[detailSale.payment_method])}>
                  {PAYMENT_LABELS[detailSale.payment_method]}
                </span>
                {detailSale.payment_method === 'credit' && (
                  <span className={cn('text-xs', detailSale.is_settled ? 'text-emerald-400' : 'text-orange-400')}>
                    {detailSale.is_settled ? '✓ Soldé' : `Éch. ${detailSale.credit_due_date ? formatDate(detailSale.credit_due_date) : '—'}`}
                  </span>
                )}
              </div>
              <div className="text-right">
                {detailSale.discount > 0 && (
                  <p className="text-xs text-orange-400">Remise : − {formatCFA(detailSale.discount)}</p>
                )}
                <p className="text-lg font-bold gradient-text">{formatCFA(detailSale.total)}</p>
              </div>
            </div>

            {detailSale.notes && (
              <p className="text-xs text-slate-500 italic border-t border-dark-600 pt-3">{detailSale.notes}</p>
            )}
          </div>
        </div>
      )}

      {/* ===== MODAL CONFIRMATION SUPPRESSION VENTE ===== */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 space-y-4 border border-red-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Supprimer la vente</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono text-red-300">{confirmDelete.sale_number}</p>
              </div>
            </div>
            <div className="bg-dark-700 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Client</span><span className="text-slate-200">{confirmDelete.client_name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Montant</span><span className="font-bold text-white">{formatCFA(confirmDelete.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Articles</span><span className="text-slate-200">{confirmDelete.item_count} art.</span></div>
            </div>
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>La vente, ses articles et ses avoirs seront supprimés. <strong>Le stock sera restauré automatiquement.</strong> Action irréversible.</span>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary">Annuler</button>
              <button
                onClick={() => handleDeleteSale(confirmDelete)}
                disabled={deletingSaleId !== null}
                className="btn-danger min-w-36"
              >
                {deletingSaleId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deletingSaleId ? 'Suppression…' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL AVOIR ===== */}
      {showAvoir && avoirSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleAvoir} className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileX className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold text-slate-200">Facture d&apos;avoir</h3>
              </div>
              <button type="button" onClick={() => { setShowAvoir(false); setAvoirSale(null); }}
                className="text-slate-500 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Résumé vente */}
            <div className="bg-dark-700 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Vente</span>
                <span className="font-mono text-neon-blue">{avoirSale.sale_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Client</span>
                <span className="text-slate-200">{avoirSale.client_name ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Montant à rembourser</span>
                <span className="font-bold text-orange-400">{formatCFA(avoirSale.total)}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Cette action va <strong>remettre les articles en stock</strong> automatiquement. Elle est irréversible.</span>
            </div>

            <div>
              <label className="label">Motif de l&apos;avoir *</label>
              <textarea value={avoirReason} onChange={(e) => setAvoirReason(e.target.value)}
                className="input resize-none" rows={3}
                placeholder="Ex: Produit défectueux, retour client, erreur de saisie…"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { setShowAvoir(false); setAvoirSale(null); }}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button type="submit" disabled={avoirSaving || !avoirReason.trim()}
                className="btn-danger min-w-36"
              >
                {avoirSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileX className="w-4 h-4" />}
                {avoirSaving ? 'Traitement…' : 'Confirmer l\'avoir'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
