'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Menu, Bell, Search, AlertTriangle, Package, X } from 'lucide-react';
import Link from 'next/link';
import type { VStockAlert } from '@/types';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
  alertCount?: number;
  stockAlerts?: VStockAlert[];
}

export default function Header({
  title, subtitle, onMenuClick,
  alertCount = 0,
  stockAlerts = [],
}: HeaderProps) {
  const [showNotif, setShowNotif] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fermer en cliquant ailleurs
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowNotif(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-4 md:px-6 border-b border-dark-600 bg-dark-900/80 backdrop-blur-md">
      {/* Gauche */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 transition-colors"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-bold text-white leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-500 leading-tight">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Droite */}
      <div className="flex items-center gap-2">
        {/* Recherche globale (desktop) */}
        <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-slate-500 hover:border-neon-blue/30 hover:text-slate-300 transition-all text-sm">
          <Search className="w-3.5 h-3.5" />
          <span>Rechercher…</span>
          <kbd className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-dark-600 text-slate-600 font-mono">⌘K</kbd>
        </button>

        {/* Cloche notifications */}
        <div ref={ref} className="relative">
          <button
            onClick={() => setShowNotif(v => !v)}
            className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {alertCount > 0 && (
              <span className={cn(
                'absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full',
                'bg-red-500 text-white text-[9px] font-bold',
                'flex items-center justify-center shadow-[0_0_8px_#ef4444]'
              )}>
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>

          {/* Dropdown alertes stock */}
          {showNotif && (
            <div className="absolute right-0 top-full mt-2 w-80 card shadow-2xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-semibold text-slate-200">Alertes stock</span>
                  {alertCount > 0 && (
                    <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded-full font-medium">
                      {alertCount}
                    </span>
                  )}
                </div>
                <button onClick={() => setShowNotif(false)} className="text-slate-500 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto">
                {stockAlerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
                    <Package className="w-8 h-8 text-emerald-400/40" />
                    <p className="text-xs">Tous les stocks sont OK 👍</p>
                  </div>
                ) : (
                  stockAlerts.map((a) => (
                    <div key={a.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-dark-600/50 last:border-0 hover:bg-dark-700/50 transition-colors"
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        a.stock_qty === 0 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                      )}>
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate font-medium">{a.name}</p>
                        <p className="text-xs text-slate-500">{a.reference}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={cn(
                          'text-sm font-bold',
                          a.stock_qty === 0 ? 'text-red-400' : 'text-orange-400'
                        )}>
                          {a.stock_qty}
                        </p>
                        <p className="text-[10px] text-slate-600">/ min {a.stock_min}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-2.5 border-t border-dark-600 bg-dark-800/60">
                <Link href="/stock"
                  onClick={() => setShowNotif(false)}
                  className="text-xs text-neon-blue hover:underline"
                >
                  Voir tout le stock →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
