'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Wallet, TrendingUp, TrendingDown, Plus, Minus, Settings,
  Calendar, ChevronDown, ChevronUp, Loader2, PiggyBank,
  Banknote, Smartphone, Building2, X, Check
} from 'lucide-react';
import { cn, localDateStr, formatCFA } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TreasuryAccount {
  id: string;
  name: string;
  type: 'especes' | 'banque' | 'mobile_money';
  payment_keys: string[];
  initial_balance: number;
}

interface Apport {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
  account?: { name: string };
}

interface Retrait {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
  account?: { name: string };
}

type Period = 'today' | 'week' | 'month' | 'year' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week',  label: '7 jours'    },
  { key: 'month', label: 'Ce mois'    },
  { key: 'year',  label: 'Cette année'},
  { key: 'all',   label: 'Tout'       },
];

function getDateRange(period: Period): { from: string | null; to: string } {
  const now = new Date();
  const to  = now.toISOString();

  if (period === 'all')   return { from: null, to };
  if (period === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    return { from, to };
  }
  if (period === 'week') {
    const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return { from, to };
  }
  // year
  const from = new Date(now.getFullYear(), 0, 1).toISOString();
  return { from, to };
}

// Les colonnes `date` SQL (expense_date, dates d'apport/retrait) n'ont pas
// d'heure — les traiter comme minuit UTC (`+ 'T00:00:00.000Z'`) les décale
// d'une heure par rapport aux bornes de période ci-dessus, qui elles sont
// construites en heure locale du navigateur. Pour un magasin en UTC+1, une
// dépense saisie en tout début/fin de journée pouvait donc basculer dans le
// mauvais bucket "avant"/"pendant" la période (bug corrigé le 2026-09-10).
// On interprète systématiquement ces dates comme minuit local, comme le
// reste de cette page.
function localDateToISO(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toISOString();
}

function accountIcon(type: string) {
  if (type === 'banque')       return Building2;
  if (type === 'mobile_money') return Smartphone;
  return Banknote;
}
function accountColor(type: string) {
  if (type === 'banque')       return 'text-blue-400';
  if (type === 'mobile_money') return 'text-violet-400';
  return 'text-emerald-400';
}
function accountBg(type: string) {
  if (type === 'banque')       return 'bg-blue-500/10';
  if (type === 'mobile_money') return 'bg-violet-500/10';
  return 'bg-emerald-500/10';
}

// ─── Composant ────────────────────────────────────────────────────────────────
export default function TresoreriePage() {
  const supabase = createClient();

  const [period,   setPeriod]   = useState<Period>('month');
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [apports,  setApports]  = useState<Apport[]>([]);
  const [retraits, setRetraits] = useState<Retrait[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Balances calculées
  const [balances, setBalances] = useState<Record<string, { debut: number; fin: number; entrees: number; sorties: number; apports: number; retraits: number }>>({});

  // Modal apport
  const [showApport,   setShowApport]   = useState(false);
  const [apportAccId,  setApportAccId]  = useState('');
  const [apportAmt,    setApportAmt]    = useState('');
  const [apportDate,   setApportDate]   = useState(() => localDateStr());
  const [apportNote,   setApportNote]   = useState('');
  const [savingApport, setSavingApport] = useState(false);

  // Modal retrait
  const [showRetrait,   setShowRetrait]   = useState(false);
  const [retraitAccId,  setRetraitAccId]  = useState('');
  const [retraitAmt,    setRetraitAmt]    = useState('');
  const [retraitDate,   setRetraitDate]   = useState(() => localDateStr());
  const [retraitNote,   setRetraitNote]   = useState('');
  const [savingRetrait, setSavingRetrait] = useState(false);

  // Modal solde initial
  const [showInit,   setShowInit]   = useState(false);
  const [initValues, setInitValues] = useState<Record<string, string>>({});
  const [savingInit, setSavingInit] = useState(false);

  // ── Chargement données ─────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(period);

    // 1. Comptes
    const { data: accs } = await supabase
      .from('treasury_accounts')
      .select('*')
      .order('type');

    // 2. Apports (tous)
    const { data: allApports } = await supabase
      .from('treasury_apports')
      .select('*, account:treasury_accounts(name)')
      .order('date', { ascending: false });

    // 2bis. Retraits DG (tous)
    const { data: allRetraits } = await supabase
      .from('treasury_retraits')
      .select('*, account:treasury_accounts(name)')
      .order('date', { ascending: false });

    // 3. Ventes (toutes, hors crédit)
    const { data: allSales } = await supabase
      .from('sales')
      .select('total, payment_method, created_at')
      .neq('payment_method', 'credit');

    // 4. Dépenses (toutes)
    const { data: allExpenses } = await supabase
      .from('expenses')
      .select('amount, payment_method, expense_date');

    // 5. Avoirs (tous) avec payment_method de la vente originale
    const { data: allAvoirs } = await supabase
      .from('sale_avoirs')
      .select('total, created_at, sale:sales(payment_method)');

    // 6. Trocs (tous) — complement > 0 = encaissement, < 0 = décaissement
    const { data: allTrocs } = await supabase
      .from('trocs')
      .select('complement, payment_method, created_at');

    // 7. Règlements de créances/dettes soldées (compte + montant renseignés à la saisie)
    const [{ data: settledSales }, { data: settledTrocs }, { data: settledInitiales }] = await Promise.all([
      supabase.from('sales').select('settled_amount, settled_account_id, settled_at').not('settled_account_id', 'is', null),
      supabase.from('trocs').select('settled_amount, settled_account_id, settled_at').not('settled_account_id', 'is', null),
      supabase.from('creances_initiales').select('settled_amount, settled_account_id, settled_at').not('settled_account_id', 'is', null),
    ]);
    const settledData = [
      ...(settledSales ?? []), ...(settledTrocs ?? []), ...(settledInitiales ?? []),
    ] as { settled_amount: number | null; settled_account_id: string | null; settled_at: string | null }[];

    const accsData = (accs ?? []) as TreasuryAccount[];
    const apportsData = (allApports ?? []) as Apport[];
    const retraitsData = (allRetraits ?? []) as Retrait[];

    setAccounts(accsData);
    setApports(apportsData);
    setRetraits(retraitsData);

    // ── Calcul des soldes ──────────────────────────────────────────────────
    const computed: Record<string, { debut: number; fin: number; entrees: number; sorties: number; apports: number; retraits: number }> = {};

    for (const acc of accsData) {
      const keys = acc.payment_keys;

      // Mouvement avant la période (pour solde début)
      let beforeEntrees = 0;
      let beforeSorties = 0;
      let beforeApports = 0;
      let beforeRetraits = 0;

      // Mouvement pendant la période
      let duringEntrees = 0;
      let duringSorties = 0;
      let duringApports = 0;
      let duringRetraits = 0;

      // Ventes
      for (const s of allSales ?? []) {
        if (!keys.includes(s.payment_method)) continue;
        const dt = s.created_at;
        const inPeriod = (!from || dt >= from) && dt <= to;
        if (inPeriod) duringEntrees += s.total ?? 0;
        else if (!from || dt < from) beforeEntrees += s.total ?? 0;
      }

      // Dépenses
      for (const e of allExpenses ?? []) {
        if (!keys.includes(e.payment_method)) continue;
        const dt = localDateToISO(e.expense_date);
        const inPeriod = (!from || dt >= from) && dt <= to;
        if (inPeriod) duringSorties += e.amount ?? 0;
        else if (!from || dt < from) beforeSorties += e.amount ?? 0;
      }

      // Avoirs (remboursements)
      for (const av of allAvoirs ?? []) {
        const pm = (av.sale as unknown as { payment_method: string } | null)?.payment_method;
        if (!pm || !keys.includes(pm)) continue;
        const dt = av.created_at;
        const inPeriod = (!from || dt >= from) && dt <= to;
        if (inPeriod) duringSorties += av.total ?? 0;
        else if (!from || dt < from) beforeSorties += av.total ?? 0;
      }

      // Trocs (complément) — positif = encaissement, négatif = le magasin rend de l'argent
      for (const t of allTrocs ?? []) {
        if (!keys.includes(t.payment_method)) continue;
        const dt = t.created_at;
        const inPeriod = (!from || dt >= from) && dt <= to;
        const c = t.complement ?? 0;
        if (c >= 0) {
          if (inPeriod) duringEntrees += c; else if (!from || dt < from) beforeEntrees += c;
        } else {
          const abs = Math.abs(c);
          if (inPeriod) duringSorties += abs; else if (!from || dt < from) beforeSorties += abs;
        }
      }

      // Règlements de créances soldées (compte renseigné à la saisie)
      for (const r of settledData) {
        if (r.settled_account_id !== acc.id || !r.settled_at) continue;
        const dt = r.settled_at;
        const inPeriod = (!from || dt >= from) && dt <= to;
        const amt = r.settled_amount ?? 0;
        if (inPeriod) duringEntrees += amt; else if (!from || dt < from) beforeEntrees += amt;
      }

      // Apports DG
      for (const ap of apportsData) {
        if (ap.account_id !== acc.id) continue;
        const dt = localDateToISO(ap.date);
        const inPeriod = (!from || dt >= from) && dt <= to;
        if (inPeriod) duringApports += ap.amount ?? 0;
        else if (!from || dt < from) beforeApports += ap.amount ?? 0;
      }

      // Retraits DG
      for (const rt of retraitsData) {
        if (rt.account_id !== acc.id) continue;
        const dt = localDateToISO(rt.date);
        const inPeriod = (!from || dt >= from) && dt <= to;
        if (inPeriod) duringRetraits += rt.amount ?? 0;
        else if (!from || dt < from) beforeRetraits += rt.amount ?? 0;
      }

      const soldeDebut = acc.initial_balance + beforeEntrees + beforeApports - beforeSorties - beforeRetraits;
      const soldeFin   = soldeDebut + duringEntrees + duringApports - duringSorties - duringRetraits;

      computed[acc.id] = {
        debut:    soldeDebut,
        fin:      soldeFin,
        entrees:  duringEntrees + duringApports,
        sorties:  duringSorties + duringRetraits,
        apports:  duringApports,
        retraits: duringRetraits,
      };
    }

    setBalances(computed);
    setLoading(false);
  }, [supabase, period]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Apport DG ─────────────────────────────────────────────────────────────
  async function handleApport(e: React.FormEvent) {
    e.preventDefault();
    if (!apportAccId || !apportAmt) return;
    setSavingApport(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('treasury_apports').insert({
      account_id: apportAccId,
      amount:     parseFloat(apportAmt),
      date:       apportDate,
      note:       apportNote.trim() || null,
      created_by: user!.id,
    });
    setSavingApport(false);
    setShowApport(false);
    setApportAmt(''); setApportNote('');
    loadData();
  }

  // ── Retrait DG ────────────────────────────────────────────────────────────
  async function handleRetrait(e: React.FormEvent) {
    e.preventDefault();
    if (!retraitAccId || !retraitAmt) return;
    setSavingRetrait(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('treasury_retraits').insert({
      account_id: retraitAccId,
      amount:     parseFloat(retraitAmt),
      date:       retraitDate,
      note:       retraitNote.trim() || null,
      created_by: user!.id,
    });
    setSavingRetrait(false);
    setShowRetrait(false);
    setRetraitAmt(''); setRetraitNote('');
    loadData();
  }

  // ── Solde initial ──────────────────────────────────────────────────────────
  function openInit() {
    const vals: Record<string, string> = {};
    accounts.forEach(a => { vals[a.id] = String(a.initial_balance); });
    setInitValues(vals);
    setShowInit(true);
  }

  async function handleSaveInit(e: React.FormEvent) {
    e.preventDefault();
    setSavingInit(true);
    await Promise.all(
      accounts.map(a =>
        supabase.from('treasury_accounts')
          .update({ initial_balance: parseFloat(initValues[a.id] ?? '0') || 0 })
          .eq('id', a.id)
      )
    );
    setSavingInit(false);
    setShowInit(false);
    loadData();
  }

  const totalDebut = Object.values(balances).reduce((s, b) => s + b.debut, 0);
  const totalFin   = Object.values(balances).reduce((s, b) => s + b.fin,   0);
  const diff       = totalFin - totalDebut;

  return (
    <div className="space-y-6">

      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-neon-blue" />
            Trésorerie
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Disponibilités en temps réel</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openInit}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 border border-dark-600 hover:border-dark-500 rounded-lg px-3 py-1.5 transition-colors">
            <Settings className="w-3.5 h-3.5" /> Soldes initiaux
          </button>
          <button onClick={() => { setRetraitAccId(accounts[0]?.id ?? ''); setShowRetrait(true); }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
            <Minus className="w-3.5 h-3.5" /> Retrait DG
          </button>
          <button onClick={() => { setApportAccId(accounts[0]?.id ?? ''); setShowApport(true); }}
            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Apport DG
          </button>
        </div>
      </div>

      {/* ── Sélecteur période ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-slate-500" />
        <div className="flex rounded-xl overflow-hidden border border-dark-600 bg-dark-800">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-all duration-150',
                period === p.key
                  ? 'bg-neon-blue/20 text-neon-blue'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'
              )}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Résumé global ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs text-slate-500 mb-1">Solde début de période</p>
          <p className="text-2xl font-bold text-white">{formatCFA(totalDebut)}</p>
        </div>
        <div className={cn('card p-5 border', diff >= 0 ? 'border-emerald-500/20' : 'border-red-500/20')}>
          <p className="text-xs text-slate-500 mb-1">Variation sur la période</p>
          <p className={cn('text-2xl font-bold flex items-center gap-1', diff >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {diff >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            {diff >= 0 ? '+' : ''}{formatCFA(diff)}
          </p>
        </div>
        <div className="card p-5 border border-neon-blue/20">
          <p className="text-xs text-slate-500 mb-1">Solde fin de période</p>
          <p className="text-2xl font-bold text-neon-blue">{formatCFA(totalFin)}</p>
        </div>
      </div>

      {/* ── Comptes ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-neon-blue" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {accounts.map(acc => {
            const b = balances[acc.id] ?? { debut: 0, fin: 0, entrees: 0, sorties: 0, apports: 0 };
            const Icon = accountIcon(acc.type);
            const variation = b.fin - b.debut;
            return (
              <div key={acc.id} className="card p-5 space-y-4">
                {/* Header compte */}
                <div className="flex items-center gap-3">
                  <div className={cn('p-2 rounded-xl', accountBg(acc.type))}>
                    <Icon className={cn('w-5 h-5', accountColor(acc.type))} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-200 text-sm">{acc.name}</p>
                    <p className="text-xs text-slate-500">
                      Solde initial : {formatCFA(acc.initial_balance)}
                    </p>
                  </div>
                </div>

                {/* Soldes */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Début de période</span>
                    <span className="font-mono text-slate-200">{formatCFA(b.debut)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Entrées</span>
                    <span className="font-mono text-emerald-400">+{formatCFA(b.entrees)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Sorties</span>
                    <span className="font-mono text-red-400">-{formatCFA(b.sorties)}</span>
                  </div>
                  <div className="border-t border-dark-600 pt-2 flex justify-between">
                    <span className="text-sm font-semibold text-slate-200">Solde fin</span>
                    <span className={cn('font-bold text-sm', b.fin >= 0 ? 'text-neon-blue' : 'text-red-400')}>
                      {formatCFA(b.fin)}
                    </span>
                  </div>
                </div>

                {/* Badge variation */}
                <div className={cn(
                  'flex items-center gap-1 text-xs px-2 py-1 rounded-lg w-fit',
                  variation >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                )}>
                  {variation >= 0 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {variation >= 0 ? '+' : ''}{formatCFA(variation)} sur la période
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Apports récents ─────────────────────────────────────────────────── */}
      {apports.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <PiggyBank className="w-4 h-4 text-neon-blue" />
            Apports DG récents
          </h3>
          <div className="space-y-2">
            {apports.slice(0, 10).map(ap => (
              <div key={ap.id} className="flex items-center justify-between py-2 border-b border-dark-700 last:border-0">
                <div>
                  <p className="text-sm text-slate-200">{ap.account?.name}</p>
                  <p className="text-xs text-slate-500">{new Date(ap.date).toLocaleDateString('fr-FR')} {ap.note ? `— ${ap.note}` : ''}</p>
                </div>
                <span className="text-emerald-400 font-semibold text-sm">+{formatCFA(ap.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Retraits récents ─────────────────────────────────────────────────── */}
      {retraits.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Minus className="w-4 h-4 text-red-400" />
            Retraits DG récents
          </h3>
          <div className="space-y-2">
            {retraits.slice(0, 10).map(rt => (
              <div key={rt.id} className="flex items-center justify-between py-2 border-b border-dark-700 last:border-0">
                <div>
                  <p className="text-sm text-slate-200">{rt.account?.name}</p>
                  <p className="text-xs text-slate-500">{new Date(rt.date).toLocaleDateString('fr-FR')} {rt.note ? `— ${rt.note}` : ''}</p>
                </div>
                <span className="text-red-400 font-semibold text-sm">-{formatCFA(rt.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal Apport DG ─────────────────────────────────────────────────── */}
      {showApport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleApport} className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <PiggyBank className="w-5 h-5 text-neon-blue" /> Apport de fonds
              </h3>
              <button type="button" onClick={() => setShowApport(false)}>
                <X className="w-5 h-5 text-slate-500 hover:text-slate-200" />
              </button>
            </div>

            <div>
              <label className="label">Compte</label>
              <select value={apportAccId} onChange={e => setApportAccId(e.target.value)} className="input">
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Montant (FCFA)</label>
              <input type="number" value={apportAmt} onChange={e => setApportAmt(e.target.value)}
                className="input" placeholder="Ex: 500000" required min={1} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={apportDate} onChange={e => setApportDate(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input type="text" value={apportNote} onChange={e => setApportNote(e.target.value)}
                className="input" placeholder="Ex: Apport mensuel DG" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowApport(false)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={savingApport} className="btn-primary min-w-32 flex items-center gap-2 justify-center">
                {savingApport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {savingApport ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal Retrait DG ─────────────────────────────────────────────────── */}
      {showRetrait && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleRetrait} className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <Minus className="w-5 h-5 text-red-400" /> Retrait de fonds
              </h3>
              <button type="button" onClick={() => setShowRetrait(false)}>
                <X className="w-5 h-5 text-slate-500 hover:text-slate-200" />
              </button>
            </div>

            <div>
              <label className="label">Compte</label>
              <select value={retraitAccId} onChange={e => setRetraitAccId(e.target.value)} className="input">
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Montant (FCFA)</label>
              <input type="number" value={retraitAmt} onChange={e => setRetraitAmt(e.target.value)}
                className="input" placeholder="Ex: 200000" required min={1} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={retraitDate} onChange={e => setRetraitDate(e.target.value)} className="input" required />
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input type="text" value={retraitNote} onChange={e => setRetraitNote(e.target.value)}
                className="input" placeholder="Ex: Retrait personnel DG" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowRetrait(false)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={savingRetrait} className="btn-primary min-w-32 flex items-center gap-2 justify-center">
                {savingRetrait ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {savingRetrait ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal Soldes initiaux ────────────────────────────────────────────── */}
      {showInit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleSaveInit} className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <Settings className="w-5 h-5 text-neon-blue" /> Soldes initiaux
              </h3>
              <button type="button" onClick={() => setShowInit(false)}>
                <X className="w-5 h-5 text-slate-500 hover:text-slate-200" />
              </button>
            </div>
            <p className="text-xs text-slate-500">Saisissez les soldes de départ (avant toute opération dans CEOZEN).</p>

            {accounts.map(a => {
              const Icon = accountIcon(a.type);
              return (
                <div key={a.id}>
                  <label className="label flex items-center gap-1.5">
                    <Icon className={cn('w-3.5 h-3.5', accountColor(a.type))} />
                    {a.name}
                  </label>
                  <input type="number" value={initValues[a.id] ?? '0'}
                    onChange={e => setInitValues(prev => ({ ...prev, [a.id]: e.target.value }))}
                    className="input" min={0} />
                </div>
              );
            })}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowInit(false)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={savingInit} className="btn-primary min-w-32 flex items-center gap-2 justify-center">
                {savingInit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {savingInit ? 'Enregistrement…' : 'Sauvegarder'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
