'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Troc, Product } from '@/types';
import {
  ArrowLeftRight, Plus, RefreshCw, X, Check,
  CheckCircle2, Smartphone, Clock, Package, Printer, Edit2
} from 'lucide-react';
import { formatDate, cn, localDateStr } from '@/lib/utils';
import { printTrocReceipt } from '@/lib/print';
import { PAYMENT_LABELS } from '@/types';

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

  const [trocs,      setTrocs]      = useState<Troc[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [reprises,   setReprises]   = useState<Product[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [trocError,  setTrocError]  = useState('');
  const [trocSuccess,setTrocSuccess]= useState('');
  const [activeTab,  setActiveTab]  = useState<'historique' | 'reprises'>('historique');
  const [userRole,     setUserRole]     = useState('');
  const [editingTroc,  setEditingTroc]  = useState<Troc | null>(null);
  const canEdit = userRole === 'admin' || userRole === 'super_admin';

  // ── Formulaire ────────────────────────────────────────────────────────────
  const [clientName,     setClientName]     = useState('');
  const [clientPhone,    setClientPhone]    = useState('');
  const [selectedProd,   setSelectedProd]   = useState<Product | null>(null);
  const [givenPrice,     setGivenPrice]     = useState('');
  const [receivedName,   setReceivedName]   = useState('');
  const [receivedRef,    setReceivedRef]    = useState('');
  const [receivedValue,  setReceivedValue]  = useState('');
  const [paymentMethod,  setPaymentMethod]  = useState<'especes' | 'mobile_money' | 'credit'>('especes');
  const [acompte,        setAcompte]        = useState('');
  const [creditDueDate,  setCreditDueDate]  = useState('');
  const [trocDate,       setTrocDate]       = useState(() => localDateStr());
  const [notes,          setNotes]          = useState('');

  const complement = (parseFloat(givenPrice) || 0) - (parseFloat(receivedValue) || 0);

  // ── Chargement ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: p }, { data: r }, roleData] = await Promise.all([
      supabase.from('trocs').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('is_active', true).gt('stock_qty', 0).order('name'),
      supabase.from('products').select('*').ilike('description', 'Reprise troc%').order('created_at', { ascending: false }),
      supabase.auth.getUser().then(({ data: { user } }) =>
        user ? supabase.from('profiles').select('role').eq('id', user.id).single() : null
      ),
    ]);
    setTrocs((t ?? []) as Troc[]);
    setProducts((p ?? []) as Product[]);
    setReprises((r ?? []) as Product[]);
    if (roleData?.data) setUserRole((roleData.data as { role: string }).role);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  function resetForm() {
    setClientName(''); setClientPhone('');
    setSelectedProd(null); setGivenPrice('');
    setReceivedName(''); setReceivedRef(''); setReceivedValue('');
    setPaymentMethod('especes'); setAcompte(''); setCreditDueDate('');
    setTrocDate(localDateStr()); setNotes('');
    setEditingTroc(null);
  }

  function openEdit(t: Troc) {
    setEditingTroc(t);
    setClientName(t.client_name ?? '');
    setClientPhone(t.client_phone ?? '');
    setSelectedProd(null);
    setGivenPrice(String(t.product_given_price));
    setReceivedName(t.product_received_name);
    setReceivedRef(t.product_received_ref ?? '');
    setReceivedValue(String(t.product_received_value));
    setPaymentMethod(t.payment_method === 'credit' ? 'credit' : t.payment_method === 'mobile_money' ? 'mobile_money' : 'especes');
    setAcompte(t.acompte ? String(t.acompte) : '');
    setCreditDueDate(t.credit_due_date ?? '');
    setTrocDate(t.troc_date ?? localDateStr());
    setNotes(t.notes ?? '');
    setShowModal(true);
  }

  // ── Soumission (création ou correction) ────────────────────────────────────
  async function handleSubmit() {
    if (editingTroc) {
      if (!receivedName || !givenPrice || !receivedValue) return;
      setSaving(true);
      try {
        const res = await fetch('/api/troc/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trocId: editingTroc.id,
            clientName, clientPhone,
            productGivenPrice: givenPrice,
            productReceivedId: editingTroc.product_received_id,
            productReceivedName: receivedName,
            productReceivedRef: receivedRef,
            productReceivedValue: receivedValue,
            paymentMethod, acompte: acompte || '0', creditDueDate, trocDate, notes,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error ?? 'Erreur serveur');

        setShowModal(false);
        resetForm();
        setTrocSuccess('Troc corrigé avec succès !');
        setTimeout(() => setTrocSuccess(''), 4000);
        loadData();
      } catch (e) {
        setTrocError(`Erreur : ${e instanceof Error ? e.message : 'Impossible de corriger le troc'}`);
        setTimeout(() => setTrocError(''), 7000);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!selectedProd || !receivedName || !givenPrice || !receivedValue) return;
    setSaving(true);
    try {
      const trocNumber = await getNextTrocNumber(supabase);

      // API route service_role (bypasse RLS pour products + stock)
      const res = await fetch('/api/troc/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, clientPhone,
          selectedProdId:    selectedProd.id,
          selectedProdName:  selectedProd.name,
          selectedProdStock: selectedProd.stock_qty,
          givenPrice,
          receivedName, receivedRef, receivedValue,
          complement: String(complement),
          acompte: acompte || '0',
          paymentMethod, creditDueDate, trocDate, notes,
          trocNumber,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Erreur serveur');

      // Notification WhatsApp (best-effort)
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'troc',
          data: {
            troc_number:      trocNumber,
            client_name:      clientName || undefined,
            product_given:    selectedProd.name,
            product_received: receivedName,
            complement,
            payment_method:   paymentMethod,
          },
        }),
      }).catch(() => {});

      setShowModal(false);
      resetForm();
      setTrocSuccess('Troc enregistré avec succès !');
      setTimeout(() => setTrocSuccess(''), 4000);
      loadData();
    } catch (e) {
      setTrocError(`Erreur : ${e instanceof Error ? e.message : 'Impossible de valider le troc'}`);
      setTimeout(() => setTrocError(''), 7000);
    } finally {
      setSaving(false);
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalTrocs      = trocs.length;
  const totalComplement = trocs.reduce((s, t) => s + t.complement, 0);
  const enCredit        = trocs.filter(t => t.payment_method === 'credit' && !t.is_settled).length;
  const reprisesEnStock = trocs.length; // chaque troc = 1 reprise en stock

  const canSubmit = (!!selectedProd || !!editingTroc) && !!receivedName && !!givenPrice && !!receivedValue;

  return (
    <div className="space-y-6">

      {/* Toasts */}
      {trocSuccess && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 shadow-xl">
          <CheckCircle2 className="w-5 h-5" /> {trocSuccess}
        </div>
      )}
      {trocError && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 shadow-xl">
          <Package className="w-5 h-5" /> {trocError}
        </div>
      )}

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

      {/* ── Onglets ─────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {/* Tab headers */}
        <div className="flex border-b border-dark-600 px-2">
          <button
            onClick={() => setActiveTab('historique')}
            className={cn(
              'flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'historique'
                ? 'border-neon-violet text-neon-violet'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            <ArrowLeftRight className="w-4 h-4" />
            Historique
            {trocs.length > 0 && (
              <span className="ml-1 bg-neon-violet/20 text-neon-violet text-xs px-1.5 py-0.5 rounded-full">
                {trocs.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('reprises')}
            className={cn(
              'flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'reprises'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            <Package className="w-4 h-4" />
            Reprises en stock
            {reprises.length > 0 && (
              <span className="ml-1 bg-emerald-500/20 text-emerald-400 text-xs px-1.5 py-0.5 rounded-full">
                {reprises.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Onglet Historique ── */}
        {activeTab === 'historique' && (
          loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Chargement…</div>
          ) : trocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <ArrowLeftRight className="w-10 h-10 opacity-20" />
              <p className="text-sm">Aucun troc enregistré</p>
              <button onClick={() => setShowModal(true)} className="text-xs text-neon-violet hover:underline">
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
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Donné</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Repris</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Complément</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
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
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{formatDate(t.troc_date ?? t.created_at)}</td>
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(t)}
                              title="Modifier le troc"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-all"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => printTrocReceipt({
                              troc_number:            t.troc_number,
                              created_at:             t.created_at,
                              client_name:            t.client_name,
                              client_phone:           t.client_phone,
                              product_given_name:     t.product_given_name,
                              product_given_price:    t.product_given_price,
                              product_received_name:  t.product_received_name,
                              product_received_value: t.product_received_value,
                              complement:             t.complement,
                              payment_method:         PAYMENT_LABELS[t.payment_method] ?? t.payment_method,
                              notes:                  t.notes,
                            })}
                            title="Imprimer le reçu"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-dark-600 transition-all"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-dark-600 bg-dark-800/60">
                    <td colSpan={4} className="px-4 py-3 text-xs font-medium text-slate-400">Total compléments</td>
                    <td className="px-4 py-3 text-right font-bold text-neon-violet">{fmt(totalComplement)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        )}

        {/* ── Onglet Reprises en stock ── */}
        {activeTab === 'reprises' && (
          loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Chargement…</div>
          ) : reprises.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <Package className="w-10 h-10 opacity-20" />
              <p className="text-sm">Aucune reprise en stock pour l'instant</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Téléphone repris</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Référence</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Qté</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Valeur reprise</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Prix de revente</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {reprises.map((p) => (
                    <tr key={p.id} className="hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-400/60 flex-shrink-0" />
                          <span className="text-slate-200 font-medium text-sm">{p.name}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 ml-5 italic">{p.description}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{p.reference}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'font-bold text-sm',
                          p.stock_qty === 0 ? 'text-red-400' : 'text-emerald-400'
                        )}>{p.stock_qty}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">{fmt(p.buy_price)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-white">{fmt(p.sell_price)}</td>
                      <td className="px-4 py-3 text-center">
                        {p.stock_qty === 0
                          ? <span className="badge-red text-xs">Vendu</span>
                          : <span className="badge-green text-xs">En stock</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-dark-600 bg-dark-800/60">
                    <td colSpan={3} className="px-4 py-3 text-xs font-medium text-slate-400">
                      {reprises.length} téléphone(s) repris · {reprises.filter(p => p.stock_qty > 0).length} encore en stock
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">
                      {fmt(reprises.reduce((s, p) => s + p.buy_price, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )
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
                  <h2 className="text-sm font-semibold text-slate-100">{editingTroc ? `Corriger le troc ${editingTroc.troc_number}` : 'Nouveau troc'}</h2>
                  <p className="text-xs text-slate-500">{editingTroc ? 'Erreur de saisie ? Corrige les infos ci-dessous' : 'Échange téléphone + complément'}</p>
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
                      placeholder="Kouamé Jean" className="input w-full" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Téléphone</label>
                    <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                      placeholder="07 XX XX XX XX" className="input w-full" />
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
                      {editingTroc ? (
                        <div className="input w-full flex items-center gap-1.5 text-slate-300 bg-dark-700/50 cursor-not-allowed">
                          <Smartphone className="w-3.5 h-3.5 text-red-400/60 flex-shrink-0" />
                          {editingTroc.product_given_name}
                        </div>
                      ) : (
                        <select
                          value={selectedProd?.id ?? ''}
                          onChange={e => {
                            const p = products.find(x => x.id === e.target.value) ?? null;
                            setSelectedProd(p);
                            if (p) setGivenPrice(String(p.sell_price));
                          }}
                          className="input w-full"
                        >
                          <option value="">Sélectionner…</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} (×{p.stock_qty})</option>
                          ))}
                        </select>
                      )}
                      {editingTroc && <p className="text-[10px] text-slate-600 mt-1">Le produit donné n&apos;est pas modifiable — seul le prix peut être corrigé</p>}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Prix de vente (FCFA) *</label>
                      <input type="number" value={givenPrice} onChange={e => setGivenPrice(e.target.value)}
                        placeholder="180000" className="input w-full" />
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
                        placeholder="iPhone 11 64Go" className="input w-full" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Référence</label>
                      <input type="text" value={receivedRef} onChange={e => setReceivedRef(e.target.value)}
                        placeholder="IP11-64-BLK" className="input w-full" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Valeur estimée (FCFA) *</label>
                      <input type="number" value={receivedValue} onChange={e => setReceivedValue(e.target.value)}
                        placeholder="80000" className="input w-full" />
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
                      onClick={() => { setPaymentMethod(v); if (v !== 'credit') setAcompte(''); }}
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

                {/* Acompte partiel */}
                {complement > 0 && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">
                        Acompte versé (FCFA) <span className="text-slate-600">— laisser vide si paiement intégral</span>
                      </label>
                      <input
                        type="number"
                        value={acompte}
                        onChange={e => setAcompte(e.target.value)}
                        placeholder={`Max : ${fmt(complement)}`}
                        min={0}
                        max={complement}
                        className="input w-full"
                      />
                      {acompte && parseFloat(acompte) < complement && (
                        <p className="text-xs text-orange-400 mt-1">
                          Solde restant dû : {fmt(complement - parseFloat(acompte))} → ira en créances
                        </p>
                      )}
                    </div>
                    {(paymentMethod === 'credit' || (acompte && parseFloat(acompte) < complement)) && (
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Date d&apos;échéance du solde</label>
                        <input type="date" value={creditDueDate} onChange={e => setCreditDueDate(e.target.value)}
                          className="input w-full" />
                      </div>
                    )}
                  </div>
                )}

                {complement <= 0 && paymentMethod === 'credit' && (
                  <div className="mt-3">
                    <label className="text-xs text-slate-500 mb-1 block">Date d&apos;échéance</label>
                    <input type="date" value={creditDueDate} onChange={e => setCreditDueDate(e.target.value)}
                      className="input w-full" />
                  </div>
                )}
              </div>

              {/* Date du troc */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Date du troc *</label>
                <input
                  type="date"
                  value={trocDate}
                  onChange={e => setTrocDate(e.target.value)}
                  max={localDateStr()}
                  className="input"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Notes (optionnel)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="État du téléphone repris, remarques..."
                  rows={2}
                  className="input w-full resize-none"
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
                  ) : editingTroc ? (
                    <><Check className="w-4 h-4" /> Enregistrer la correction</>
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
