import { createClient } from '@/lib/supabase/server';
import DashboardClient from './DashboardClient';

export const metadata = { title: 'Tableau de bord' };

export default async function DashboardPage() {
  const supabase = await createClient();

  // Statistiques du jour
  const { data: todayStats } = await supabase
    .from('v_today_stats')
    .select('*')
    .single();

  // CA du mois en cours
  const now          = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayDate    = now.toISOString().split('T')[0]; // YYYY-MM-DD

  const { data: monthSales } = await supabase
    .from('sales')
    .select('total')
    .gte('created_at', startOfMonth);
  const revenueMonth = monthSales?.reduce((sum, s) => sum + (s.total ?? 0), 0) ?? 0;

  // Dépenses du JOUR — filtre par expense_date (pas created_at)
  // pour que les dépenses backdatées ne polluent pas le KPI "Aujourd'hui"
  const { data: todayExpenses } = await supabase
    .from('expenses')
    .select('amount')
    .eq('expense_date', todayDate);
  const expensesMonth = todayExpenses?.reduce((sum, e) => sum + (e.amount ?? 0), 0) ?? 0;

  // Valeur totale du stock
  const { data: stockValue } = await supabase
    .from('v_stock_alerts')
    .select('stock_value');
  const totalStockValue = stockValue?.reduce((sum, s) => sum + (s.stock_value ?? 0), 0) ?? 0;

  // Produits en alerte
  const { data: stockAlerts } = await supabase
    .from('v_stock_alerts')
    .select('*')
    .eq('is_low_stock', true)
    .order('stock_qty', { ascending: true })
    .limit(10);

  // Ventes récentes (20 dernières)
  const { data: recentSales } = await supabase
    .from('v_sales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  // Données graphique : 30 derniers jours
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: salesRaw } = await supabase
    .from('sales')
    .select('total, created_at')
    .gte('created_at', thirtyDaysAgo.toISOString());

  const { data: expensesRaw } = await supabase
    .from('expenses')
    .select('amount, expense_date')
    .gte('expense_date', thirtyDaysAgo.toISOString().split('T')[0]);

  // Agrégation par jour
  const chartMap: Record<string, { revenue: number; expenses: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    chartMap[key] = { revenue: 0, expenses: 0 };
  }

  salesRaw?.forEach((s) => {
    const key = new Date(s.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    if (chartMap[key]) chartMap[key].revenue += s.total ?? 0;
  });

  expensesRaw?.forEach((e) => {
    const key = new Date(e.expense_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    if (chartMap[key]) chartMap[key].expenses += e.amount ?? 0;
  });

  const chartData = Object.entries(chartMap).map(([date, val]) => ({ date, ...val }));

  return (
    <DashboardClient
      todayStats={{
        revenue_today:      todayStats?.revenue_today     ?? 0,
        sales_count_today:  todayStats?.sales_count_today ?? 0,
        revenue_month:      revenueMonth,
        expenses_month:     expensesMonth,
        stock_value:        totalStockValue,
        low_stock_count:    stockAlerts?.length ?? 0,
      }}
      stockAlerts={stockAlerts ?? []}
      recentSales={recentSales ?? []}
      chartData={chartData}
    />
  );
}
