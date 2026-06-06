'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCFA, cn } from '@/lib/utils';
import type { VStockAlert, ProductCategory } from '@/types';
import {
  Plus, X, Loader2, Package, Search,
  ArrowDownToLine, RefreshCw, ChevronDown,
  Edit2, Trash2, AlertTriangle, CheckCircle2,
  Tag, BarChart2
} from 'lucide-react';

type MovementType = 'entree' | 'ajustement';

type Tab = 'stock' | 'catalogue' | 'mouvements';

interface StockMovementRow {
  id: string;
  product_name: string;
  type: string;
  qty: number;
  unit_cost: number | null;
  notes: string | null;
  creator_name: string | null;
  created_at: string;
}

interface ProductForm {
  reference: string;
  name: string;
  category_id: string;
  buy_price: string;
  sell_price: string;
  stock_qty: string;
  stock_min: string;
  unit: string;
  description: string;
}

const EMPTY_FORM: ProductForm = {
  reference: '', name: '', category_id: '',
  buy_price: '', sell_price: '', stock_qty: '0',
  stock_min: '5', unit: 'unité', description: '',
};

export default function StockPage() {
  const supabase = createClient();

  const [tab,        setTab]        = useState<Tab>('stock');
  const [userRole,   setUserRole]   = useState<string>('collaborateur');
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  /* ---- Stock tab ---- */
  const [products,    setProducts]    = useState<VStockAlert[]>([]);
  const [categories,  setCategories]  = useState<ProductCategory[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterCat,   setFilterCat]   = useState('');
  const [filterAlert, setFilterAlert] = useState(false);

  /* ---- Movement modal ---- */
  const [showMove,     setShowMove]     = useState(false);
  const [moveProduct,  setMoveProduct]  = useState<VStockAlert | null>(null);
  const [moveType,     setMoveType]     = useState<MovementType>('entree');
  const [moveQty,      setMoveQty]      = useState('');
  const [moveUnitCost, setMoveUnitCost] = useState('');
  const [moveNotes,    setMoveNotes]    = useState('');
  const [moveSaving,   setMoveSaving]   = useState(false);

  /* ---- Product form (admin) ---- */
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct,  setEditingProduct]  = useState<VStockAlert | null>(null);
  const [productForm,     setProductForm]     = useState<ProductForm>(EMPTY_FORM);
  const [productSaving,   setProductSaving]   = useState(false);
  const [productSuccess,  setProductSuccess]  = useState('');

  /* ---- Mouvements tab ---- */
  const [movements,      setMovements]      = useState<StockMovementRow[]>([]);
  const [movementsLoad,  setMovementsLoad]  = useState(false);

  /* ---- Initial load ---- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => { if (data) setUserRole(data.role); });
    });
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('v_stock_alerts').select('*').order('name'),
      supabase.from('product_categories').select('*').order('name'),
    ]);
    setProducts((prods as VStockAlert[]) ?? []);
    setCategories((cats as ProductCategory[]) ?? []);
    setLoading(false);
  }, [supabase]);

  const loadMovements = useCallback(async () => {
    setMovementsLoad(true);
    const { data } = await supabase
      .from('stock_movements')
      .select(`
        id, type, qty, unit_cost, notes, created_at,
        product:products(name),
        creator:profiles(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []).map((m: any) => {
      const product = Array.isArray(m.product) ? m.product[0] : m.product;
      const creator = Array.isArray(m.creator) ? m.creator[0] : m.creator;
      return {
        id: m.id as string,
        product_name: product?.name ?? '—',
        type: m.type as string,
        qty: m.qty as number,
        unit_cost: m.unit_cost as number | null,
        notes: m.notes as string | null,
        creator_name: creator?.full_name ?? '—',
        created_at: m.created_at as string,
      };
    });
    setMovements(rows);
    setMovementsLoad(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === 'mouvements') loadMovements();
  }, [tab, loadMovements]);

  /* ---- Filter ---- */
  const filtered = products.filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.reference.toLowerCase().includes(search.toLowerCase());
    const matchCat   = !filterCat || p.category === filterCat;
    const matchAlert = !filterAlert || p.is_low_stock;
    return matchSearch && matchCat && matchAlert;
  });
  const totalValue = filtered.reduce((s, p) => s + (p.stock_value ?? 0), 0);

  /* ---- Movement ---- */
  async function handleMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!moveProduct || !moveQty) return;
    setMoveSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const qty = moveType === 'entree' ? Math.abs(Number(moveQty)) : -Math.abs(Number(moveQty));

    await supabase.from('stock_movements').insert({
      product_id:    moveProduct.id,
      type:          moveType,
      qty,
      unit_cost:     moveUnitCost ? Number(moveUnitCost) : null,
      notes:         moveNotes || null,
      created_by:    user!.id,
      reference_type: 'adjustment',
    });

    setMoveSaving(false);
    setShowMove(false);
    setMoveProduct(null);
    setMoveQty('');
    setMoveUnitCost('');
    setMoveNotes('');
    load();
  }

  /* ---- Product CRUD (admin) ---- */
  function openNewProduct() {
    setEditingProduct(null);
    setProductForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? '' });
    setShowProductForm(true);
  }

  function openEditProduct(p: VStockAlert) {
    setEditingProduct(p);
    // On doit récupérer les détails complets du produit
    supabase.from('products').select('*').eq('id', p.id).single().then(({ data }) => {
      if (data) {
        setProductForm({
          reference:   data.reference ?? '',
          name:        data.name ?? '',
          category_id: data.category_id ?? categories[0]?.id ?? '',
          buy_price:   String(data.buy_price ?? ''),
          sell_price:  String(data.sell_price ?? ''),
          stock_qty:   String(data.stock_qty ?? '0'),
          stock_min:   String(data.stock_min ?? '5'),
          unit:        data.unit ?? 'unité',
          description: data.description ?? '',
        });
      }
    });
    setShowProductForm(true);
  }

  async function handleProductSave(e: React.FormEvent) {
    e.preventDefault();
    setProductSaving(true);

    const payload = {
      reference:   productForm.reference,
      name:        productForm.name,
      category_id: productForm.category_id || null,
      buy_price:   Number(productForm.buy_price),
      sell_price:  Number(productForm.sell_price),
      stock_min:   Number(productForm.stock_min),
      unit:        productForm.unit,
      description: productForm.description || null,
      is_active:   true,
    };

    if (editingProduct) {
      await supabase.from('products').update(payload).eq('id', editingProduct.id);
      setProductSuccess('Produit mis à jour !');
    } else {
      await supabase.from('products').insert({
        ...payload,
        stock_qty: Number(productForm.stock_qty),
      });
      setProductSuccess('Produit ajouté !');
    }

    setProductSaving(false);
    setShowProductForm(false);
    setTimeout(() => setProductSuccess(''), 3000);
    load();
  }

  async function handleDeleteProduct(id: string) {
    if (!confirm('Supprimer ce produit ?')) return;
    await supabase.from('products').update({ is_active: false }).eq('id', id);
    load();
  }

  /* ---- Tabs ---- */
  const TABS: { id: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { id: 'stock',      label: 'Stock',      icon: Package },
    { id: 'catalogue',  label: 'Catalogue',  icon: Tag,    adminOnly: true },
    { id: 'mouvements', label: 'Mouvements', icon: BarChart2, adminOnly: true },
  ];

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {productSuccess && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 shadow-xl">
          <CheckCircle2 className="w-5 h-5" />
          {productSuccess}
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Stock & Catalogue</h2>
          <p className="text-sm text-slate-500">
            {filtered.length} produit(s) · valeur : {formatCFA(totalValue, true)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && tab === 'catalogue' && (
            <button onClick={openNewProduct} className="btn-primary">
              <Plus className="w-4 h-4" />
              Nouveau produit
            </button>
          )}
          <button onClick={load} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 rounded-xl p-1 border border-dark-600 w-fit">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id
                ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== TAB STOCK ===== */}
      {tab === 'stock' && (
        <>
          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                className="input pl-9 py-2 text-sm"
                placeholder="Rechercher un produit…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                className="input py-2 text-sm appearance-none pr-9 min-w-40"
              >
                <option value="">Toutes catégories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
            <button
              onClick={() => setFilterAlert(!filterAlert)}
              className={cn(
                'btn-secondary text-sm py-2',
                filterAlert && 'border-orange-500/40 text-orange-400 bg-orange-500/10'
              )}
            >
              <AlertTriangle className="w-4 h-4" />
              Alertes seulement
            </button>
          </div>

          {/* Résumé stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total produits', value: products.length, color: 'text-white' },
              { label: 'En rupture',     value: products.filter(p => p.stock_qty === 0).length, color: 'text-red-400' },
              { label: 'Stock bas',      value: products.filter(p => p.is_low_stock && p.stock_qty > 0).length, color: 'text-orange-400' },
              { label: 'OK',             value: products.filter(p => !p.is_low_stock).length, color: 'text-emerald-400' },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tableau stock */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium">Produit</th>
                    <th className="px-5 py-3 font-medium">Catégorie</th>
                    <th className="px-5 py-3 font-medium text-center">Stock</th>
                    <th className="px-5 py-3 font-medium text-center">Seuil</th>
                    <th className="px-5 py-3 font-medium text-right">Prix achat</th>
                    <th className="px-5 py-3 font-medium text-right">Prix vente</th>
                    <th className="px-5 py-3 font-medium text-right">Valeur</th>
                    <th className="px-5 py-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-5 py-3.5">
                            <div className="h-3 bg-dark-700 rounded" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-slate-600">
                        Aucun produit trouvé
                      </td>
                    </tr>
                  ) : (
                    filtered.map((product) => (
                      <tr
                        key={product.id}
                        className={cn(
                          'hover:bg-dark-700/50 transition-colors',
                          product.stock_qty === 0 && 'bg-red-500/5'
                        )}
                      >
                        <td className="px-5 py-3.5">
                          <div>
                            <p className="font-medium text-slate-200">{product.name}</p>
                            <p className="text-xs text-slate-500 font-mono">{product.reference}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 text-xs">{product.category}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={cn(
                            'badge text-xs',
                            product.stock_qty === 0  ? 'badge-red'
                              : product.is_low_stock ? 'badge-orange'
                              : 'badge-green'
                          )}>
                            {product.stock_qty}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center text-slate-500 text-xs">{product.stock_min}</td>
                        <td className="px-5 py-3.5 text-right text-slate-400 text-xs">{formatCFA(product.buy_price)}</td>
                        <td className="px-5 py-3.5 text-right font-medium text-white">{formatCFA(product.sell_price)}</td>
                        <td className="px-5 py-3.5 text-right text-slate-400 text-xs">{formatCFA(product.stock_value)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={() => { setMoveProduct(product); setShowMove(true); }}
                            className="inline-flex items-center gap-1 text-xs text-neon-blue hover:text-neon-blue/80 transition-colors"
                          >
                            <ArrowDownToLine className="w-3.5 h-3.5" />
                            Mouvement
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== TAB CATALOGUE (admin) ===== */}
      {tab === 'catalogue' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-600 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Référence</th>
                  <th className="px-5 py-3 font-medium">Nom</th>
                  <th className="px-5 py-3 font-medium">Catégorie</th>
                  <th className="px-5 py-3 font-medium text-right">Achat</th>
                  <th className="px-5 py-3 font-medium text-right">Vente</th>
                  <th className="px-5 py-3 font-medium text-right">Marge</th>
                  <th className="px-5 py-3 font-medium text-center">Seuil</th>
                  <th className="px-5 py-3 font-medium text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-3 bg-dark-700 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  products.map((p) => {
                    const margin = p.sell_price - p.buy_price;
                    const marginPct = p.buy_price > 0 ? (margin / p.buy_price) * 100 : 0;
                    return (
                      <tr key={p.id} className="hover:bg-dark-700/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-neon-blue">{p.reference}</span>
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-200">{p.name}</td>
                        <td className="px-5 py-3.5 text-slate-400 text-xs">{p.category}</td>
                        <td className="px-5 py-3.5 text-right text-slate-400 text-xs">{formatCFA(p.buy_price)}</td>
                        <td className="px-5 py-3.5 text-right font-medium text-white">{formatCFA(p.sell_price)}</td>
                        <td className="px-5 py-3.5 text-right">
                          <span className={cn('text-xs font-semibold', margin >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {formatCFA(margin)} ({marginPct.toFixed(0)}%)
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center text-slate-500 text-xs">{p.stock_min}</td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openEditProduct(p)}
                              className="text-slate-400 hover:text-neon-blue transition-colors"
                              title="Modifier"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="text-slate-400 hover:text-red-400 transition-colors"
                              title="Désactiver"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      )}

      {/* ===== TAB MOUVEMENTS (admin) ===== */}
      {tab === 'mouvements' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-600 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Produit</th>
                  <th className="px-5 py-3 font-medium text-center">Type</th>
                  <th className="px-5 py-3 font-medium text-center">Qté</th>
                  <th className="px-5 py-3 font-medium text-right">P.U. achat</th>
                  <th className="px-5 py-3 font-medium">Notes</th>
                  <th className="px-5 py-3 font-medium">Par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600">
                {movementsLoad ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="h-3 bg-dark-700 rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-slate-600">
                      Aucun mouvement enregistré
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id} className="hover:bg-dark-700/50 transition-colors">
                      <td className="px-5 py-3.5 text-xs text-slate-400">
                        {new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-slate-200">{m.product_name}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn(
                          'badge text-xs',
                          m.type === 'entree'      ? 'badge-green'
                          : m.type === 'sortie'    ? 'badge-blue'
                          : 'badge-orange'
                        )}>
                          {m.type === 'entree' ? 'Entrée' : m.type === 'sortie' ? 'Sortie' : 'Ajust.'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn(
                          'text-sm font-bold',
                          m.qty > 0 ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {m.qty > 0 ? '+' : ''}{m.qty}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-400 text-xs">
                        {m.unit_cost ? formatCFA(m.unit_cost) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs max-w-xs truncate">
                        {m.notes ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 text-xs">{m.creator_name}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== MODAL MOUVEMENT ===== */}
      {showMove && moveProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form onSubmit={handleMovement} className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200">Mouvement de stock</h3>
              <button type="button" onClick={() => setShowMove(false)} className="text-slate-500 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-dark-700 rounded-xl px-4 py-3">
              <p className="font-medium text-white">{moveProduct.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">Stock actuel : <span className="font-bold text-white">{moveProduct.stock_qty}</span> unités</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'entree',     label: 'Entrée stock',  icon: ArrowDownToLine, color: 'text-emerald-400' },
                { value: 'ajustement', label: 'Ajustement',    icon: RefreshCw,       color: 'text-orange-400' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMoveType(opt.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-sm font-medium',
                    moveType === opt.value
                      ? 'border-neon-blue/40 bg-neon-blue/10 text-neon-blue'
                      : 'border-dark-600 bg-dark-700 text-slate-400 hover:border-slate-500'
                  )}
                >
                  <opt.icon className={cn('w-5 h-5', moveType === opt.value ? 'text-neon-blue' : opt.color)} />
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label className="label">
                {moveType === 'entree' ? 'Quantité à ajouter' : 'Nouvelle quantité totale'}
              </label>
              <input
                type="number" min={0} value={moveQty}
                onChange={(e) => setMoveQty(e.target.value)}
                className="input" placeholder="ex: 10" required
              />
            </div>

            {moveType === 'entree' && (
              <div>
                <label className="label">Prix d&apos;achat unitaire (FCFA)</label>
                <input
                  type="number" min={0} value={moveUnitCost}
                  onChange={(e) => setMoveUnitCost(e.target.value)}
                  className="input" placeholder="ex: 185000"
                />
              </div>
            )}

            <div>
              <label className="label">Notes</label>
              <input type="text" value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
                className="input" placeholder="Raison du mouvement…"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowMove(false)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={moveSaving} className="btn-primary min-w-28">
                {moveSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                {moveSaving ? 'Enregistrement…' : 'Confirmer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== MODAL PRODUIT (admin) ===== */}
      {showProductForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <form onSubmit={handleProductSave} className="card w-full max-w-xl p-6 space-y-4 my-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200">
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
              </h3>
              <button type="button" onClick={() => setShowProductForm(false)} className="text-slate-500 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Référence *</label>
                <div className="flex gap-2">
                  <input type="text" value={productForm.reference}
                    onChange={(e) => setProductForm(f => ({ ...f, reference: e.target.value }))}
                    className="input flex-1" placeholder="ex: TEL-003" required
                  />
                  <button
                    type="button"
                    title="Générer automatiquement"
                    onClick={() => {
                      const now = new Date();
                      const prefix = productForm.name
                        ? productForm.name.replace(/\s+/g, '').slice(0, 3).toUpperCase()
                        : 'PRD';
                      const yy  = String(now.getFullYear()).slice(2);
                      const mm  = String(now.getMonth() + 1).padStart(2, '0');
                      const dd  = String(now.getDate()).padStart(2, '0');
                      const seq = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
                      setProductForm(f => ({ ...f, reference: `${prefix}-${yy}${mm}${dd}-${seq}` }));
                    }}
                    className="px-3 rounded-xl border border-dark-600 bg-dark-700 text-slate-400 hover:text-neon-blue hover:border-neon-blue/40 transition-colors text-xs whitespace-nowrap"
                  >
                    Auto
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Catégorie</label>
                <div className="relative">
                  <select value={productForm.category_id}
                    onChange={(e) => setProductForm(f => ({ ...f, category_id: e.target.value }))}
                    className="input appearance-none pr-9"
                  >
                    <option value="">Sans catégorie</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Nom du produit *</label>
                <input type="text" value={productForm.name}
                  onChange={(e) => setProductForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="ex: Samsung Galaxy A55" required
                />
              </div>
              <div>
                <label className="label">Prix d&apos;achat (FCFA) *</label>
                <input type="number" min={0} value={productForm.buy_price}
                  onChange={(e) => setProductForm(f => ({ ...f, buy_price: e.target.value }))}
                  className="input" placeholder="185000" required
                />
              </div>
              <div>
                <label className="label">Prix de vente (FCFA) *</label>
                <input type="number" min={0} value={productForm.sell_price}
                  onChange={(e) => setProductForm(f => ({ ...f, sell_price: e.target.value }))}
                  className="input" placeholder="220000" required
                />
              </div>
              {!editingProduct && (
                <div>
                  <label className="label">Stock initial</label>
                  <input type="number" min={0} value={productForm.stock_qty}
                    onChange={(e) => setProductForm(f => ({ ...f, stock_qty: e.target.value }))}
                    className="input" placeholder="0"
                  />
                </div>
              )}
              <div>
                <label className="label">Seuil d&apos;alerte</label>
                <input type="number" min={0} value={productForm.stock_min}
                  onChange={(e) => setProductForm(f => ({ ...f, stock_min: e.target.value }))}
                  className="input" placeholder="5"
                />
              </div>
              <div>
                <label className="label">Unité</label>
                <input type="text" value={productForm.unit}
                  onChange={(e) => setProductForm(f => ({ ...f, unit: e.target.value }))}
                  className="input" placeholder="unité"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description (optionnel)</label>
                <textarea value={productForm.description} rows={2}
                  onChange={(e) => setProductForm(f => ({ ...f, description: e.target.value }))}
                  className="input resize-none" placeholder="Description du produit…"
                />
              </div>
            </div>

            {productForm.buy_price && productForm.sell_price && (
              <div className="bg-dark-700 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">Marge calculée :</span>
                <span className={cn('text-sm font-bold', Number(productForm.sell_price) >= Number(productForm.buy_price) ? 'text-emerald-400' : 'text-red-400')}>
                  {formatCFA(Number(productForm.sell_price) - Number(productForm.buy_price))}
                  {' '}
                  ({productForm.buy_price ? ((Number(productForm.sell_price) - Number(productForm.buy_price)) / Number(productForm.buy_price) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowProductForm(false)} className="btn-secondary">Annuler</button>
              <button type="submit" disabled={productSaving} className="btn-primary min-w-32">
                {productSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                {productSaving ? 'Enregistrement…' : editingProduct ? 'Mettre à jour' : 'Créer le produit'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
