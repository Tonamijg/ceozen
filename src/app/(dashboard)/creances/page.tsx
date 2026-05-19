'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VCreance, VDette } from '@/types';
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock,
  AlertTriangle, RefreshCw, Landmark
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

type Tab = 'creances' | 'dettes';

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CreancesPage() {
  const supabase = createClient();

  const [tab, setTab]             = useState<Tab>('creances');
  const [creances, setCreances]   = useState<VCreance[]>([]);
  const [dettes, setDettes]       = useState<VDette[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState<string | null>(null);
  const [filterSettled, setFilterSettled] = useState(false);

  // ── Chargement ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: c }, { data: d }] = await Promise.all([
      supabase.from('v_creances').select('*').order('created_at', { ascending: false }),
      supabase.from('v_dettes').select('*').order('expense_date', { ascending: false }),
    ]);
    setCreances((c ?? []) as VCreance[]);
    setDettes((d ?? []) as VDette[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Marquer une créance soldée ──────────────────────────────────────────────
  async function settleCreance(id: string) {
    setSaving(id);
    await supabase.from('sales').update({ is_settled: true }).eq('id', id);
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

  // ── Totaux ──────────────────────────────────────────────────────────────────
  const totalCreances        = creances.filter(c => !c.is_settled).reduce((s, c) => s + c.total, 0);
  const totalCreancesOverdue = creances.filter(c => c.is_overdue).reduce((s, c) => s + c.total, 0);
  const totalDettes          = dettes.filter(d => !d.is_settled).reduce((s, d) => s + d.amount, 0);
  const totalDettesOverdue   = dettes.filter(d => d.is_overdue).reduce((s, d) => s + d.amount, 0);

  const filteredCreances = filterSettled ? creances : creances.filter(c => !c.is_settled);
  const filteredDettes   = filterSettled ? dettes   : dettes.filter(d => !d.is_settled);

  return (
    <div className="space-y-6">

      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-neon-blue" />
          <p className="text-sm text-slate-400">Suivi des créances clients et dettes fournisseurs</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </button>
      </div>

      {/* ── Cartes résumé ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 space-y-1 border-l-2 border-neon-blue/50">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <ArrowDownLeft className="w-3.5 h-3.5 text-neon-blue" /> Créances en cours
          </p>
          <p className="text-xl font-bold text-white">{fmt(totalCreances)}</p>
          <p className="text-xs text-slate-500">{creances.filter(c => !c.is_settled).length} vente(s)</p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-red-500/50">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Créances en retard
          </p>
          <p className="text-xl font-bold text-red-400">{fmt(totalCreancesOverdue)}</p>
          <p className="text-xs text-slate-500">{creances.filter(c => c.is_overdue).length} vente(s)</p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-orange-500/50">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-orange-400" /> Dettes en cours
          </p>
          <p className="text-xl font-bold text-white">{fmt(totalDettes)}</p>
          <p className="text-xs text-slate-500">{dettes.filter(d => !d.is_settled).length} dépense(s)</p>
        </div>
        <div className="card p-4 space-y-1 border-l-2 border-red-500/50">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Dettes en retard
          </p>
          <p className="text-xl font-bold text-red-400">{fmt(totalDettesOverdue)}</p>
          <p className="text-xs text-slate-500">{dettes.filter(d => d.is_overdue).length} dépense(s)</p>
        </div>
      </div>

      {/* ── Onglets ──────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {/* Tabs header */}
        <div className="flex items-center justify-between border-b border-dark-600 px-4">
          <div className="flex">
            <button
              onClick={() => setTab('creances')}
              className={cn(
                'px-5 py-3.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                tab === 'creances'
                  ? 'border-neon-blue text-neon-blue'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              <ArrowDownLeft className="w-4 h-4" />
              Créances
              {creances.filter(c => !c.is_settled).length > 0 && (
                <span className="ml-1 bg-neon-blue/20 text-neon-blue text-xs px-1.5 py-0.5 rounded-full">
                  {creances.filter(c => !c.is_settled).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('dettes')}
              className={cn(
                'px-5 py-3.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
                tab === 'dettes'
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              <ArrowUpRight className="w-4 h-4" />
              Dettes
              {dettes.filter(d => !d.is_settled).length > 0 && (
                <span className="ml-1 bg-orange-500/20 text-orange-400 text-xs px-1.5 py-0.5 rounded-full">
                  {dettes.filter(d => !d.is_settled).length}
                </span>
              )}
            </button>
          </div>
          {/* Filtre soldés */}
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterSettled}
              onChange={e => setFilterSettled(e.target.checked)}
              className="accent-neon-blue"
            />
            Afficher soldés
          </label>
        </div>

        {/* ── CRÉANCES ──────────────────────────────────────────────────────── */}
        {tab === 'creances' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
                Chargement…
              </div>
            ) : filteredCreances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-400/40" />
                <p className="text-sm">Aucune créance en cours 🎉</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">N° Vente</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Vendeur</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Date vente</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Échéance</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Montant</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {filteredCreances.map((c) => (
                    <tr
                      key={c.id}
                      className={cn(
                        'transition-colors',
                        c.is_overdue   ? 'bg-red-500/5 hover:bg-red-500/10'
                        : c.is_settled ? 'opacity-50 hover:bg-dark-700/30'
                        :                'hover:bg-dark-700/30'
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-neon-blue text-xs">{c.sale_number}</td>
                      <td className="px-4 py-3 text-slate-300">{c.client_name ?? <span className="text-slate-600 italic">—</span>}</td>
                      <td className="px-4 py-3 text-slate-400">{c.seller_name}</td>
                      <td className="px-4 py-3 text-slate-400">{formatDate(c.created_at)}</td>
                      <td className="px-4 py-3">
                        {c.credit_due_date ? (
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            c.is_overdue ? 'text-red-400' : 'text-slate-300'
                          )}>
                            {c.is_overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                            {formatDate(c.credit_due_date)}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">{fmt(c.total)}</td>
                      <td className="px-4 py-3 text-center">
                        {c.is_settled ? (
                          <span className="badge-green text-xs">Soldé</span>
                        ) : c.is_overdue ? (
                          <span className="badge-red text-xs">En retard</span>
                        ) : (
                          <span className="badge-orange text-xs flex items-center gap-1 justify-center">
                            <Clock className="w-3 h-3" /> En attente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!c.is_settled && (
                          <button
                            onClick={() => settleCreance(c.id)}
                            disabled={saving === c.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                       bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                                       hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {saving === c.id ? 'Enregistrement…' : 'Marquer soldé'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Total */}
                <tfoot>
                  <tr className="border-t border-dark-600 bg-dark-800/60">
                    <td colSpan={5} className="px-4 py-3 text-xs font-medium text-slate-400">
                      Total non soldé
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-neon-blue">
                      {fmt(totalCreances)}
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
              <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
                Chargement…
              </div>
            ) : filteredDettes.length === 0 ? (
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
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Échéance</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Montant</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {filteredDettes.map((d) => (
                    <tr
                      key={d.id}
                      className={cn(
                        'transition-colors',
                        d.is_overdue   ? 'bg-red-500/5 hover:bg-red-500/10'
                        : d.is_settled ? 'opacity-50 hover:bg-dark-700/30'
                        :                'hover:bg-dark-700/30'
                      )}
                    >
                      <td className="px-4 py-3">
                        {d.category_name ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                              background: (d.category_color ?? '#6366f1') + '22',
                              color:       d.category_color ?? '#6366f1',
                              border:     `1px solid ${d.category_color ?? '#6366f1'}44`,
                            }}
                          >
                            {d.category_name}
                          </span>
                        ) : <span className="text-slate-600 text-xs italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300 max-w-[200px] truncate">{d.description}</td>
                      <td className="px-4 py-3 text-slate-400">{d.supplier_name ?? <span className="text-slate-600 italic text-xs">—</span>}</td>
                      <td className="px-4 py-3 text-slate-400">{formatDate(d.expense_date)}</td>
                      <td className="px-4 py-3">
                        {d.credit_due_date ? (
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            d.is_overdue ? 'text-red-400' : 'text-slate-300'
                          )}>
                            {d.is_overdue && <AlertTriangle className="w-3.5 h-3.5" />}
                            {formatDate(d.credit_due_date)}
                          </span>
                        ) : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">{fmt(d.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {d.is_settled ? (
                          <span className="badge-green text-xs">Soldé</span>
                        ) : d.is_overdue ? (
                          <span className="badge-red text-xs">En retard</span>
                        ) : (
                          <span className="badge-orange text-xs flex items-center gap-1 justify-center">
                            <Clock className="w-3 h-3" /> En attente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!d.is_settled && (
                          <button
                            onClick={() => settleDette(d.id)}
                            disabled={saving === d.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                       bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                                       hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {saving === d.id ? 'Enregistrement…' : 'Marquer soldé'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Total */}
                <tfoot>
                  <tr className="border-t border-dark-600 bg-dark-800/60">
                    <td colSpan={5} className="px-4 py-3 text-xs font-medium text-slate-400">
                      Total non soldé
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-orange-400">
                      {fmt(totalDettes)}
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
            Les <span className="text-neon-blue font-medium">créances</span> sont les montants que tes clients te doivent
            (ventes payées en crédit). Les <span className="text-orange-400 font-medium">dettes</span> sont les montants
            que tu dois à tes fournisseurs (dépenses en crédit).
            Clique sur <span className="text-emerald-400 font-medium">Marquer soldé</span> dès que le règlement est effectué.
          </p>
        </div>
      </div>
    </div>
  );
}
