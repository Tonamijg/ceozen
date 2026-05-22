'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import StatsCard    from '@/components/dashboard/StatsCard';
import RecentSales  from '@/components/dashboard/RecentSales';
import StockAlerts  from '@/components/dashboard/StockAlerts';
import SalesChart   from '@/components/dashboard/SalesChart';
import type { DashboardStats, VStockAlert, VSale } from '@/types';
import {
  TrendingUp, ShoppingBag, Package, AlertTriangle,
  Wallet, RefreshCw, Calendar
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChartData { date: string; revenue: number; expenses: number; }

type Period = 'today' | 'week' | 'month' | 'year';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week',  label: '7 jours'    },
  { key: 'month', label: 'Ce mois'    },
  { key: 'year',  label: 'Cette année'},
];

// ─── Helper : compute date range from a Period ────────────────────────────────
function getDateRange(period: Period): { from: string; to: string; chartDays: number } {
  const now   = new Date();
  const to    = now.toISOString();

  if (period === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    return { from, to, chartDays: 1 };
  }
  if (period === 'week') {
    const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to, chartDays: 7 };
  }
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return { from, to, chartDays: 30 };
  }
  // year
  const from = new Date(now.getFullYear(), 0, 1).toISOString();
  return { from, to, chartDays: 365 };
}

// ─── Build aggregated chart data ──────────────────────────────────────────────
function buildChartData(
  salesRaw: { total: number; created_at: string }[],
  expensesRaw: { amount: number; expense_date: string }[],
  chartDays: number
): ChartData[] {
  // For year: aggregate by month. For others: by day.
  const byMonth = chartDays > 60;

  const chartMap: Record<string, { revenue: number; expenses: number }> = {};

  if (byMonth) {
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      chartMap[key] = { revenue: 0, expenses: 0 };
    }
    salesRaw.forEach((s) => {
      const key = new Date(s.created_at).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      if (chartMap[key]) chartMap[key].revenue += s.total ?? 0;
    });
    expensesRaw.forEach((e) => {
      const key = new Date(e.expense_date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      if (chartMap[key]) chartMap[key].expenses += e.amount ?? 0;
    });
  } else {
    const days = Math.min(chartDays, 30);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      chartMap[key] = { revenue: 0, expenses: 0 };
    }
    salesRaw.forEach((s) => {
      const key = new Date(s.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      if (chartMap[key]) chartMap[key].revenue += s.total ?? 0;
    });
    expensesRaw.forEach((e) => {
      const key = new Date(e.expense_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      if (chartMap[key]) chartMap[key].expenses += e.amount ?? 0;
    });
  }

  return Object.entries(chartMap).map(([date, val]) => ({ date, ...val }));
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface DashboardClientProps {
  todayStats:  DashboardStats;
  stockAlerts: VStockAlert[];
  recentSales: VSale[];
  chartData:   ChartData[];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardClient({
  todayStats:   initialStats,
  stockAlerts:  initialAlerts,
  recentSales:  initialSales,
  chartData:    initialChart,
}: DashboardClientProps) {
  const supabase = createClient();

  const [period,     setPeriod]     = useState<Period>('today');
  const [stats,      setStats]      = useState<DashboardStats>(initialStats);
  const [alerts,     setAlerts]     = useState<VStockAlert[]>(initialAlerts);
  const [sales,      setSales]      = useState<VSale[]>(initialSales);
  const [chart,      setChart]      = useState<ChartData[]>(initialChart);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [pulse,      setPulse]      = useState(false);
  const [loadingP,   setLoadingP]   = useState(false);

  // ── Fetches stats for a given period ────────────────────────────────────────
  const fetchPeriodStats = useCallback(async (p: Period) => {
    setLoadingP(true);
    const { from, to, chartDays } = getDateRange(p);

    const [
      { data: periodSales },
      { data: periodTrocs },
      { data: periodExpenses },
      { data: newAlerts },
      { data: newSales },
      { data: salesChart },
      { data: expensesChart },
    ] = await Promise.all([
      supabase.from('sales').select('total').gte('created_at', from).lte('created_at', to),
      supabase.from('trocs').select('complement').gte('created_at', from).lte('created_at', to),
      supabase.from('expenses').select('amount').gte('expense_date', from.split('T')[0]).lte('expense_date', to.split('T')[0]),
      supabase.from('v_stock_alerts').select('*').eq('is_low_stock', true).order('stock_qty').limit(10),
      supabase.from('v_sales').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('sales').select('total, created_at').gte('created_at', from).lte('created_at', to),
      supabase.from('expenses').select('amount, expense_date').gte('expense_date', from.split('T')[0]).lte('expense_date', to.split('T')[0]),
    ]);

    const salesRevenue = periodSales?.reduce((s, x) => s + (x.total     ?? 0), 0) ?? 0;
    const trocsRevenue = periodTrocs?.reduce((s, x) => s + (x.complement ?? 0), 0) ?? 0;
    const revenue    = salesRevenue + trocsRevenue;
    const expenses   = periodExpenses?.reduce((s, x) => s + (x.amount ?? 0), 0) ?? 0;
    const salesCount = periodSales?.length ?? 0;

    setStats(prev => ({
      ...prev,
      revenue_today:     p === 'today' ? revenue    : prev.revenue_today,
      sales_count_today: p === 'today' ? salesCount : prev.sales_count_today,
      revenue_month:     revenue,
      expenses_month:    expenses,
      low_stock_count:   newAlerts?.length ?? 0,
    }));
    setAlerts(newAlerts ?? []);
    setSales(newSales ?? []);
    setChart(buildChartData(salesChart ?? [], expensesChart ?? [], chartDays));
    setLastUpdate(new Date());
    setPulse(true);
    setTimeout(() => setPulse(false), 600);
    setLoadingP(false);
  }, [supabase]);

  // ── When period changes, refetch ─────────────────────────────────────────────
  useEffect(() => {
    if (period === 'today') return; // initial data already correct for today
    fetchPeriodStats(period);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // ── Manual refresh ───────────────────────────────────────────────────────────
  const refreshStats = useCallback(() => {
    fetchPeriodStats(period);
  }, [period, fetchPeriodStats]);

  // ── Supabase Realtime ────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' },          () => refreshStats())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_movements' }, () => refreshStats())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses' },        () => refreshStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, refreshStats]);

  // ── Label des stats selon la période ────────────────────────────────────────
  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? '';
  const revenueLabel  = period === 'today' ? 'CA du jour'       : `CA — ${periodLabel}`;
  const countLabel    = period === 'today' ? 'Ventes du jour'   : `Ventes — ${periodLabel}`;
  const expLabel      = period === 'today' ? 'Dépenses du jour' : `Dépenses — ${periodLabel}`;
  const marginLabel   = period === 'today' ? 'Marge du jour'    : `Marge — ${periodLabel}`;

  return (
    <div className="space-y-6">

      {/* ── Barre supérieure : temps réel + sélecteur période ───────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Indicateur temps réel */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span
            className={`w-2 h-2 rounded-full transition-colors duration-300 ${
              pulse ? 'bg-neon-blue shadow-[0_0_8px_#00d4ff]' : 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
            }`}
          />
          Temps réel · mis à jour {formatDateTime(lastUpdate)}
        </div>

        {/* Sélecteur de période */}
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <div className="flex rounded-xl overflow-hidden border border-dark-600 bg-dark-800">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                disabled={loadingP}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-all duration-150 relative',
                  period === p.key
                    ? 'bg-neon-blue/20 text-neon-blue'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={refreshStats}
            disabled={loadingP}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 transition-colors ml-1"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loadingP && 'animate-spin')} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ── Statistiques ────────────────────────────────────────────────────── */}
      <div className={cn('stats-grid transition-opacity duration-200', loadingP && 'opacity-60')}>
        <StatsCard
          title={revenueLabel}
          value={stats.revenue_month}
          icon={TrendingUp}
          iconColor="text-neon-blue"
          iconBg="bg-neon-blue/10"
          glow="blue"
        />
        <StatsCard
          title={countLabel}
          value={period === 'today' ? stats.sales_count_today : 0}
          isCurrency={false}
          icon={ShoppingBag}
          iconColor="text-neon-violet"
          iconBg="bg-neon-violet/10"
          glow="violet"
        />
        <StatsCard
          title="CA du mois"
          value={stats.revenue_month}
          icon={Wallet}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10"
          glow="green"
        />
        <StatsCard
          title={expLabel}
          value={stats.expenses_month}
          icon={Package}
          iconColor="text-orange-400"
          iconBg="bg-orange-500/10"
          glow="orange"
        />
      </div>

      {/* ── Graphique + alertes stock ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 min-h-[320px]">
          <SalesChart data={chart} />
        </div>
        <div className="min-h-[320px]">
          <StockAlerts alerts={alerts} />
        </div>
      </div>

      {/* ── Stats bas ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 flex flex-col gap-1">
          <p className="text-xs text-slate-500">Valeur du stock</p>
          <p className="text-xl font-bold text-white">
            {new Intl.NumberFormat('fr-FR').format(stats.stock_value)} FCFA
          </p>
        </div>
        <div className="card p-5 flex flex-col gap-1">
          <p className="text-xs text-slate-500">Produits en alerte</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold text-white">{stats.low_stock_count}</p>
            {stats.low_stock_count > 0 && (
              <AlertTriangle className="w-4 h-4 text-orange-400" />
            )}
          </div>
        </div>
        <div className="card p-5 flex flex-col gap-1">
          <p className="text-xs text-slate-500">{marginLabel}</p>
          <p className={`text-xl font-bold ${
            stats.revenue_month - stats.expenses_month >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {new Intl.NumberFormat('fr-FR').format(stats.revenue_month - stats.expenses_month)} FCFA
          </p>
        </div>
      </div>

      {/* ── Ventes récentes ──────────────────────────────────────────────────── */}
      <div className="min-h-[320px]">
        <RecentSales sales={sales} />
      </div>
    </div>
  );
}
