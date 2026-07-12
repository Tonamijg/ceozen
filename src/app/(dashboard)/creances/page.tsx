'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VCreance, VDette } from '@/types';
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock,
  AlertTriangle, RefreshCw, Landmark, Plus, X, Loader2,
  Mail, Calendar, Send, Search, Filter
} from 'lucide-react';
import { formatDate, localDateStr } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

type Tab = 'creances' | 'dettes';

// ─── Types situations initiales ───────────────────────────────────────────────
interface VCreanceInitiale {
  id: string;
  client_name: string;
  client_id?: string;
  amount: number;
  since_date: string;
  description?: string;
  is_settled: boolean;
  settled_at?: string;
  created_at: string;
}

interface VDetteInitiale {
  id: string;
  supplier_name: string;
  amount: number;
  since_date: string;
  description?: string;
  is_settled: boolean;
  settled_at?: string;
  created_at: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CreancesPage() {
  const supabase = createClient();

  const [tab, setTab]                     = useState<Tab>('creances');
  const [creances, setCreances]           = useState<VCreance[]>([]);
  const [creanceItems, setCreanceItems]   = useState<Record<string, string>>({});
  const [dettes, setDettes]               = useState<VDette[]>([]);
  const [initiales, setInitiales]         = useState<VCreanceInitiale[]>([]);
  const [dettesInit, setDettesInit]       = useState<VDetteInitiale[]>([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState<string | null>(null);
  const [filterSettled, setFilterSettled] = useState(false);

  // ── Recherche & filtres ─────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'attente' | 'retard'>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo,   setFilterDateTo]   = useState('');
  const [userRole, setUserRole]           = useState('');
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderMsg, setReminderMsg]     = useState('');
  const [successMsg, setSuccessMsg]       = useState('');
  const [errorMsg, setErrorMsg]           = useState('');

  // ── Confirmation solde ──────────────────────────────────────────────────────
  type ConfirmAction = {
    label: string;       // nom du client ou fournisseur
    amount: number;
    onConfirm: () => void;
  };
  const [confirmSettle, setConfirmSettle] = useState<ConfirmAction | null>(null);

  // ── Formulaire créance initiale ─────────────────────────────────────────────
  const [showInitForm,  setShowInitForm]  = useState(false);
  const [initClient,    setInitClient]    = useState('');
  const [initAmount,    setInitAmount]    = useState('');
  const [initSince,     setInitSince]     = useState(() => localDateStr());
  const [initDesc,      setInitDesc]      = useState('');
  const [savingInit,    setSavingInit]    = useState(false);

  // ── Formulaire dette initiale ───────────────────────────────────────────────
  const [showDetteInitForm,  setShowDetteInitForm]  = useState(false);
  const [detteInitSupplier,  setDetteInitSupplier]  = useState('');
  const [detteInitAmount,    setDetteInitAmount]    = useState('');
  const [detteInitSince,     setDetteInitSince]     = useState(() => localDateStr());
  const [detteInitDesc,      setDetteInitDesc]      = useState('');
  const [savingDetteInit,    setSavingDetteInit]    = useState(false);

  // ── Chargement ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: c }, { data: d }, { data: ini }, { data: dinit }, roleData] = await Promise.all([
      supabase.from('v_creances').select('*').order('created_at', { ascending: false }),
      supabase.from('v_dettes').select('*').order('expense_date', { ascending: false }),
      supabase.from('creances_initiales').select('*').order('since_date', { ascending: false }),
      supabase.from('dettes_initiales').select('*').order('since_date', { ascending: false }),
      supabase.auth.getUser().then(({ data: { user } }) =>
        user ? supabase.from('profiles').select('role').eq('id', user.id).single() : null
      ),
    ]);
    setCreances((c ?? []) as VCreance[]);
    setDettes((d ?? []) as VDette[]);
    setInitiales((ini ?? []) as VCreanceInitiale[]);
    setDettesInit((dinit ?? []) as VDetteInitiale[]);
    if (roleData?.data) setUserRole((roleData.data as { role: string }).role);

    // ── Article / opération liée (téléphone vendu ou échangé) ──────────────
    const venteIds = ((c ?? []) as VCreance[]).filter((x) => x.type === 'vente').map((x) => x.id);
    const trocIds  = ((c ?? []) as VCreance[]).filter((x) => x.type === 'troc').map((x) => x.id);
    const [{ data: items }, { data: trocsData }] = await Promise.all([
      venteIds.length
        ? supabase.from('sale_items').select('sale_id, qty, product:products(name)').in('sale_id', venteIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      trocIds.length
        ? supabase.from('trocs').select('id, product_given_name').in('id', trocIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);
    const itemsMap: Record<string, string> = {};
    (items ?? []).forEach((it: Record<string, unknown>) => {
      const product = Array.isArray(it.product) ? it.product[0] : it.product as Record<string, unknown> | null;
      const name = (product?.name as string) ?? '—';
      const qty  = it.qty as number;
      const label = qty > 1 ? `${name} (×${qty})` : name;
      const saleId = it.sale_id as string;
      itemsMap[saleId] = itemsMap[saleId] ? `${itemsMap[saleId]}, ${label}` : label;
    });
    (trocsData ?? []).forEach((t: Record<string, unknown>) => {
      itemsMap[t.id as string] = t.product_given_name as string;
    });
    setCreanceItems(itemsMap);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Marquer une créance soldée (vente ou troc) ─────────────────────────────
  async function settleCreance(id: string, type: 'vente' | 'troc') {
    setSaving(id);
    if (type === 'troc') {
      await supabase.from('trocs').update({ is_settled: true }).eq('id', id);
    } else {
      await supabase.from('sales').update({ is_settled: true }).eq('id', id);
    }
    setSaving(null);
    loadData();
  }

  // ── Marquer une dette soldée ────────────────────────────────────────────────
  async function settleDette(id: string) {
    setSaving(id);
    await supabase.from('expenses').update({ is_settled: true }).eq('id', id);
    setSaving(null);
    loadData();
  }

  // ── Marquer créance initiale soldée ────────────────────────────────────────
  async function settleInitiale(id: string) {
    setSaving(id);
    await supabase.from('creances_initiales').update({
      is_settled: true,
      settled_at: new Date().toISOString(),
    }).eq('id', id);
    setSaving(null);
    loadData();
  }

  // ── Marquer dette initiale soldée ──────────────────────────────────────────
  async function settleDetteInitiale(id: string) {
    setSaving(id);
    await supabase.from('dettes_initiales').update({
      is_settled: true,
      settled_at: new Date().toISOString(),
    }).eq('id', id);
    setSaving(null);
    loadData();
  }

  // ── Créer une créance initiale ──────────────────────────────────────────────
  async function handleCreateInitiale(e: React.FormEvent) {
    e.preventDefault();
    if (!initClient.trim() || !initAmount || !initSince) return;
    setSavingInit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('creances_initiales').insert({
        client_name:  initClient.trim(),
        amount:       Number(initAmount),
        since_date:   initSince,
        description:  initDesc.trim() || null,
        created_by:   user!.id,
      });
      if (error) {
        setErrorMsg(`Erreur : ${error.message}`);
        setTimeout(() => setErrorMsg(''), 6000);
        return;
      }
      setShowInitForm(false);
      setInitClient(''); setInitAmount(''); setInitSince(localDateStr()); setInitDesc('');
      setSuccessMsg('Créance initiale enregistrée ✅');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadData();
    } finally {
      setSavingInit(false);
    }
  }

  // ── Créer une dette initiale ────────────────────────────────────────────────
  async function handleCreateDetteInitiale(e: React.FormEvent) {
    e.preventDefault();
    if (!detteInitSupplier.trim() || !detteInitAmount || !detteInitSince) return;
    setSavingDetteInit(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('dettes_initiales').insert({
        supplier_name: detteInitSupplier.trim(),
        amount:        Number(detteInitAmount),
        since_date:    detteInitSince,
        description:   detteInitDesc.trim() || null,
        created_by:    user!.id,
      });
      if (error) {
        setErrorMsg(`Erreur : ${error.message}`);
        setTimeout(() => setErrorMsg(''), 6000);
        return;
      }
      setShowDetteInitForm(false);
      setDetteInitSupplier(''); setDetteInitAmount(''); setDetteInitSince(localDateStr()); setDetteInitDesc('');
      setSuccessMsg('Dette initiale enregistrée ✅');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadData();
    } finally {
      setSavingDetteInit(false);
    }
  }

  // ── Envoyer rappels par email ────────────────────────────────────────────────
  async function sendReminders() {
    setSendingReminders(true);
    setReminderMsg('');
    try {
      const res = await fetch('/api/creances/send-reminders', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        setReminderMsg(`✅ ${json.message}`);
      } else {
        setReminderMsg(`❌ ${json.error ?? 'Erreur lors de l\'envoi'}`);
      }
    } catch {
      setReminderMsg('❌ Erreur réseau');
    } finally {
      setSendingReminders(false);
      setTimeout(() => setReminderMsg(''), 6000);
    }
  }

  // ── Totaux ──────────────────────────────────────────────────────────────────
  const totalCreances        = creances.filter(c => !c.is_settled).reduce((s, c) => s + c.amount, 0);
  const totalCreancesOverdue = creances.filter(c => c.is_overdue).reduce((s, c) => s + c.amount, 0);
  const totalInitiales       = initiales.filter(i => !i.is_settled).reduce((s, i) => s + i.amount, 0);
  const totalDettes          = dettes.filter(d => !d.is_settled).reduce((s, d) => s + d.amount, 0);
  const totalDettesOverdue   = dettes.filter(d => d.is_overdue).reduce((s, d) => s + d.amount, 0);
  const totalDettesInit      = dettesInit.filter(d => !d.is_settled).reduce((s, d) => s + d.amount, 0);

  const initialesOverdue = initiales.filter(i => {
    if (i.is_settled) return false;
    return (new Date().getTime() - new Date(i.since_date).getTime()) / 86400000 > 60;
  });

  const dettesInitOverdue = dettesInit.filter(d => {
    if (d.is_settled) return false;
    return (new Date().getTime() - new Date(d.since_date).getTime()) / 86400000 > 60;
  });

  // Helpers filtre
  function applyDateFilter(dateStr: string) {
    if (!filterDateFrom && !filterDateTo) return true;
    const d = new Date(dateStr);
    if (filterDateFrom && d < new Date(filterDateFrom)) return false;
    if (filterDateTo   && d > new Date(filterDateTo))   return false;
    return true;
  }

  const filteredCreances = creances.filter(c => {
    if (!filterSettled && c.is_settled) return false;
    if (search && !(c.client_name ?? '').toLowerCase().includes(search.toLowerCase()) &&
        !(c.reference_number ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === 'retard' && !c.is_overdue) return false;
    if (filterStatus === 'attente' && (c.is_overdue || c.is_settled)) return false;
    if (!applyDateFilter(c.created_at)) return false;
    return true;
  });

  const filteredInitiales = initiales.filter(i => {
    if (!filterSettled && i.is_settled) return false;
    if (search && !i.client_name.toLowerCase().includes(search.toLowerCase()) &&
        !(i.description ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    const diffDays = (new Date().getTime() - new Date(i.since_date).getTime()) / 86400000;
    const isOverdue = !i.is_settled && diffDays > 60;
    if (filterStatus === 'retard'  && !isOverdue) return false;
    if (filterStatus === 'attente' && (isOverdue || i.is_settled)) return false;
    if (!applyDateFilter(i.since_date)) return false;
    return true;
  });

  const filteredDettes = dettes.filter(d => {
    if (!filterSettled && d.is_settled) return false;
    if (search && !(d.supplier_name ?? '').toLowerCase().includes(search.toLowerCase()) &&
        !d.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === 'retard'  && !d.is_overdue) return false;
    if (filterStatus === 'attente' && (d.is_overdue || d.is_settled)) return false;
    if (!applyDateFilter(d.expense_date)) return false;
    return true;
  });

  const filteredDettesInit = dettesInit.filter(d => {
    if (!filterSettled && d.is_settled) return false;
    if (search && !d.supplier_name.toLowerCase().includes(search.toLowerCase()) &&
        !(d.description ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    const diffDays = (new Date().getTime() - new Date(d.since_date).getTime()) / 86400000;
    const isOverdue = !d.is_settled && diffDays > 60;
    if (filterStatus === 'retard'  && !isOverdue) return false;
    if (filterStatus === 'attente' && (isOverdue || d.is_settled)) return false;
    if (!applyDateFilter(d.since_date)) return false;
    return true;
  });

  const totalCreancesCount = creances.filter(c => !c.is_settled).length + initiales.filter(i => !i.is_settled).length;
  const totalDettesCount   = dettes.filter(d => !d.is_settled).length + dettesInit.filter(d => !d.is_settled).length;

  // ── Bouton contextuel selon l'onglet ────────────────────────────────────────
  function handleAddInitiale() {
    if (tab === 'creances') setShowInitForm(true);
    else setShowDetteInitForm(true);
  }

  return (
    <div className="space-y-6">

      {/* ── Toasts ──────────────────────────────────────────────────────────── */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl bg-red-500/20 border border-red-500/30 text-red-300">
          {errorMsg}
        </div>
      )}
      {reminderMsg && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl',
          reminderMsg.startsWith('✅')
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/20 border border-red-500/30 text-red-300'
        )}>
          {reminderMsg}
        </div>
      )}

      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-neon-blue" />
          <p className="text-sm text-slate-400">Suivi des créances clients et dettes fournisseurs</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={sendReminders}
            disabled={sendingReminders}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-neon-blue/10 text-neon-blue border border-neon-blue/20 hover:bg-neon-blue/20 transition-colors disabled:opacity-50"
          >
            {sendingReminders ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Envoyer rappels mail
          </button>

          {/* Bouton contextuel : Créance initiale ou Dette initiale selon l'onglet */}
          {isAdmin && (
            <button
              onClick={handleAddInitiale}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors',
                tab === 'creances'
                  ? 'bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20'
                  : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20'
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              {tab === 'creances' ? 'Créance initiale' : 'Dette initiale'}
            </button>
          )}

          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors px-2 py-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualiser
          </button>
        </div>
      </div>

      {/* ── Cartes résumé ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 space-y-1 border-l-2 border-neon-blue/50">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <ArrowDownLeft className="w-3.5 h-3.5 text-neon-blue" /> Créances en cours
          </p>
          <p className="text-xl font-bold text-white">{fmt(totalCreances + totalInitiales)}</p>
          <p className="text-xs text-slate-500">{totalCreancesCount} créance(s)</p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-red-500/50">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Créances en retard
          </p>
          <p className="text-xl font-bold text-red-400">
            {fmt(totalCreancesOverdue + initialesOverdue.reduce((s, i) => s + i.amount, 0))}
          </p>
          <p className="text-xs text-slate-500">
            {creances.filter(c => c.is_overdue).length + initialesOverdue.length} en retard
          </p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-orange-500/50">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-orange-400" /> Dettes en cours
          </p>
          <p className="text-xl font-bold text-white">{fmt(totalDettes + totalDettesInit)}</p>
          <p className="text-xs text-slate-500">{totalDettesCount} dette(s)</p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-red-500/50">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Dettes en retard
          </p>
          <p className="text-xl font-bold text-red-400">
            {fmt(totalDettesOverdue + dettesInitOverdue.reduce((s, d) => s + d.amount, 0))}
          </p>
          <p className="text-xs text-slate-500">
            {dettes.filter(d => d.is_overdue).length + dettesInitOverdue.length} en retard
          </p>
        </div>
      </div>

      {/* ── Barre recherche + filtres ────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Rechercher un client, fournisseur, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" /> Filtres :
          </div>

          {/* Statut */}
          <div className="flex rounded-lg overflow-hidden border border-dark-600 text-xs">
            {(['all', 'attente', 'retard'] as const).map(s => (
              <button key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  filterStatus === s
                    ? s === 'retard' ? 'bg-red-500/20 text-red-400'
                      : s === 'attente' ? 'bg-orange-500/20 text-orange-400'
                      : 'bg-neon-blue/20 text-neon-blue'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'
                )}
              >
                {s === 'all' ? 'Tous' : s === 'attente' ? 'En attente' : 'En retard'}
              </button>
            ))}
          </div>

          {/* Date de */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 whitespace-nowrap">Du</span>
            <input type="date" value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="input py-1 text-xs w-36"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 whitespace-nowrap">Au</span>
            <input type="date" value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="input py-1 text-xs w-36"
            />
          </div>

          {/* Afficher soldés */}
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none ml-auto">
            <input type="checkbox" checked={filterSettled}
              onChange={e => setFilterSettled(e.target.checked)}
              className="accent-neon-blue" />
            Afficher soldés
          </label>

          {/* Reset */}
          {(search || filterStatus !== 'all' || filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setSearch(''); setFilterStatus('all'); setFilterDateFrom(''); setFilterDateTo(''); }}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors underline"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {/* Résultats */}
        <p className="text-xs text-slate-500">
          {tab === 'creances'
            ? `${filteredCreances.length + filteredInitiales.length} créance(s) affichée(s)`
            : `${filteredDettes.length + filteredDettesInit.length} dette(s) affichée(s)`}
        </p>
      </div>

      {/* ── Onglets ──────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-dark-600 px-4">
          <div className="flex">
            <button
              onClick={() => setTab('creances')}
              className={cn(
                'px-5 py-3.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                tab === 'creances' ? 'border-neon-blue text-neon-blue' : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              <ArrowDownLeft className="w-4 h-4" />
              Créances
              {totalCreancesCount > 0 && (
                <span className="ml-1 bg-neon-blue/20 text-neon-blue text-xs px-1.5 py-0.5 rounded-full">
                  {totalCreancesCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('dettes')}
              className={cn(
                'px-5 py-3.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                tab === 'dettes' ? 'border-orange-400 text-orange-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              <ArrowUpRight className="w-4 h-4" />
              Dettes
              {totalDettesCount > 0 && (
                <span className="ml-1 bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded-full">
                  {totalDettesCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── CRÉANCES ──────────────────────────────────────────────────────── */}
        {tab === 'creances' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Chargement…</div>
            ) : (filteredCreances.length === 0 && filteredInitiales.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-400/40" />
                <p className="text-sm">Aucune créance en cours 🎉</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Référence</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Article / Opération</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Par</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">Depuis</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Échéance</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Montant</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {filteredCreances.map((c) => (
                    <tr key={c.id} className={cn('transition-colors',
                      c.is_overdue ? 'bg-red-500/5 hover:bg-red-500/10'
                      : c.is_settled ? 'opacity-50 hover:bg-dark-700/30'
                      : 'hover:bg-dark-700/30'
                    )}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-neon-blue">{c.reference_number}</td>
                      <td className="px-4 py-3">
                        {c.type === 'troc'
                          ? <span className="badge-violet text-xs">Troc</span>
                          : <span className="badge-blue text-xs">Vente</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs max-w-[220px]">
                        {creanceItems[c.id] ?? <span className="text-slate-600 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{c.client_name ?? <span className="text-slate-600 italic">—</span>}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{c.creator_name}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{formatDate(c.created_at)}</td>
                      <td className="px-4 py-3">
                        {c.credit_due_date ? (
                          <span className={cn('inline-flex items-center gap-1 text-xs font-medium', c.is_overdue ? 'text-red-400' : 'text-slate-300')}>
                            {c.is_overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                            {formatDate(c.credit_due_date)}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold text-white">{fmt(c.amount)}</p>
                        {(c.acompte ?? 0) > 0 && (
                          <p className="text-xs text-emerald-400 mt-0.5">Acompte : {fmt(c.acompte!)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.is_settled ? <span className="badge-green text-xs">Soldé</span>
                          : c.is_overdue ? <span className="badge-red text-xs">En retard</span>
                          : <span className="badge-orange text-xs flex items-center gap-1 justify-center"><Clock className="w-3 h-3" /> En attente</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!c.is_settled && (
                          <button
                            onClick={() => setConfirmSettle({
                              label: c.client_name ?? 'Client inconnu',
                              amount: c.amount,
                              onConfirm: () => settleCreance(c.id, c.type),
                            })}
                            disabled={saving === c.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {saving === c.id ? 'Enreg…' : 'Soldé'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Créances initiales */}
                  {filteredInitiales.map((ini) => {
                    const diffDays = (new Date().getTime() - new Date(ini.since_date).getTime()) / 86400000;
                    const isOverdue = !ini.is_settled && diffDays > 60;
                    return (
                      <tr key={'ini-' + ini.id} className={cn(
                        'transition-colors border-l-2 border-violet-500/30',
                        isOverdue ? 'bg-red-500/5 hover:bg-red-500/10'
                        : ini.is_settled ? 'opacity-50 hover:bg-dark-700/30'
                        : 'hover:bg-dark-700/30'
                      )}>
                        <td className="px-4 py-3 text-xs text-slate-500 italic">Situation init.</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20">Manuel</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 italic text-xs">—</td>
                        <td className="px-4 py-3 text-slate-300">{ini.client_name}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs italic">{ini.description ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(ini.since_date)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {isOverdue
                            ? <span className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> +60 jours</span>
                            : <span className="text-slate-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-white">{fmt(ini.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          {ini.is_settled ? <span className="badge-green text-xs">Soldé</span>
                            : isOverdue ? <span className="badge-red text-xs">En retard</span>
                            : <span className="badge-orange text-xs flex items-center gap-1 justify-center"><Clock className="w-3 h-3" /> En attente</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!ini.is_settled && (
                            <button
                              onClick={() => setConfirmSettle({
                                label: ini.client_name,
                                amount: ini.amount,
                                onConfirm: () => settleInitiale(ini.id),
                              })}
                              disabled={saving === ini.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {saving === ini.id ? 'Enreg…' : 'Soldé'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-dark-600 bg-dark-800/60">
                    <td colSpan={6} className="px-4 py-3 text-xs font-medium text-slate-400">
                      Total affiché
                      {(search || filterStatus !== 'all' || filterDateFrom || filterDateTo) && (
                        <span className="ml-2 text-slate-600 font-normal">
                          (sur {fmt(totalCreances + totalInitiales)} total)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-neon-blue">
                      {fmt(
                        filteredCreances.filter(c => !c.is_settled).reduce((s, c) => s + c.amount, 0) +
                        filteredInitiales.filter(i => !i.is_settled).reduce((s, i) => s + i.amount, 0)
                      )}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}

        {/* ── DETTES ────────────────────────────────────────────────────────── */}
        {tab === 'dettes' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Chargement…</div>
            ) : (filteredDettes.length === 0 && filteredDettesInit.length === 0) ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-400/40" />
                <p className="text-sm">Aucune dette en cours 🎉</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Catégorie</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Fournisseur</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Depuis</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Échéance</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Montant</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {/* Dettes issues des dépenses à crédit */}
                  {filteredDettes.map((d) => (
                    <tr key={d.id} className={cn('transition-colors',
                      d.is_overdue ? 'bg-red-500/5 hover:bg-red-500/10'
                      : d.is_settled ? 'opacity-50 hover:bg-dark-700/30'
                      : 'hover:bg-dark-700/30'
                    )}>
                      <td className="px-4 py-3">
                        {d.category_name ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ background: (d.category_color ?? '#6366f1') + '22', color: d.category_color ?? '#6366f1', border: `1px solid ${d.category_color ?? '#6366f1'}44` }}>
                            {d.category_name}
                          </span>
                        ) : <span className="text-slate-600 text-xs italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">{d.description}</td>
                      <td className="px-4 py-3 text-slate-400">{d.supplier_name ?? <span className="text-slate-600 italic text-xs">—</span>}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(d.expense_date)}</td>
                      <td className="px-4 py-3">
                        {d.credit_due_date ? (
                          <span className={cn('inline-flex items-center gap-1 text-xs font-medium', d.is_overdue ? 'text-red-400' : 'text-slate-300')}>
                            {d.is_overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                            {formatDate(d.credit_due_date)}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">{fmt(d.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {d.is_settled ? <span className="badge-green text-xs">Soldé</span>
                          : d.is_overdue ? <span className="badge-red text-xs">En retard</span>
                          : <span className="badge-orange text-xs flex items-center gap-1 justify-center"><Clock className="w-3 h-3" /> En attente</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!d.is_settled && (
                          <button
                            onClick={() => setConfirmSettle({
                              label: d.supplier_name ?? d.description,
                              amount: d.amount,
                              onConfirm: () => settleDette(d.id),
                            })}
                            disabled={saving === d.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {saving === d.id ? 'Enreg…' : 'Soldé'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Dettes initiales */}
                  {filteredDettesInit.map((di) => {
                    const diffDays = (new Date().getTime() - new Date(di.since_date).getTime()) / 86400000;
                    const isOverdue = !di.is_settled && diffDays > 60;
                    return (
                      <tr key={'di-' + di.id} className={cn(
                        'transition-colors border-l-2 border-orange-500/30',
                        isOverdue ? 'bg-red-500/5 hover:bg-red-500/10'
                        : di.is_settled ? 'opacity-50 hover:bg-dark-700/30'
                        : 'hover:bg-dark-700/30'
                      )}>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">Manuel</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs italic">{di.description ?? <span className="text-slate-600">Situation initiale</span>}</td>
                        <td className="px-4 py-3 text-slate-300">{di.supplier_name}</td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(di.since_date)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {isOverdue
                            ? <span className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> +60 jours</span>
                            : <span className="text-slate-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-white">{fmt(di.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          {di.is_settled ? <span className="badge-green text-xs">Soldé</span>
                            : isOverdue ? <span className="badge-red text-xs">En retard</span>
                            : <span className="badge-orange text-xs flex items-center gap-1 justify-center"><Clock className="w-3 h-3" /> En attente</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!di.is_settled && (
                            <button
                              onClick={() => setConfirmSettle({
                                label: di.supplier_name,
                                amount: di.amount,
                                onConfirm: () => settleDetteInitiale(di.id),
                              })}
                              disabled={saving === di.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {saving === di.id ? 'Enreg…' : 'Soldé'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-dark-600 bg-dark-800/60">
                    <td colSpan={5} className="px-4 py-3 text-xs font-medium text-slate-400">
                      Total affiché
                      {(search || filterStatus !== 'all' || filterDateFrom || filterDateTo) && (
                        <span className="ml-2 text-slate-600 font-normal">
                          (sur {fmt(totalDettes + totalDettesInit)} total)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-orange-400">
                      {fmt(
                        filteredDettes.filter(d => !d.is_settled).reduce((s, d) => s + d.amount, 0) +
                        filteredDettesInit.filter(d => !d.is_settled).reduce((s, d) => s + d.amount, 0)
                      )}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Note explicative ─────────────────────────────────────────────────── */}
      <div className="card p-4 bg-dark-800/40 flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-neon-blue/10 border border-neon-blue/20 flex items-center justify-center">
          <Landmark className="w-4 h-4 text-neon-blue" />
        </div>
        <div className="space-y-1 text-sm text-slate-400">
          <p className="font-medium text-slate-300">À propos de ce module</p>
          <p>
            Les <span className="text-neon-blue font-medium">créances</span> sont les montants que tes clients te doivent.
            Les <span className="text-orange-400 font-medium">dettes</span> sont les montants que tu dois à tes fournisseurs.
            Les lignes à <span className="text-violet-400 font-medium">bordure violette</span> (créances) ou <span className="text-orange-400 font-medium">orange</span> (dettes)
            sont des situations saisies manuellement, antérieures à l&apos;app.
            Le bouton <span className="text-neon-blue font-medium">Envoyer rappels mail</span> envoie un récapitulatif de toutes les créances/dettes en retard.
          </p>
        </div>
      </div>

      {/* ===== MODAL CONFIRMATION SOLDE ===== */}
      {confirmSettle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmSettle(null)}>
          <div className="card w-full max-w-sm p-6 space-y-4 border border-emerald-500/20"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Confirmer le solde</h3>
                <p className="text-xs text-slate-500 mt-0.5">Cette action est irréversible</p>
              </div>
            </div>
            <div className="bg-dark-700 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Concerné</span>
                <span className="text-slate-200 font-medium">{confirmSettle.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Montant soldé</span>
                <span className="font-bold text-emerald-400">{fmt(confirmSettle.amount)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setConfirmSettle(null)} className="btn-secondary">
                Annuler
              </button>
              <button
                onClick={() => {
                  confirmSettle.onConfirm();
                  setConfirmSettle(null);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                Oui, marquer soldé
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL CRÉANCE INITIALE ===== */}
      {showInitForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowInitForm(false)}>
          <form onSubmit={handleCreateInitiale} className="card w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-violet-400" />
                <h3 className="font-semibold text-slate-200">Saisir une créance initiale</h3>
              </div>
              <button type="button" onClick={() => setShowInitForm(false)} className="text-slate-500 hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 bg-dark-700 rounded-lg p-3">
              Enregistrer une dette client qui existait avant la mise en service de l&apos;app.
            </p>
            <div className="space-y-4">
              <div>
                <label className="label">Nom du client *</label>
                <input type="text" className="input" placeholder="Ex: Jean Kouassi"
                  value={initClient} onChange={e => setInitClient(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Montant (FCFA) *</label>
                  <input type="number" min={1} className="input" placeholder="ex: 150000"
                    value={initAmount} onChange={e => setInitAmount(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Depuis le *</label>
                  <input type="date" className="input" max={localDateStr()}
                    value={initSince} onChange={e => setInitSince(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="label">Description / Motif</label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Ex: Vente téléphone non réglée…"
                  value={initDesc} onChange={e => setInitDesc(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowInitForm(false)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={savingInit || !initClient.trim() || !initAmount} className="btn-primary min-w-32">
                {savingInit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {savingInit ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== MODAL DETTE INITIALE ===== */}
      {showDetteInitForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowDetteInitForm(false)}>
          <form onSubmit={handleCreateDetteInitiale} className="card w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold text-slate-200">Saisir une dette initiale</h3>
              </div>
              <button type="button" onClick={() => setShowDetteInitForm(false)} className="text-slate-500 hover:text-slate-200"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 bg-dark-700 rounded-lg p-3">
              Enregistrer une dette fournisseur qui existait avant la mise en service de l&apos;app.
            </p>
            <div className="space-y-4">
              <div>
                <label className="label">Nom du fournisseur *</label>
                <input type="text" className="input" placeholder="Ex: Grossiste Téléphones SA"
                  value={detteInitSupplier} onChange={e => setDetteInitSupplier(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Montant (FCFA) *</label>
                  <input type="number" min={1} className="input" placeholder="ex: 500000"
                    value={detteInitAmount} onChange={e => setDetteInitAmount(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Depuis le *</label>
                  <input type="date" className="input" max={localDateStr()}
                    value={detteInitSince} onChange={e => setDetteInitSince(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="label">Description / Motif</label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Ex: Stock reçu non encore payé, dette ancienne…"
                  value={detteInitDesc} onChange={e => setDetteInitDesc(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowDetteInitForm(false)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={savingDetteInit || !detteInitSupplier.trim() || !detteInitAmount} className="btn-primary min-w-32">
                {savingDetteInit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {savingDetteInit ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
