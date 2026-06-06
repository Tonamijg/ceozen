'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCFA, cn } from '@/lib/utils';
import {
  ShieldCheck, Package, Tag, BarChart2, Terminal,
  Plus, Trash2, Edit2, Check, X, Loader2,
  ChevronDown, AlertTriangle, CheckCircle2, Upload
} from 'lucide-react';

type Tab = 'produits' | 'categories' | 'sql' | 'import';

interface Product {
  id: string;
  reference: string;
  name: string;
  buy_price: number;
  sell_price: number;
  stock_qty: number;
  stock_min: number;
  is_active: boolean;
  category_id?: string;
}

interface Category {
  id: string;
  name: string;
  color?: string;
  type: 'produit' | 'depense';
}

export default function SuperAdminPage() {
  const supabase = createClient();

  const [tab,      setTab]      = useState<Tab>('produits');
  const [userRole, setUserRole] = useState('');
  const [loading,  setLoading]  = useState(true);

  // ── Produits ────────────────────────────────────────────────────────────────
  const [products,     setProducts]     = useState<Product[]>([]);
  const [prodSearch,   setProdSearch]   = useState('');
  const [editProd,     setEditProd]     = useState<Product | null>(null);
  const [prodSaving,   setProdSaving]   = useState(false);
  const [prodSuccess,  setProdSuccess]  = useState('');
  const [prodError,    setProdError]    = useState('');

  // ── Catégories ──────────────────────────────────────────────────────────────
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [catType,      setCatType]      = useState<'produit' | 'depense'>('produit');
  const [newCatName,   setNewCatName]   = useState('');
  const [newCatColor,  setNewCatColor]  = useState('#6366f1');
  const [catSaving,    setCatSaving]    = useState(false);
  const [catSuccess,   setCatSuccess]   = useState('');
  const [editCat,      setEditCat]      = useState<Category | null>(null);

  // ── Console SQL ─────────────────────────────────────────────────────────────
  const [sqlQuery,     setSqlQuery]     = useState('');
  const [sqlResult,    setSqlResult]    = useState<unknown[] | null>(null);
  const [sqlError,     setSqlError]     = useState('');
  const [sqlRunning,   setSqlRunning]   = useState(false);
  const [sqlConfirm,   setSqlConfirm]   = useState(false);
  const [sqlCols,      setSqlCols]      = useState<string[]>([]);

  // ── Import Excel ─────────────────────────────────────────────────────────────
  const [importFile,   setImportFile]   = useState<File | null>(null);
  const [importLog,    setImportLog]    = useState<string[]>([]);
  const [importing,    setImporting]    = useState(false);

  // ── Toast global ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Chargement ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: prods }, { data: prodCats }, { data: expCats }, roleData] = await Promise.all([
      supabase.from('products').select('id,reference,name,buy_price,sell_price,stock_qty,stock_min,is_active,category_id').order('name'),
      supabase.from('product_categories').select('id,name').order('name'),
      supabase.from('expense_categories').select('id,name,color').order('name'),
      supabase.auth.getUser().then(({ data: { user } }) =>
        user ? supabase.from('profiles').select('role').eq('id', user.id).single() : null
      ),
    ]);
    setProducts((prods ?? []) as Product[]);
    setCategories([
      ...((prodCats ?? []) as { id: string; name: string }[]).map(c => ({ ...c, type: 'produit' as const, color: undefined })),
      ...((expCats  ?? []) as { id: string; name: string; color: string }[]).map(c => ({ ...c, type: 'depense' as const })),
    ]);
    if (roleData?.data) setUserRole((roleData.data as { role: string }).role);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Garde Super Admin ────────────────────────────────────────────────────────
  if (!loading && userRole !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldCheck className="w-16 h-16 text-red-400/40" />
        <p className="text-slate-400 text-lg font-medium">Accès réservé au Super Admin</p>
      </div>
    );
  }

  // ── Sauvegarde produit ───────────────────────────────────────────────────────
  async function saveProd() {
    if (!editProd) return;
    setProdSaving(true);
    const { error } = await supabase.from('products').update({
      name:       editProd.name,
      buy_price:  editProd.buy_price,
      sell_price: editProd.sell_price,
      stock_min:  editProd.stock_min,
      is_active:  editProd.is_active,
    }).eq('id', editProd.id);
    setProdSaving(false);
    if (error) { setProdError(error.message); setTimeout(() => setProdError(''), 5000); }
    else { setProdSuccess('Produit mis à jour ✅'); setTimeout(() => setProdSuccess(''), 3000); setEditProd(null); loadAll(); }
  }

  // ── Créer catégorie ──────────────────────────────────────────────────────────
  async function createCategory() {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    const table = catType === 'produit' ? 'product_categories' : 'expense_categories';
    const payload = catType === 'produit'
      ? { name: newCatName.trim() }
      : { name: newCatName.trim(), color: newCatColor };
    const { error } = await supabase.from(table).insert(payload);
    setCatSaving(false);
    if (!error) { setNewCatName(''); setCatSuccess('Catégorie créée ✅'); setTimeout(() => setCatSuccess(''), 3000); loadAll(); }
    else showToast(error.message, 'err');
  }

  // ── Supprimer catégorie ──────────────────────────────────────────────────────
  async function deleteCategory(cat: Category) {
    const table = cat.type === 'produit' ? 'product_categories' : 'expense_categories';
    const { error } = await supabase.from(table).delete().eq('id', cat.id);
    if (error) showToast(error.message, 'err');
    else { showToast('Catégorie supprimée', 'ok'); loadAll(); }
  }

  // ── Console SQL ──────────────────────────────────────────────────────────────
  async function runSQL() {
    if (!sqlQuery.trim()) return;
    // Demander confirmation si requête destructive
    const isDestructive = /^\s*(drop|delete|truncate|alter\s+table)/i.test(sqlQuery);
    if (isDestructive && !sqlConfirm) { setSqlConfirm(true); return; }
    setSqlConfirm(false);
    setSqlRunning(true);
    setSqlError('');
    setSqlResult(null);
    try {
      const res = await fetch('/api/super-admin/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery }),
      });
      const json = await res.json();
      if (!res.ok) { setSqlError(json.error ?? 'Erreur'); }
      else {
        const rows = json.data ?? [];
        setSqlResult(rows);
        if (rows.length > 0) setSqlCols(Object.keys(rows[0] as object));
        else setSqlCols([]);
        showToast(`${json.rowCount ?? rows.length} ligne(s) retournée(s)`);
      }
    } catch (e) {
      setSqlError(String(e));
    } finally {
      setSqlRunning(false);
    }
  }

  // ── Import Excel ─────────────────────────────────────────────────────────────
  async function runImport() {
    if (!importFile) return;
    setImporting(true);
    setImportLog([]);
    try {
      const XLSX = await import('xlsx');
      const buf  = await importFile.arrayBuffer();
      const wb   = XLSX.read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
      setImportLog([`📋 ${rows.length} ligne(s) trouvées dans le fichier`]);

      let ok = 0; let ko = 0;
      for (const row of rows) {
        const ref  = String(row['reference'] ?? row['Référence'] ?? row['ref'] ?? '').trim();
        const name = String(row['name'] ?? row['Nom'] ?? row['nom'] ?? '').trim();
        const buy  = Number(row['buy_price'] ?? row['Prix achat'] ?? 0);
        const sell = Number(row['sell_price'] ?? row['Prix vente'] ?? 0);
        const qty  = Number(row['stock_qty'] ?? row['Stock'] ?? 0);
        const min  = Number(row['stock_min'] ?? row['Stock min'] ?? 5);

        if (!ref || !name) { ko++; setImportLog(l => [...l, `❌ Ligne ignorée — référence ou nom manquant`]); continue; }

        const { error } = await supabase.from('products').upsert(
          { reference: ref, name, buy_price: buy, sell_price: sell, stock_qty: qty, stock_min: min, is_active: true },
          { onConflict: 'reference' }
        );
        if (error) { ko++; setImportLog(l => [...l, `❌ ${ref} — ${error.message}`]); }
        else { ok++; setImportLog(l => [...l, `✅ ${ref} — ${name}`]); }
      }
      setImportLog(l => [...l, ``, `📊 Résultat : ${ok} ok, ${ko} erreurs`]);
      loadAll();
    } catch (e) {
      setImportLog(l => [...l, `❌ Erreur lecture fichier : ${String(e)}`]);
    } finally {
      setImporting(false);
    }
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(prodSearch.toLowerCase()) ||
    p.reference.toLowerCase().includes(prodSearch.toLowerCase())
  );

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'produits',    label: 'Produits',    icon: Package  },
    { key: 'categories',  label: 'Catégories',  icon: Tag      },
    { key: 'sql',         label: 'Console SQL', icon: Terminal },
    { key: 'import',      label: 'Import Excel',icon: Upload   },
  ];

  return (
    <div className="space-y-6">

      {/* Toast global */}
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl',
          toast.type === 'ok'
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/20 border border-red-500/30 text-red-300'
        )}>
          {toast.msg}
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Super Admin
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">⚡ Accès total</span>
          </h2>
          <p className="text-sm text-slate-500">Gestion avancée — base de données, produits, catégories</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.key
                ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ PRODUITS ══════════════════════════════════════════════════════════ */}
      {tab === 'produits' && (
        <div className="space-y-4">
          {(prodSuccess || prodError) && (
            <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
              prodSuccess ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                          : 'bg-red-500/20 border border-red-500/30 text-red-300'
            )}>
              {prodSuccess || prodError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <input className="input pl-9" placeholder="Chercher un produit..."
                value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
            </div>
            <p className="text-xs text-slate-500">{filteredProducts.length} produit(s)</p>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600 text-xs text-slate-500 uppercase">
                    <th className="px-4 py-3 text-left">Référence</th>
                    <th className="px-4 py-3 text-left">Nom</th>
                    <th className="px-4 py-3 text-right">P. Achat</th>
                    <th className="px-4 py-3 text-right">P. Vente</th>
                    <th className="px-4 py-3 text-center">Stock</th>
                    <th className="px-4 py-3 text-center">Min</th>
                    <th className="px-4 py-3 text-center">Actif</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600/50">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><div className="h-3 bg-dark-700 rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : filteredProducts.map(p => (
                    <tr key={p.id} className="hover:bg-dark-700/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-neon-blue">{p.reference}</td>
                      {editProd?.id === p.id ? (
                        <>
                          <td className="px-4 py-2">
                            <input className="input text-xs py-1" value={editProd.name}
                              onChange={e => setEditProd({ ...editProd, name: e.target.value })} />
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" className="input text-xs py-1 w-24 text-right" value={editProd.buy_price}
                              onChange={e => setEditProd({ ...editProd, buy_price: Number(e.target.value) })} />
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" className="input text-xs py-1 w-24 text-right" value={editProd.sell_price}
                              onChange={e => setEditProd({ ...editProd, sell_price: Number(e.target.value) })} />
                          </td>
                          <td className="px-4 py-2 text-center text-slate-400 text-xs">{p.stock_qty}</td>
                          <td className="px-4 py-2">
                            <input type="number" className="input text-xs py-1 w-16 text-center" value={editProd.stock_min}
                              onChange={e => setEditProd({ ...editProd, stock_min: Number(e.target.value) })} />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button onClick={() => setEditProd({ ...editProd, is_active: !editProd.is_active })}
                              className={cn('text-xs px-2 py-0.5 rounded-full border',
                                editProd.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                              )}>
                              {editProd.is_active ? 'Oui' : 'Non'}
                            </button>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={saveProd} disabled={prodSaving}
                                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                                {prodSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => setEditProd(null)}
                                className="p-1.5 rounded-lg bg-dark-700 text-slate-400 hover:text-slate-200 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-slate-200 max-w-[200px] truncate">{p.name}</td>
                          <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{formatCFA(p.buy_price)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-300 text-xs font-medium">{formatCFA(p.sell_price)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn('text-xs font-semibold',
                              p.stock_qty === 0 ? 'text-red-400' :
                              p.stock_qty <= p.stock_min ? 'text-orange-400' : 'text-emerald-400'
                            )}>{p.stock_qty}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-500 text-xs">{p.stock_min}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn('text-xs',
                              p.is_active ? 'text-emerald-400' : 'text-red-400'
                            )}>{p.is_active ? '✓' : '✗'}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button onClick={() => setEditProd(p)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ CATÉGORIES ════════════════════════════════════════════════════════ */}
      {tab === 'categories' && (
        <div className="space-y-6">
          {catSuccess && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm">
              <CheckCircle2 className="w-4 h-4" /> {catSuccess}
            </div>
          )}

          {/* Nouvelle catégorie */}
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-200 text-sm">Nouvelle catégorie</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="label">Nom *</label>
                <input className="input" placeholder="Ex: Tablettes, Loyer..."
                  value={newCatName} onChange={e => setNewCatName(e.target.value)} />
              </div>
              <div>
                <label className="label">Type *</label>
                <div className="relative">
                  <select className="input appearance-none pr-8" value={catType}
                    onChange={e => setCatType(e.target.value as 'produit' | 'depense')}>
                    <option value="produit">Produit</option>
                    <option value="depense">Dépense</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
              {catType === 'depense' && (
                <div>
                  <label className="label">Couleur</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-dark-600 bg-dark-700 cursor-pointer" />
                    <span className="text-xs text-slate-500">{newCatColor}</span>
                  </div>
                </div>
              )}
              <button onClick={createCategory} disabled={catSaving || !newCatName.trim()}
                className="btn-primary h-10">
                {catSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Créer
              </button>
            </div>
          </div>

          {/* Liste catégories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['produit', 'depense'] as const).map(type => (
              <div key={type} className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-600 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-neon-violet" />
                  <h4 className="font-semibold text-slate-200 text-sm">
                    Catégories {type === 'produit' ? 'Produits' : 'Dépenses'}
                  </h4>
                  <span className="ml-auto text-xs text-slate-500">
                    {categories.filter(c => c.type === type).length}
                  </span>
                </div>
                <div className="divide-y divide-dark-600/50">
                  {categories.filter(c => c.type === type).map(cat => (
                    <div key={cat.id} className="flex items-center gap-3 px-4 py-3 hover:bg-dark-700/30 transition-colors">
                      {type === 'depense' && cat.color && (
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      )}
                      <span className="text-sm text-slate-300 flex-1">{cat.name}</span>
                      <button onClick={() => deleteCategory(cat)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ CONSOLE SQL ═══════════════════════════════════════════════════════ */}
      {tab === 'sql' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Zone dangereuse.</strong> Les requêtes SQL sont exécutées directement sur la base de production.
              Un DROP TABLE ou DELETE sans WHERE peut effacer définitivement des données.
              Les requêtes destructives demandent une confirmation supplémentaire.
            </span>
          </div>

          <div className="card p-4 space-y-3">
            <textarea
              value={sqlQuery}
              onChange={e => { setSqlQuery(e.target.value); setSqlConfirm(false); }}
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-4 py-3 text-sm font-mono text-slate-200 outline-none focus:border-yellow-400/50 focus:ring-2 focus:ring-yellow-400/10 resize-none"
              rows={6}
              placeholder="SELECT * FROM products LIMIT 10;&#10;-- ou UPDATE, INSERT, DELETE..."
              spellCheck={false}
            />
            <div className="flex items-center gap-3">
              {sqlConfirm ? (
                <>
                  <span className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Requête destructive détectée — confirmes-tu ?
                  </span>
                  <button onClick={runSQL} className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
                    Oui, exécuter quand même
                  </button>
                  <button onClick={() => setSqlConfirm(false)} className="btn-secondary text-xs py-2">
                    Annuler
                  </button>
                </>
              ) : (
                <button onClick={runSQL} disabled={sqlRunning || !sqlQuery.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 hover:bg-yellow-400/20 transition-colors disabled:opacity-50">
                  {sqlRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                  {sqlRunning ? 'Exécution…' : 'Exécuter'}
                </button>
              )}
              <button onClick={() => { setSqlQuery(''); setSqlResult(null); setSqlError(''); setSqlConfirm(false); }}
                className="btn-secondary text-xs py-2">
                Effacer
              </button>
            </div>
          </div>

          {/* Résultats */}
          {sqlError && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-mono">
              {sqlError}
            </div>
          )}
          {sqlResult !== null && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-dark-600 flex items-center gap-2">
                <span className="text-xs text-slate-400">{sqlResult.length} ligne(s)</span>
              </div>
              {sqlResult.length === 0 ? (
                <p className="px-4 py-6 text-center text-slate-500 text-sm">Aucun résultat — requête exécutée avec succès.</p>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-dark-600">
                        {sqlCols.map(col => (
                          <th key={col} className="px-3 py-2 text-left text-slate-500 font-medium whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-600/30">
                      {sqlResult.map((row, i) => (
                        <tr key={i} className="hover:bg-dark-700/30">
                          {sqlCols.map(col => (
                            <td key={col} className="px-3 py-1.5 text-slate-300 max-w-[200px] truncate">
                              {String((row as Record<string, unknown>)[col] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ IMPORT EXCEL ══════════════════════════════════════════════════════ */}
      {tab === 'import' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-slate-200 text-sm">Import produits depuis Excel</h3>
            <p className="text-xs text-slate-500">
              Le fichier doit avoir les colonnes : <code className="text-neon-blue">reference</code>, <code className="text-neon-blue">name</code>,{' '}
              <code className="text-neon-blue">buy_price</code>, <code className="text-neon-blue">sell_price</code>,{' '}
              <code className="text-neon-blue">stock_qty</code>, <code className="text-neon-blue">stock_min</code>.
              Les produits existants (même référence) seront mis à jour.
            </p>

            <div className="border-2 border-dashed border-dark-600 rounded-xl p-8 text-center hover:border-yellow-400/30 transition-colors">
              <Upload className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <input type="file" accept=".xlsx,.xls,.csv"
                onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                className="hidden" id="import-file"
              />
              <label htmlFor="import-file" className="cursor-pointer">
                <span className="text-sm text-slate-400">
                  {importFile ? importFile.name : 'Cliquer pour sélectionner un fichier Excel ou CSV'}
                </span>
              </label>
            </div>

            {importFile && (
              <button onClick={runImport} disabled={importing}
                className="btn-primary w-full">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Import en cours…' : `Importer ${importFile.name}`}
              </button>
            )}
          </div>

          {importLog.length > 0 && (
            <div className="card p-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Journal d&apos;import</h4>
              <div className="bg-dark-900 rounded-xl p-4 max-h-80 overflow-y-auto space-y-1 font-mono text-xs">
                {importLog.map((line, i) => (
                  <p key={i} className={cn(
                    line.startsWith('✅') ? 'text-emerald-400' :
                    line.startsWith('❌') ? 'text-red-400' :
                    line.startsWith('📊') ? 'text-yellow-400 font-bold mt-2' :
                    'text-slate-400'
                  )}>{line || ' '}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
