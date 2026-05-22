'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCFA, formatDate } from '@/lib/utils';
import type { VStockAlert } from '@/types';
import {
  BarChart3, TrendingUp, Package, Receipt,
  Download, RefreshCw, FileSpreadsheet, Printer,
  ShoppingCart, AlertTriangle, ArrowLeftRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';

interface TopProduct {
  product_name: string;
  total_qty: number;
  total_revenue: number;
}

interface SellerStat {
  seller_name: string;
  sale_count: number;
  total_revenue: number;
}

interface ExpenseByCat {
  name: string;
  color: string;
  total: number;
}

const NEON_PALETTE = [
  '#00d4ff', '#a855f7', '#22d3ee', '#ec4899',
  '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-white font-semibold">{formatCFA(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

export default function RapportsPage() {
  const supabase = createClient();

  const now = new Date();
  const [period, setPeriod] = useState({
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    to:   now.toISOString().split('T')[0],
  });

  const [loading,        setLoading]        = useState(true);
  const [totalRevenue,   setTotalRevenue]   = useState(0);
  const [totalExpenses,  setTotalExpenses]  = useState(0);
  const [salesCount,     setSalesCount]     = useState(0);
  const [trocsCount,     setTrocsCount]     = useState(0);
  const [trocsRevenue,   setTrocsRevenue]   = useState(0);
  const [avgSale,        setAvgSale]        = useState(0);
  const [topProducts,    setTopProducts]    = useState<TopProduct[]>([]);
  const [sellerStats,    setSellerStats]    = useState<SellerStat[]>([]);
  const [stockSnapshot,  setStockSnapshot]  = useState<VStockAlert[]>([]);
  const [expensesByCat,  setExpensesByCat]  = useState<ExpenseByCat[]>([]);
  const [exporting,      setExporting]      = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const from = period.from + 'T00:00:00';
    const to   = period.to   + 'T23:59:59';

    const [{ data: salesData }, { data: trocsData }, { data: expData }, { data: items }, { data: salesWithSeller }, { data: expenses }, { data: stock }] =
      await Promise.all([
        supabase.from('sales').select('id, total, created_at').gte('created_at', from).lte('created_at', to),
        supabase.from('trocs').select('complement').gte('created_at', from).lte('created_at', to),
        supabase.from('expenses').select('amount').gte('expense_date', period.from).lte('expense_date', period.to),
        supabase.from('sale_items').select('product_id, qty, total, product:products(name), sale:sales!inner(created_at)').gte('sale.created_at', from).lte('sale.created_at', to),
        supabase.from('v_sales').select('seller_name, total').gte('created_at', from).lte('created_at', to),
        supabase.from('expenses').select('amount, category:expense_categories(name, color)').gte('expense_date', period.from).lte('expense_date', period.to),
        supabase.from('v_stock_alerts').select('*').order('name'),
      ]);

    const salesRev = salesData?.reduce((s, x) => s + (x.total      ?? 0), 0) ?? 0;
    const trocsRev = trocsData?.reduce((s, x) => s + (x.complement ?? 0), 0) ?? 0;
    const rev = salesRev + trocsRev;
    setTotalRevenue(rev);
    setTrocsRevenue(trocsRev);
    setTrocsCount(trocsData?.length ?? 0);
    setSalesCount(salesData?.length ?? 0);
    setAvgSale(salesData?.length ? salesRev / salesData.length : 0);
    setTotalExpenses(expData?.reduce((s, x) => s + (x.amount ?? 0), 0) ?? 0);

    // Top produits
    const productMap: Record<string, TopProduct> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items?.forEach((item: any) => {
      const productName = Array.isArray(item.product) ? item.product[0]?.name : item.product?.name;
      const name = productName ?? item.product_id;
      if (!productMap[name]) productMap[name] = { product_name: name, total_qty: 0, total_revenue: 0 };
      productMap[name].total_qty     += Number(item.qty ?? 0);
      productMap[name].total_revenue += Number(item.total ?? 0);
    });
    setTopProducts(Object.values(productMap).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 8));

    // Par vendeur
    const sellerMap: Record<string, SellerStat> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    salesWithSeller?.forEach((s: any) => {
      const name = s.seller_name ?? '—';
      if (!sellerMap[name]) sellerMap[name] = { seller_name: name, sale_count: 0, total_revenue: 0 };
      sellerMap[name].sale_count++;
      sellerMap[name].total_revenue += Number(s.total ?? 0);
    });
    setSellerStats(Object.values(sellerMap).sort((a, b) => b.total_revenue - a.total_revenue));

    // Dépenses par catégorie
    const catMap: Record<string, ExpenseByCat> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expenses?.forEach((e: any) => {
      const catData = Array.isArray(e.category) ? e.category[0] : e.category;
      const name  = catData?.name ?? 'Autre';
      const color = catData?.color ?? '#6b7280';
      if (!catMap[name]) catMap[name] = { name, color, total: 0 };
      catMap[name].total += Number(e.amount ?? 0);
    });
    setExpensesByCat(Object.values(catMap).sort((a, b) => b.total - a.total));

    setStockSnapshot((stock as VStockAlert[]) ?? []);
    setLoading(false);
  }, [supabase, period]);

  useEffect(() => { load(); }, [load]);

  const margin = totalRevenue - totalExpenses;
  const totalStockValue = stockSnapshot.reduce((s, p) => s + (p.stock_value ?? 0), 0);

  // Export Excel
  async function handleExcelExport() {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      const wb = XLSX.utils.book_new();

      // Feuille 1 : Résumé
      const summary = [
        ['CEOZEN — Rapport de gestion'],
        [`Période : ${formatDate(period.from)} → ${formatDate(period.to)}`],
        [],
        ['Indicateur', 'Valeur'],
        ["Chiffre d'affaires total (ventes + trocs)", totalRevenue],
        ['Dépenses', totalExpenses],
        ['Marge nette', margin],
        ['Nombre de ventes', salesCount],
        ['Panier moyen (ventes)', avgSale],
        ['Valeur du stock', totalStockValue],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summary);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Résumé');

      // Feuille 2 : Top Produits
      if (topProducts.length) {
        const wsProducts = XLSX.utils.json_to_sheet(topProducts.map((p, i) => ({
          Rang: i + 1,
          Produit: p.product_name,
          'Quantité vendue': p.total_qty,
          'CA (FCFA)': p.total_revenue,
        })));
        XLSX.utils.book_append_sheet(wb, wsProducts, 'Top Produits');
      }

      // Feuille 3 : Par vendeur
      if (sellerStats.length) {
        const wsSellers = XLSX.utils.json_to_sheet(sellerStats.map((s) => ({
          Vendeur: s.seller_name,
          'Nb ventes': s.sale_count,
          'CA (FCFA)': s.total_revenue,
        })));
        XLSX.utils.book_append_sheet(wb, wsSellers, 'Vendeurs');
      }

      // Feuille 4 : Stock
      if (stockSnapshot.length) {
        const wsStock = XLSX.utils.json_to_sheet(stockSnapshot.map((p) => ({
          Référence: p.reference,
          Produit: p.name,
          Catégorie: p.category,
          'Qté en stock': p.stock_qty,
          'Seuil alerte': p.stock_min,
          'Prix achat': p.buy_price,
          'Prix vente': p.sell_price,
          'Valeur stock': p.stock_value,
          Statut: p.stock_qty === 0 ? 'Rupture' : p.is_low_stock ? 'Stock bas' : 'OK',
        })));
        XLSX.utils.book_append_sheet(wb, wsStock, 'Stock');
      }

      // Feuille 5 : Dépenses
      if (expensesByCat.length) {
        const wsExp = XLSX.utils.json_to_sheet(expensesByCat.map((e) => ({
          Catégorie: e.name,
          'Total (FCFA)': e.total,
          '% du total': totalExpenses > 0 ? ((e.total / totalExpenses) * 100).toFixed(1) + '%' : '0%',
        })));
        XLSX.utils.book_append_sheet(wb, wsExp, 'Dépenses');
      }

      XLSX.writeFile(wb, `ceozen-rapport-${period.from}-${period.to}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6" id="rapport-print">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Rapports</h2>
          <p className="text-sm text-slate-500">
            {formatDate(period.from)} → {formatDate(period.to)}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-dark-800 border border-dark-600 rounded-xl px-3 py-2">
            <label className="text-xs text-slate-400">Du</label>
            <input type="date" value={period.from}
              onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
              className="bg-transparent text-sm text-slate-200 outline-none"
            />
            <label className="text-xs text-slate-400">au</label>
            <input type="date" value={period.to}
              onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
              className="bg-transparent text-sm text-slate-200 outline-none"
            />
          </div>
          <button onClick={load} className="btn-secondary py-2 text-sm">
            <RefreshCw className="w-3.5 h-3.5" />
            Actualiser
          </button>
          <button onClick={handleExcelExport} disabled={exporting} className="btn-secondary py-2 text-sm text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {exporting ? 'Export…' : 'Excel'}
          </button>
          <button onClick={() => window.print()} className="btn-primary py-2 text-sm">
            <Printer className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Chiffre d'affaires", value: formatCFA(totalRevenue, true), icon: TrendingUp,   color: 'text-neon-blue',   bg: 'bg-neon-blue/10',   glow: 'shadow-[0_0_0_1px_#00d4ff15]' },
          { label: 'Dépenses totales',   value: formatCFA(totalExpenses, true), icon: Receipt,     color: 'text-orange-400',  bg: 'bg-orange-500/10',  glow: '' },
          { label: 'Marge nette',        value: formatCFA(margin, true),        icon: BarChart3,   color: margin >= 0 ? 'text-emerald-400' : 'text-red-400', bg: margin >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10', glow: '' },
          { label: 'Nombre de ventes',   value: salesCount.toLocaleString(),    icon: ShoppingCart, color: 'text-neon-violet', bg: 'bg-neon-violet/10', glow: 'shadow-[0_0_0_1px_#a855f715]' },
        ].map((kpi) => (
          <div key={kpi.label} className={`card p-5 transition-all hover:translate-y-[-2px] ${kpi.glow}`}>
            <div className={`w-9 h-9 rounded-xl ${kpi.bg} flex items-center justify-center mb-3`}>
              <kpi.icon className={`w-4.5 h-4.5 ${kpi.color}`} size={18} />
            </div>
            <p className="text-2xl font-bold text-white">{loading ? <span className="animate-pulse text-slate-600">—</span> : kpi.value}</p>
            <p className="text-xs text-slate-500 mt-1">{kpi.label}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{formatDate(period.from)} → {formatDate(period.to)}</p>
          </div>
        ))}
      </div>

      {/* Ligne 2 : stats supplémentaires */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="card p-5">
          <p className="text-xs text-slate-500 mb-1">Panier moyen</p>
          <p className="text-xl font-bold text-white">{loading ? '—' : formatCFA(avgSale, true)}</p>
          <p className="text-[10px] text-slate-600 mt-1">par vente</p>
        </div>
        <div className="card p-5 border-l-2 border-neon-violet/40">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowLeftRight className="w-3.5 h-3.5 text-neon-violet" />
            <p className="text-xs text-slate-500">Trocs</p>
          </div>
          <p className="text-xl font-bold text-white">{loading ? '—' : trocsCount}</p>
          <p className="text-[10px] text-slate-600 mt-1">opérations</p>
        </div>
        <div className="card p-5 border-l-2 border-neon-violet/40">
          <p className="text-xs text-slate-500 mb-1">CA Trocs</p>
          <p className="text-xl font-bold text-neon-violet">{loading ? '—' : formatCFA(trocsRevenue, true)}</p>
          <p className="text-[10px] text-slate-600 mt-1">compléments encaissés</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500 mb-1">Valeur du stock</p>
          <p className="text-xl font-bold text-white">{loading ? '—' : formatCFA(totalStockValue, true)}</p>
          <p className="text-[10px] text-slate-600 mt-1">au prix d'achat</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-slate-500 mb-1">Produits en alerte</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-white">{stockSnapshot.filter(p => p.is_low_stock).length}</p>
            {stockSnapshot.some(p => p.is_low_stock) && <AlertTriangle className="w-4 h-4 text-orange-400" />}
          </div>
          <p className="text-[10px] text-slate-600 mt-1">stock faible</p>
        </div>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top produits */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-200 text-sm mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-neon-blue" />
            Top produits (CA)
          </h3>
          {loading ? (
            <div className="h-52 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-neon-blue/30 border-t-neon-blue rounded-full animate-spin" />
            </div>
          ) : topProducts.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center text-slate-600">
              <Package className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Aucune vente sur la période</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProducts} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3d" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={(v) => formatCFA(v, true)} axisLine={false} tickLine={false}
                />
                <YAxis type="category" dataKey="product_name"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false} width={120}
                />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="total_revenue" radius={[0, 6, 6, 0]}>
                  {topProducts.map((_, i) => (
                    <Cell key={i} fill={NEON_PALETTE[i % NEON_PALETTE.length]} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Dépenses par catégorie */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-200 text-sm mb-4 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-orange-400" />
            Dépenses par catégorie
          </h3>
          {loading ? (
            <div className="h-52 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-neon-violet/30 border-t-neon-violet rounded-full animate-spin" />
            </div>
          ) : expensesByCat.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center text-slate-600">
              <Receipt className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">Aucune dépense sur la période</p>
            </div>
          ) : (
            <div className="flex gap-4 items-center">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={expensesByCat} dataKey="total" nameKey="name"
                    cx="50%" cy="50%" outerRadius={80} innerRadius={45}
                  >
                    {expensesByCat.map((e, i) => (
                      <Cell key={i} fill={e.color} fillOpacity={0.85} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {expensesByCat.map((cat) => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">{cat.name}</span>
                      <span className="text-white font-medium">{formatCFA(cat.total, true)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-dark-600 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(cat.total / totalExpenses) * 100}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ventes par vendeur */}
      <div className="card p-5">
        <h3 className="font-semibold text-slate-200 text-sm mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neon-violet" />
          Performance par vendeur
        </h3>
        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-dark-700 rounded-lg animate-pulse" />
            ))
          ) : sellerStats.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-6">Aucune vente sur la période</p>
          ) : (
            sellerStats.map((seller, i) => (
              <div key={seller.seller_name} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-neon-violet/10 border border-neon-violet/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-neon-violet">
                    {seller.seller_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-300 font-medium">{seller.seller_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{seller.sale_count} vente(s)</span>
                      <span className="text-white font-semibold">{formatCFA(seller.total_revenue, true)}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-dark-600 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-neon-blue to-neon-violet transition-all duration-700"
                      style={{
                        width: `${(seller.total_revenue / (sellerStats[0]?.total_revenue || 1)) * 100}%`,
                        opacity: 1 - i * 0.15,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* État du stock */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-neon-blue" />
            État du stock à date
          </h3>
          <span className="text-sm font-semibold text-white">
            Valeur totale : {formatCFA(totalStockValue, true)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-xs text-slate-500 uppercase tracking-wide text-left">
                <th className="pb-3 font-medium">Produit</th>
                <th className="pb-3 font-medium">Catégorie</th>
                <th className="pb-3 font-medium text-center">Qté</th>
                <th className="pb-3 font-medium text-right">Prix achat</th>
                <th className="pb-3 font-medium text-right">Valeur</th>
                <th className="pb-3 font-medium text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {stockSnapshot.map((p) => (
                <tr key={p.id} className="hover:bg-dark-700/50 transition-colors">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-200">{p.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{p.reference}</p>
                  </td>
                  <td className="py-3 pr-4 text-slate-400 text-xs">{p.category}</td>
                  <td className="py-3 text-center font-semibold text-white">{p.stock_qty}</td>
                  <td className="py-3 text-right text-slate-400 text-xs">{formatCFA(p.buy_price)}</td>
                  <td className="py-3 text-right font-medium text-white">{formatCFA(p.stock_value)}</td>
                  <td className="py-3 text-center">
                    <span className={`badge text-xs ${
                      p.stock_qty === 0 ? 'badge-red' :
                      p.is_low_stock   ? 'badge-orange' : 'badge-green'
                    }`}>
                      {p.stock_qty === 0 ? 'Rupture' : p.is_low_stock ? 'Stock bas' : 'OK'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Styles print */}
      <style>{`
        @media print {
          .btn-primary, .btn-secondary, [data-no-print] { display: none !important; }
          body { background: white; color: black; }
          .card { border: 1px solid #e5e7eb !important; background: white !important; }
        }
      `}</style>
    </div>
  );
}
