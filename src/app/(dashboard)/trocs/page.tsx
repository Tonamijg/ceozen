'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Troc, Product } from '@/types';
import {
  ArrowLeftRight, Plus, RefreshCw, X, Check,
  CheckCircle2, Smartphone, Clock, AlertTriangle
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

async function getNextTrocNumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from('trocs')
    .select('troc_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.troc_number) return 'TR-001';
  const last = parseInt(data.troc_number.replace('TR-', ''), 10);
  return `TR-${String(last + 1).padStart(3, '0')}`;
}

export default function TrocsPage() {
  const supabase = createClient();

  const [trocs,    setTrocs]    = useState<Troc[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving,   setSaving]   = useState(false);

  // ── Formulaire ────────────────────────────────────────────────────────────
  const [clientName,     setClientName]     = useState('');
  const [clientPhone,    setClientPhone]    = useState('');
  const [selectedProd,   setSelectedProd]   = useState<Product | null>(null);
  const [givenPrice,     setGivenPrice]     = useState('');
  const [receivedName,   setReceivedName]   = useState('');
  const [receivedRef,    setReceivedRef]    = useState('');
  const [receivedValue,  setReceivedValue]  = useState('');
  const [paymentMethod,  setPaymentMethod]  = useState<'especes' | 'mobile_money' | 'credit'>('especes');
  const [creditDueDate,  setCreditDueDate]  = useState('');
  const [notes,          setNotes]          = useState('');

  const complement = (parseFloat(givenPrice) || 0) - (parseFloat(receivedValue) || 0);

  // ── Chargement ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('trocs').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('is_active', true).gt('stock_qty', 0).order('name'),
    ]);
    setTrocs((t ?? []) as Troc[]);
    setProducts((p ?? []) as Product[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  function resetForm() {
    setClientName(''); setClientPhone('');
    setSelectedProd(null); setGivenPrice('');
    setReceivedName(''); setReceivedRef(''); setReceivedValue('');
    setPaymentMethod('especes'); setCreditDueDate(''); setNotes('');
  }

  // ── Soumission ────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedProd || !receivedName || !givenPrice || !receivedValue) return;
    setSaving(true);
    try {
      // 1. Créer le produit repris dans le stock
      const { data: newProd, error: prodErr } = await supabase
        .from('products')
        .insert({
          name:        receivedName,
          reference:   receivedRef || `REP-${Date.now()}`,
          buy_price:   parseFloat(receivedValue),
          sell_price:  parseFloat(receivedValue),
          stock_qty:   1,
          stock_min:   1,
          unit:        'unité',
          description: `Reprise troc — ${clientName || 'Client'}`,
          is_active:   true,
        })
        .select()
        .single();
      if (prodErr) throw prodErr;

      // 2. Diminuer le stock du produit donné
      await supabase
        .from('products')
        .update({ stock_qty: selectedProd.stock_qty - 1 })
        .eq('id', selectedProd.id);

      // 3. Numéro de troc
      const trocNumber = await getNextTrocNumber(supabase);

      // 4. Mouvements de stock
      await supabase.from('stock_movements').insert([
        {
          product_id:     selectedProd.id,
          type:           'sortie',
          qty:            1,
          reference_type: 'troc',
          notes:          `Troc ${trocNumber} — donné au client`,
        },
        {
          product_id:     newProd.id,
          type:           'entree',
          qty:            1,
          unit_cost:      parseFloat(receivedValue),
          reference_type: 'troc',
          notes:          `Troc ${trocNumber} — repris au client`,
        },
      ]);

      // 5. Enregistrer le troc
      await supabase.from('trocs').insert({
        troc_number:           trocNumber,
        client_name:           clientName  || null,
        client_phone:          clientPhone || null,
        product_given_id:      selectedProd.id,
        product_given_name:    selectedProd.name,
        product_given_price:   parseFloat(givenPrice),
        product_received_id:   newProd.id,
        product_received_name: receivedName,
        product_received_ref:  receivedRef || null,
        product_received_value: parseFloat(receivedValue),
        complement:            complement,
        payment_method:        paymentMethod,
        is_settled:            paymentMethod !== 'credit',
        credit_due_date:       paymentMethod === 'credit' && creditDueDate ? creditDueDate : null,
        notes:                 notes || null,
      });

      setShowModal(false);
      resetForm();
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalTrocs      = trocs.length;
  const totalComplement = trocs.reduce((s, t) => s + t.complement, 0);
  const enCredit        = trocs.filter(t => t.payment_method === 'credit' && !t.is_settled).length;
  const reprisesEnStock = trocs.length; // chaque troc = 1 reprise en stock

  const canSubmit = !!selectedProd && !!receivedName && !!givenPrice && !!receivedValue;

  return (
    <div className="space-y-6">

      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-neon-violet" />
          <p className="text-sm text-slate-400">Échange de téléphones avec complément</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                       bg-neon-violet/10 text-neon-violet border border-neon-violet/20
                       hover:bg-neon-violet/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Nouveau troc
          </button>
        </div>
      </div>

      {/* ── Cartes stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 space-y-1 border-l-2 border-neon-violet/50">
          <p className="text-xs text-slate-500">Total trocs</p>
          <p className="text-2xl font-bold text-white">{totalTrocs}</p>
          <p className="text-xs text-slate-600">opérations</p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-neon-blue/50">
          <p className="text-xs text-slate-500">Compléments encaissés</p>
          <p className="text-xl font-bold text-white">{fmt(totalComplement)}</p>
          <p className="text-xs text-slate-600">total</p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-orange-500/50">
          <p className="text-xs text-slate-500">Trocs à crédit</p>
          <p className="text-2xl font-bold text-orange-400">{enCredit}</p>
          <p className="text-xs text-slate-600">en attente</p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-emerald-500/50">
          <p className="text-xs text-slate-500">Reprises en stock</p>
          <p className="text-2xl font-bold text-emerald-400">{reprisesEnStock}</p>
          <p className="text-xs text-slate-600">téléphones</p>
        </div>
      </div>

      {/* ── Tableau ─────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-600 flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-neon-violet" />
          <h3 className="text-sm font-semibold text-slate-200">Historique des trocs</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Chargement…</div>
        ) : trocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <ArrowLeftRight className="w-10 h-10 opacity-20" />
            <p className="text-sm">Aucun troc enregistré</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-xs text-neon-violet hover:underline"
            >
              Enregistrer le premier troc →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-600">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">N° Troc</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Donné au client</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Repris au client</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Complément</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Paiement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600/50">
                {trocs.map((t) => (
                  <tr key={t.id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-neon-violet text-xs font-semibold">{t.troc_number}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-300 text-sm">{t.client_name ?? <span className="text-slate-600 italic text-xs">Anonyme</span>}</p>
                      {t.client_phone && <p className="text-xs text-slate-500">{t.client_phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-red-400/60 flex-shrink-0" />
                        <span className="text-slate-300 text-xs">{t.product_given_name}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 ml-5">{fmt(t.product_given_price)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400/60 flex-shrink-0" />
                        <span className="text-slate-300 text-xs">{t.product_received_name}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 ml-5">{fmt(t.product_received_value)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-neon-violet">{fmt(t.complement)}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{formatDate(t.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      {t.payment_method === 'credit' && !t.is_settled ? (
                        <span className="badge-red text-xs flex items-center gap-1 justify-center">
                          <Clock className="w-3 h-3" /> Crédit
                        </span>
                      ) : t.payment_method === 'credit' ? (
                        <span className="badge-green text-xs">Crédit soldé</span>
                      ) : t.payment_method === 'mobile_money' ? (
                        <span className="badge-blue text-xs">Mobile Money</span>
                      ) : (
                        <span className="badge-green text-xs">Espèces</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-dark-600 bg-dark-800/60">
                  <td colSpan={4} className="px-4 py-3 text-xs font-medium text-slate-400">Total compléments</td>
                  <td className="px-4 py-3 text-right font-bold text-neon-violet">{fmt(totalComplement)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal nouveau troc ───────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { setShowModal(false); resetForm(); }}
          />
          <div className="relative bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-600 sticky top-0 bg-dark-800 z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-neon-violet/10 border border-neon-violet/20 flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4 text-neon-violet" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Nouveau troc</h2>
                  <p className="text-xs text-slate-500">Échange téléphone + complément</p>
                </div>
              </div>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">

              {/* Client */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Client</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Nom</label>
                    <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                      placeholder="Kouamé Jean" className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Téléphone</label>
                    <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                      placeholder="07 XX XX XX XX" className="input-field w-full" />
                  </div>
                </div>
              </div>

              {/* Échange */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Échange</h3>
                <div className="grid grid-cols-[1fr,32px,1fr] gap-3 items-start">

                  {/* Donné */}
                  <div className="space-y-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                    <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" /> Donné au client
                    </p>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Produit du stock *</label>
                      <select
                        value={selectedProd?.id ?? ''}
                        onChange={e => {
                          const p = products.find(x => x.id === e.target.value) ?? null;
                          setSelectedProd(p);
                          if (p) setGivenPrice(String(p.sell_price));
                        }}
                        className="input-field w-full"
                      >
                        <option value="">Sélectionner…</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} (×{p.stock_qty})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Prix de vente (FCFA) *</label>
                      <input type="number" value={givenPrice} onChange={e => setGivenPrice(e.target.value)}
                        placeholder="180000" className="input-field w-full" />
                    </div>
                  </div>

                  {/* Flèche */}
                  <div className="flex items-center justify-center pt-10">
                    <ArrowLeftRight className="w-4 h-4 text-neon-violet" />
                  </div>

                  {/* Repris */}
                  <div className="space-y-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                    <p className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" /> Repris au client
                    </p>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Nom du téléphone *</label>
                      <input type="text" value={receivedName} onChange={e => setReceivedName(e.target.value)}
                        placeholder="iPhone 11 64Go" className="input-field w-full" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Référence</label>
                      <input type="text" value={receivedRef} onChange={e => setReceivedRef(e.target.value)}
                        placeholder="IP11-64-BLK" className="input-field w-full" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Valeur estimée (FCFA) *</label>
                      <input type="number" value={receivedValue} onChange={e => setReceivedValue(e.target.value)}
                        placeholder="80000" className="input-field w-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Complément calculé */}
              {(parseFloat(givenPrice) > 0 || parseFloat(receivedValue) > 0) && (
                <div className={cn(
                  'rounded-xl px-4 py-3 flex items-center justify-between',
                  complement >= 0
                    ? 'bg-neon-violet/10 border border-neon-violet/20'
                    : 'bg-emerald-500/10 border border-emerald-500/20'
                )}>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Complément à encaisser</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {fmt(parseFloat(givenPrice) || 0)} − {fmt(parseFloat(receivedValue) || 0)}
                    </p>
                  </div>
                  <p className={cn(
                    'text-2xl font-bold',
                    complement >= 0 ? 'text-neon-violet' : 'text-emerald-400'
                  )}>
                    {fmt(Math.abs(complement))}
                    {complement < 0 && <span className="text-xs ml-1 font-normal">à rendre</span>}
                  </p>
                </div>
              )}

              {/* Paiement */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Mode de paiement du complément</h3>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: 'especes',      l: 'Espèces' },
                    { v: 'mobile_money', l: 'Mobile Money' },
                    { v: 'credit',       l: 'Crédit' },
                  ] as const).map(({ v, l }) => (
                    <button
                      key={v}
                      onClick={() => setPaymentMethod(v)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-xs font-medium border transition-all',
                        paymentMethod === v
                          ? 'bg-neon-blue/15 text-neon-blue border-neon-blue/30'
                          : 'border-dark-500 text-slate-400 hover:border-dark-400 hover:text-slate-200'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {paymentMethod === 'credit' && (
                  <div className="mt-3">
                    <label className="text-xs text-slate-500 mb-1 block">Date d'échéance</label>
                    <input type="date" value={creditDueDate} onChange={e => setCreditDueDate(e.target.value)}
                      className="input-field w-full" />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Notes (optionnel)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="État du téléphone repris, remarques..."
                  rows={2}
                  className="input-field w-full resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400
                             border border-dark-500 hover:border-dark-400 hover:text-slate-200 transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !canSubmit}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                             bg-neon-violet/15 text-neon-violet border border-neon-violet/30
                             hover:bg-neon-violet/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {saving ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Enregistrement…</>
                  ) : (
                    <><Check className="w-4 h-4" /> Valider le troc</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
