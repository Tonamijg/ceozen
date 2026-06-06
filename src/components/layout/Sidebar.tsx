'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';
import {
  LayoutDashboard, ShoppingCart, Receipt, Package,
  BarChart3, User, LogOut, Smartphone, ChevronRight, X,
  Users, Landmark, ArrowLeftRight, Wallet, ShieldCheck
} from 'lucide-react';

const ALL_ROLES = ['admin', 'collaborateur', 'super_admin'] as const;
const ADMIN_ROLES = ['admin', 'super_admin'] as const;

const NAV_ITEMS = [
  { label: 'Tableau de bord',  href: '/dashboard',    icon: LayoutDashboard, roles: ALL_ROLES },
  { label: 'Ventes',           href: '/ventes',        icon: ShoppingCart,    roles: ALL_ROLES },
  { label: 'Dépenses',         href: '/depenses',      icon: Receipt,         roles: ALL_ROLES },
  { label: 'Créances & Dettes',href: '/creances',      icon: Landmark,        roles: ALL_ROLES },
  { label: 'Trocs',            href: '/trocs',         icon: ArrowLeftRight,  roles: ALL_ROLES },
  { label: 'Stock',            href: '/stock',         icon: Package,         roles: ALL_ROLES },
  { label: 'Trésorerie',       href: '/tresorerie',    icon: Wallet,          roles: ADMIN_ROLES },
  { label: 'Rapports',         href: '/rapports',      icon: BarChart3,       roles: ADMIN_ROLES },
  { label: 'Utilisateurs',     href: '/utilisateurs',  icon: Users,           roles: ADMIN_ROLES },
  { label: 'Mon profil',       href: '/profil',        icon: User,            roles: ALL_ROLES },
  { label: 'Super Admin',      href: '/super-admin',   icon: ShieldCheck,     roles: ['super_admin'] as const },
] as const;

interface SidebarProps {
  profile: Profile | null;
  onClose?: () => void;
  isOpen?: boolean;
  onSignOut: () => void;
}

export default function Sidebar({ profile, onClose, isOpen, onSignOut }: SidebarProps) {
  const pathname = usePathname();
  const role = profile?.role ?? 'collaborateur';

  const visibleItems = NAV_ITEMS.filter((item) =>
    (item.roles as readonly string[]).includes(role)
  );

  return (
    <>
      {/* Overlay mobile */}
      {isOpen !== undefined && (
        <div
          className={cn(
            'lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity duration-300',
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 flex flex-col w-64',
          'bg-dark-900 border-r border-dark-600',
          'transition-transform duration-300 ease-in-out lg:translate-x-0',
          isOpen === false ? '-translate-x-full' : 'translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-dark-600">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neon-blue/20 border border-neon-blue/30 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-4 h-4 text-neon-blue" />
            </div>
            <div>
              <span className="font-bold text-sm leading-none block">
                <span className="gradient-text">CEO</span>
                <span className="text-white font-light">ZEN</span>
              </span>
              <span className="text-[10px] text-slate-500 leading-none">by SenseLab</span>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  item.href === '/super-admin'
                    ? active
                      ? 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/30'
                      : 'text-yellow-500/70 hover:text-yellow-400 hover:bg-yellow-400/10 border border-yellow-400/10'
                    : active
                      ? 'bg-neon-blue/15 text-neon-blue border border-neon-blue/20 shadow-[0_0_12px_#00d4ff18]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-dark-700'
                )}
              >
                <item.icon
                  className={cn(
                    'w-4.5 h-4.5 flex-shrink-0',
                    active ? 'text-neon-blue' : 'text-slate-500 group-hover:text-slate-300'
                  )}
                  size={18}
                />
                <span className="flex-1">{item.label}</span>
                {active && (
                  <ChevronRight className="w-3.5 h-3.5 text-neon-blue/60" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Profil + déconnexion */}
        <div className="px-3 pb-4 pt-2 border-t border-dark-600 space-y-2">
          {profile && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-dark-700">
              <div className="w-8 h-8 rounded-full bg-neon-violet/20 border border-neon-violet/30 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-neon-violet">
                  {profile.full_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {profile.full_name}
                </p>
                <span className={cn(
                  'text-[10px] font-semibold uppercase tracking-wide',
                  profile.role === 'super_admin' ? 'text-yellow-400' :
                  profile.role === 'admin' ? 'text-neon-blue' : 'text-neon-violet'
                )}>
                  {profile.role === 'super_admin' ? '⚡ Super Admin' : profile.role}
                </span>
              </div>
              <div className="dot-online flex-shrink-0" />
            </div>
          )}
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>
    </>
  );
}
