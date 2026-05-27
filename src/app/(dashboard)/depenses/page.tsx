'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCFA, formatDate, cn, localDateStr } from '@/lib/utils';
import type { Expense, ExpenseCategory, Product, Supplier } from '@/types';
import { PAYMENT_LABELS, PAYMENT_BADGE_CLASS, REAPPRO_CATEGORY } from '@/types';
import type { PaymentMethod } from '@/types';
import {
  Plus, X, Loader2, Receipt, CheckCircle2, ChevronDown,
  Search, Trash2, Package, AlertCircle, ShieldAlert
} from 'lucide-react';

interface ExpenseRow extends Expense { category?: ExpenseCategory; }

interface ReapproLine { product: Product; qty: number; unit_cost: number; }

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'especes',      label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'carte',        label: 'Carte bancaire' },
  { value: 'virement',     label: 'Virement' },
  { value: 'credit',       label: 'Crédit (à payer plus tard)' },
];

export default function DepensesPage() {
  const supabase = createClient();

  const [showForm,       setShowForm]       = useState(false);
  const [categories,     setCategories]     = useState<ExpenseCategory[]>([]);
  const [expenses,       setExpenses]       = useState<ExpenseRow[]>([]);
  const [products,       setProducts]       = useState<Product[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [success,        setSuccess]        = useState(false);
  const [userRole,       setUserRole]       = useState('');
  const [confirmDelExp,  setConfirmDelExp]  = useState<ExpenseRow | null>(null);
  const [deletingExpId,  setDeletingExpId]  = useState<string | null>(null);
  const [filterMonth,    setFilterMonth]    = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Formulaire
  const [categoryId,     setCategoryId]     = useState('');
  const [categoryName,   setCategoryName]   = useState('');
  const [amount,         setAmount]         = useState('');
  const [description,    setDescription]    = useState('');
  const [expenseDate,    setExpenseDate]    = useState(() => localDateStr());
  const [supplierName,      setSupplierName]      = useState('');
  const [suppliers,         setSuppliers]         = useState<Supplier[]>([]);
  const [supplierSearch,    setSupplierSearch]    = useState('');
  const [showSupplierDrop,  setShowSupplierDrop]  = useState(false);
  const [paymentMethod,     setPaymentMethod]     = useState<PaymentMethod>('especes');
  const [creditDueDate,  setCreditDueDate]  = useState('');

  // Réapprovisionnement
  const [reapproLines,   setReapproLines]   = useState<ReapproLine[]>([]);
  const [searchProduct,  setSearchProduct]  = useState('');

  const isReappro = categoryName === REAPPRO_CATEGORY;

  // Chargement
  useEffect(() => {
    Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('products').select('*, category:product_categories(name)').eq('is_active', true).order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.auth.getUser().then(({ data: { user } }) =>
        user ? supabase.from('profiles').select('role').eq('id', user.id).single() : null
      ),
    ]).then(([{ data: cats }, { data: prods }, { data: sups }, roleRes]) => {
      setCategories(cats ?? []);
      setProducts((prods as Product[]) ?? []);
      setSuppliers((sups as Supplier[]) ?? []);
      if (cats?.[0]) { setCategoryId(cats[0].id); setCategoryName(cats[0].name); }
      if (roleRes?.data) setUserRole((roleRes.data as { role: string }).role);
    });
  }, [supabase]);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const [year, month] = filterMonth.split('-');
    const start = `${year}-${month}-01`;
    const end   = localDateStr(new Date(Number(year), Number(month), 0));
    const { data } = await supabase
      .from('expenses')
      .select('*, category:expense_categories(*)')
      .gte('expense_date', start)
      .lte('expense_date', end)
      .order('expense_date', { ascending: false });
    setExpenses((data as ExpenseRow[]) ?? []);
    setLoading(false);
  }, [supabase, filterMonth]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  // Calcul montant réappro automatique
  const reapproTotal = reapproLines.reduce((s, l) => s + l.qty * l.unit_cost, 0);

  function handleCategoryChange(id: string) {
    setCategoryId(id);
    const cat = categories.find(c => c.id === id);
    setCategoryName(cat?.name ?? '');
    if (cat?.name !== REAPPRO_CATEGORY) setReapproLines([]);
  }

  function addReapproLine(product: Product) {
    setReapproLines(prev => {
      const idx = prev.findIndex(l => l.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [...prev, { product, qty: 1, unit_cost: product.buy_price }];
    });
    setSearchProduct('');
  }

  function removeReapproLine(idx: number) {
    setReapproLines(prev => prev.filter((_, i) => i !== idx));
  }

  function updateReapproLine(idx: number, field: 'qty' | 'unit_cost', value: number) {
    setReapproLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
    p.reference.toLowerCase().includes(searchProduct.toLowerCase())
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalAmount = isReappro ? reapproTotal : Number(amount);
    if (!finalAmount || finalAmount <= 0) return;
    if (!description.trim()) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: expense, error } = await supabase.from('expenses').insert({
      category_id:    categoryId || null,
      amount:         finalAmount,
      description:    description.trim(),
      expense_date:   expenseDate,
      supplier_name:  supplierName || null,
      payment_method: paymentMethod,
      credit_due_date: paymentMethod === 'credit' ? creditDueDate || null : null,
      is_settled:     paymentMethod !== 'credit',
      created_by:     user!.id,
    }).select('id').single();

    // Auto-sauvegarder le fournisseur dans la base s'il est nouveau
    if (supplierName.trim()) {
      await supabase.from('suppliers')
        .upsert({ name: supplierName.trim() }, { onConflict: 'name', ignoreDuplicates: true });
    }

    if (!error && expense && isReappro && reapproLines.length > 0) {
      await supabase.from('expense_items').insert(
        reapproLines.map(l => ({
          expense_id: expense.id,
          product_id: l.product.id,
          qty:        l.qty,
          unit_cost:  l.unit_cost,
        }))
      );
    }

    // Notification WhatsApp
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'depense',
        data: {
          description:    description.trim(),
          amount:         finalAmount,
          category:       categoryName ?? 'Sans catégorie',
          payment_method: paymentMethod,
        },
      }),
    }).catch(() => {});

    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    setAmount('');
    setDescription('');
    setSupplierName('');
    setPaymentMethod('especes');
    setCreditDueDate('');
    setReapproLines([]);
    setShowForm(false);
    loadExpenses();
  }

  /* ---- Suppression dépense (admin) ---- */
  async function handleDeleteExpense(expense: ExpenseRow) {
    setDeletingExpId(expense.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Si réappro → vérifier les lignes et inverser le stock
      const { data: expItems } = await supabase
        .from('expense_items').select('product_id, qty').eq('expense_id', expense.id);

      if (expItems && expItems.length > 0) {
        await supabase.from('stock_movements').insert(
          expItems.map((item: { product_id: string; qty: number }) => ({
            product_id:     item.product_id,
            type:           'sortie',
            qty:            -item.qty,
            reference_id:   expense.id,
            reference_type: 'annulation_reappro',
            notes:          `Annulation réappro : ${expense.description}`,
            created_by:     user!.id,
          }))
        );
      }

      // Suppression dépense (cascade → expense_items)
      await supabase.from('expenses').delete().eq('id', expense.id);

      setConfirmDelExp(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      loadExpenses();
    } finally {
      setDeletingExpId(null);
    }
  }

  const totalMonth = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);

  const byCategory = expenses.reduce<Record<string, { name: string; color: string; total: number }>>((acc, e) => {
    const key = e.category?.name ?? 'Autre';
    if (!acc[key]) acc[key] = { name: key, color: e.category?.color ?? '#6b7280', total: 0 };
    acc[key].total += e.amount ?? 0;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {success && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 shadow-xl">
          <CheckCircle2 className="w-5 h-5" />
          Dépense enregistrée !
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Dépenses</h2>
          <p className="text-sm text-slate-500">Total ce mois : {formatCFA(totalMonth)}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nouvelle dépense
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-200">Saisie de dépense</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Catégorie */}
            <div>
              <label className="label">Catégorie *</label>
              <div className="relative">
                <select value={categoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="input appearance-none pr-9"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="label">Date *</label>
              <input type="date" value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="input" required
              />
            </div>

            {/* Description obligatoire */}
            <div className="sm:col-span-2">
              <label className="label">Description *</label>
              <input type="text" value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input"
                placeholder="Détail obligatoire de la dépense…"
                required
              />
            </div>

            {/* Fournisseur */}
            <div className="relative">
              <label className="label">Fournisseur / Bénéficiaire</label>
              <input type="text"
                value={supplierName}
                onChange={(e) => { setSupplierName(e.target.value); setSupplierSearch(e.target.value); setShowSupplierDrop(true); }}
                onFocus={() => setShowSupplierDrop(true)}
                onBlur={() => setTimeout(() => setShowSupplierDrop(false), 150)}
                className="input"
                placeholder="Nom du fournisseur ou bénéficiaire"
                autoComplete="off"
              />
              {showSupplierDrop && supplierSearch && (
                (() => {
                  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()));
                  return filtered.length > 0 ? (
                    <div className="absolute z-20 mt-1 w-full bg-dark-700 border border-dark-600 rounded-xl overflow-hidden shadow-xl max-h-40 overflow-y-auto">
                      {filtered.slice(0, 6).map(s => (
                        <button key={s.id} type="button"
                          onMouseDown={() => { setSupplierName(s.name); setShowSupplierDrop(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-600 text-left transition-colors"
                        >
                          <span className="text-sm text-slate-200">{s.name}</span>
                          {s.phone && <span className="text-xs text-slate-500 ml-auto">{s.phone}</span>}
                        </button>
                      ))}
                    </div>
                  ) : null;
                })()
              )}
            </div>

            {/* Mode de règlement */}
            <div>
              <label className="label">Mode de règlement *</label>
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

            {/* Date d'échéance si crédit */}
            {paymentMethod === 'credit' && (
              <div className="sm:col-span-2">
                <label className="label">Date d&apos;échéance du crédit</label>
                <input type="date" value={creditDueDate}
                  onChange={(e) => setCreditDueDate(e.target.value)}
                  className="input"
                  min={expenseDate}
                />
                <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Cette dépense sera enregistrée comme dette jusqu&apos;au remboursement.
                </p>
              </div>
            )}
          </div>

          {/* ===== RÉAPPROVISIONNEMENT ===== */}
          {isReappro ? (
            <div className="space-y-4 bg-dark-700 rounded-xl p-4 border border-neon-violet/20">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-neon-violet" />
                <p className="text-sm font-semibold text-slate-200">Produits réapprovisionnés</p>
                <span className="text-xs text-slate-500">(le stock sera mis à jour automatiquement)</span>
              </div>

              {/* Recherche produit */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input className="input pl-9" placeholder="Chercher un produit à réapprovisionner…"
                  value={searchProduct} onChange={(e) => setSearchProduct(e.target.value)}
                />
              </div>
              {searchProduct && filteredProducts.length > 0 && (
                <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden shadow-xl max-h-40 overflow-y-auto">
                  {filteredProducts.slice(0, 6).map(p => (
                    <button key={p.id} type="button" onClick={() => addReapproLine(p)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-dark-700 text-left transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-200">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.reference} · stock: {p.stock_qty}</p>
                      </div>
                      <span className="text-xs text-neon-violet">{formatCFA(p.buy_price)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Lignes réappro */}
              {reapproLines.length > 0 && (
                <div className="space-y-2">
                  {reapproLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-dark-800 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{line.product.name}</p>
                        <p className="text-xs text-slate-500">{line.product.reference}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="text-[10px] text-slate-500 mb-0.5">Qté</p>
                          <input type="number" min={1} value={line.qty}
                            onChange={(e) => updateReapproLine(idx, 'qty', Number(e.target.value))}
                            className="input w-16 text-center text-sm py-1"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 mb-0.5">P.U. achat</p>
                          <input type="number" min={0} value={line.unit_cost}
                            onChange={(e) => updateReapproLine(idx, 'unit_cost', Number(e.target.value))}
                            className="input w-28 text-sm py-1"
                          />
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 mb-0.5">Sous-total</p>
                          <p className="text-sm font-semibold text-white">{formatCFA(line.qty * line.unit_cost)}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeReapproLine(idx)}
                        className="text-slate-500 hover:text-red-400 transition-colors ml-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-end pt-2 border-t border-dark-600">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Montant total réappro</p>
                      <p className="text-xl font-bold gradient-text">{formatCFA(reapproTotal)}</p>
                    </div>
                  </div>
                </div>
              )}

              {reapproLines.length === 0 && (
                <p className="text-sm text-slate-600 text-center py-3">
                  Cherche et ajoute des produits ci-dessus
                </p>
              )}
            </div>
          ) : (
            /* Montant normal */
            <div>
              <label className="label">Montant (FCFA) *</label>
              <input type="number" min={1} value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input" placeholder="ex: 50000" required
              />
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Annuler</button>
            <button type="submit"
              disabled={saving || (isReappro && reapproLines.length === 0) || !description.trim()}
              className="btn-primary min-w-32"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              {saving ? 'Enregistrement…' : 'Valider'}
            </button>
          </div>
        </form>
      )}

      {/* Résumé par catégorie (horizontal) */}
      {Object.keys(byCategory).length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">Par catégorie</h3>
            <p className="text-xs text-slate-500">Total : {formatCFA(totalMonth)}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.values(byCategory).sort((a, b) => b.total - a.total).map((cat) => (
              <div key={cat.name} className="space-y-1.5 p-3 rounded-xl bg-dark-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 truncate">{cat.name}</span>
                  <span className="text-[10px] font-medium text-slate-500">
                    {totalMonth > 0 ? ((cat.total / totalMonth) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-200">{formatCFA(cat.total, true)}</p>
                <div className="h-1 rounded-full bg-dark-600 overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${(cat.total / totalMonth) * 100}%`, backgroundColor: cat.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtre mois + tableau */}
      <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">Mois :</label>
            <input type="month" value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="input w-40 py-1.5 text-sm"
            />
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-600 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Catégorie</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium">Fournisseur</th>
                    <th className="px-5 py-3 font-medium">Règlement</th>
                    <th className="px-5 py-3 font-medium text-right">Montant</th>
                    {userRole === 'admin' && <th className="px-5 py-3 font-medium text-center">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {[...Array(6)].map((__, j) => (
                          <td key={j} className="px-5 py-3.5"><div className="h-3 bg-dark-700 rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-600">
                        Aucune dépense ce mois
                      </td>
                    </tr>
                  ) : (
                    expenses.map((e) => (
                      <tr key={e.id} className={cn(
                        'hover:bg-dark-700/50 transition-colors',
                        e.payment_method === 'credit' && !e.is_settled && 'bg-orange-500/5'
                      )}>
                        <td className="px-5 py-3.5 text-slate-400 text-xs whitespace-nowrap">{formatDate(e.expense_date)}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                            style={{
                              backgroundColor: ((e.category as ExpenseCategory | undefined)?.color ?? '#6b7280') + '22',
                              color: (e.category as ExpenseCategory | undefined)?.color ?? '#6b7280',
                              border: `1px solid ${((e.category as ExpenseCategory | undefined)?.color ?? '#6b7280')}44`,
                            }}
                          >
                            {(e.category as ExpenseCategory | undefined)?.name ?? 'Autre'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-300 max-w-xs truncate">{e.description}</td>
                        <td className="px-5 py-3.5 text-slate-400 text-xs">{e.supplier_name ?? '—'}</td>
                        <td className="px-5 py-3.5">
                          <span className={cn('badge text-xs', PAYMENT_BADGE_CLASS[e.payment_method as PaymentMethod] ?? 'badge-green')}>
                            {PAYMENT_LABELS[e.payment_method as PaymentMethod] ?? e.payment_method}
                          </span>
                          {e.payment_method === 'credit' && !e.is_settled && (
                            <p className="text-[10px] text-orange-400 mt-0.5">
                              Échéance : {e.credit_due_date ? formatDate(e.credit_due_date) : '—'}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-white">
                          {formatCFA(e.amount)}
                        </td>
                        {userRole === 'admin' && (
                          <td className="px-5 py-3.5 text-center">
                            <button
                              onClick={() => setConfirmDelExp(e)}
                              disabled={deletingExpId === e.id}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                              title="Supprimer la dépense"
                            >
                              {deletingExpId === e.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {expenses.length > 0 && (
                  <tfoot className="border-t border-dark-600">
                    <tr>
                      <td colSpan={5} className="px-5 py-3 text-sm text-slate-400 font-medium">Total</td>
                      <td className="px-5 py-3 text-right text-base font-bold text-white">{formatCFA(totalMonth)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
      </div>
      {/* ===== MODAL CONFIRMATION SUPPRESSION DÉPENSE ===== */}
      {confirmDelExp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 space-y-4 border border-red-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">Supprimer la dépense</h3>
                <p className="text-xs text-slate-500 mt-0.5">{confirmDelExp.description}</p>
              </div>
            </div>
            <div className="bg-dark-700 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Catégorie</span><span className="text-slate-200">{(confirmDelExp.category as ExpenseCategory | undefined)?.name ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Date</span><span className="text-slate-200">{formatDate(confirmDelExp.expense_date)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Montant</span><span className="font-bold text-white">{formatCFA(confirmDelExp.amount)}</span></div>
            </div>
            {(confirmDelExp.category as ExpenseCategory | undefined)?.name === 'Réapprovisionnement' && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>C&apos;est un réappro — <strong>le stock sera décrémenté automatiquement</strong> pour annuler l&apos;entrée.</span>
              </div>
            )}
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Action irréversible.</span>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setConfirmDelExp(null)} className="btn-secondary">Annuler</button>
              <button
                onClick={() => handleDeleteExpense(confirmDelExp)}
                disabled={deletingExpId !== null}
                className="btn-danger min-w-36"
              >
                {deletingExpId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deletingExpId ? 'Suppression…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
