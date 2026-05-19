'use client';

import { cn } from '@/lib/utils';
import type { VStockAlert } from '@/types';
import { Package, ArrowRight, AlertTriangle, XCircle } from 'lucide-react';
import Link from 'next/link';

interface StockAlertsProps {
  alerts: VStockAlert[];
  loading?: boolean;
}

export default function StockAlerts({ alerts, loading }: StockAlertsProps) {
  const criticalAlerts = alerts.filter((a) => a.stock_qty === 0);
  const lowAlerts      = alerts.filter((a) => a.stock_qty > 0 && a.is_low_stock);

  return (
    <div className="card flex flex-col h-full">
      {/* En-tête */}
      <div className="flex items-center justify-between p-5 border-b border-dark-600">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <h2 className="font-semibold text-slate-200 text-sm">Alertes stock</h2>
          {!loading && alerts.length > 0 && (
            <span className="badge badge-orange">{alerts.length}</span>
          )}
        </div>
        <Link
          href="/stock"
          className="flex items-center gap-1 text-xs text-neon-blue hover:text-neon-blue/80 transition-colors"
        >
          Gérer <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto divide-y divide-dark-600">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-dark-700 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-dark-700 rounded w-2/3" />
                <div className="h-2.5 bg-dark-700 rounded w-1/3" />
              </div>
              <div className="h-5 w-12 bg-dark-700 rounded-full" />
            </div>
          ))
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600">
            <Package className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">Stock en bonne santé ✓</p>
          </div>
        ) : (
          <>
            {criticalAlerts.map((item) => (
              <AlertRow key={item.id} item={item} type="critical" />
            ))}
            {lowAlerts.map((item) => (
              <AlertRow key={item.id} item={item} type="low" />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function AlertRow({
  item,
  type,
}: {
  item: VStockAlert;
  type: 'critical' | 'low';
}) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-5 py-3.5 hover:bg-dark-700/50 transition-colors',
      type === 'critical' && 'bg-red-500/5'
    )}>
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        type === 'critical'
          ? 'bg-red-500/10 border border-red-500/20'
          : 'bg-orange-500/10 border border-orange-500/20'
      )}>
        {type === 'critical' ? (
          <XCircle className="w-4 h-4 text-red-400" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-orange-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{item.name}</p>
        <p className="text-[11px] text-slate-500">{item.category} · {item.reference}</p>
      </div>

      <div className="text-right flex-shrink-0">
        <span className={cn(
          'badge text-xs',
          type === 'critical' ? 'badge-red' : 'badge-orange'
        )}>
          {item.stock_qty === 0 ? 'Rupture' : `${item.stock_qty} restants`}
        </span>
        <p className="text-[10px] text-slate-600 mt-0.5">min. {item.stock_min}</p>
      </div>
    </div>
  );
}
