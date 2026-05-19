'use client';

import { formatCFA, formatDateTime, cn } from '@/lib/utils';
import type { VSale } from '@/types';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const PAYMENT_BADGES: Record<string, string> = {
  especes:      'badge-green',
  mobile_money: 'badge-blue',
  carte:        'badge-violet',
  virement:     'badge-orange',
};

const PAYMENT_LABELS: Record<string, string> = {
  especes:      'Espèces',
  mobile_money: 'Mobile',
  carte:        'Carte',
  virement:     'Virement',
};

interface RecentSalesProps {
  sales: VSale[];
  loading?: boolean;
}

export default function RecentSales({ sales, loading }: RecentSalesProps) {
  return (
    <div className="card flex flex-col h-full">
      {/* En-tête */}
      <div className="flex items-center justify-between p-5 border-b border-dark-600">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-neon-blue" />
          <h2 className="font-semibold text-slate-200 text-sm">Ventes récentes</h2>
        </div>
        <Link
          href="/ventes"
          className="flex items-center gap-1 text-xs text-neon-blue hover:text-neon-blue/80 transition-colors"
        >
          Tout voir <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto divide-y divide-dark-600">
        {loading ? (
          /* Skeleton */
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-dark-700 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-dark-700 rounded w-3/4" />
                <div className="h-2.5 bg-dark-700 rounded w-1/2" />
              </div>
              <div className="h-3 bg-dark-700 rounded w-16" />
            </div>
          ))
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600">
            <ShoppingCart className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">Aucune vente aujourd&apos;hui</p>
          </div>
        ) : (
          sales.map((sale) => (
            <div
              key={sale.id}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-dark-700/50 transition-colors"
            >
              {/* Avatar vendeur */}
              <div className="w-8 h-8 rounded-lg bg-neon-violet/10 border border-neon-violet/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-neon-violet">
                  {sale.seller_name?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400 truncate">
                    {sale.sale_number}
                  </span>
                  <span className={cn('badge text-[10px]', PAYMENT_BADGES[sale.payment_method])}>
                    {PAYMENT_LABELS[sale.payment_method]}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {sale.seller_name} · {formatDateTime(sale.created_at)}
                </p>
              </div>

              {/* Montant */}
              <span className="font-semibold text-sm text-white flex-shrink-0">
                {formatCFA(sale.total)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
