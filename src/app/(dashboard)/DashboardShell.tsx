'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { createClient } from '@/lib/supabase/client';
import type { Profile, VStockAlert } from '@/types';
import { usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard':     { title: 'Tableau de bord',  subtitle: 'Vue générale en temps réel' },
  '/ventes':        { title: 'Ventes',            subtitle: 'Saisie et historique des ventes' },
  '/depenses':      { title: 'Dépenses',          subtitle: 'Suivi des dépenses opérationnelles' },
  '/stock':         { title: 'Stock & Catalogue', subtitle: 'Catalogue produits et mouvements de stock' },
  '/rapports':      { title: 'Rapports',          subtitle: 'Analyses, statistiques et exports' },
  '/creances':      { title: 'Créances & Dettes',  subtitle: 'Suivi des paiements en crédit' },
  '/utilisateurs':  { title: 'Utilisateurs',      subtitle: 'Gestion des accès et des rôles' },
  '/profil':        { title: 'Mon profil',        subtitle: 'Paramètres de ton compte' },
  '/trocs':         { title: 'Trocs',             subtitle: 'Échanges de téléphones avec complément' },
};

interface DashboardShellProps {
  profile: Profile | null;
  children: React.ReactNode;
}

export default function DashboardShell({ profile, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertCount,  setAlertCount]  = useState(0);
  const [stockAlerts, setStockAlerts] = useState<VStockAlert[]>([]);
  const router   = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  // Titre de la page courante
  const pageKey = Object.keys(PAGE_TITLES).find((k) =>
    pathname === k || pathname.startsWith(k + '/')
  ) ?? '/dashboard';
  const { title, subtitle } = PAGE_TITLES[pageKey];

  // Récupère les alertes stock
  useEffect(() => {
    supabase
      .from('v_stock_alerts')
      .select('*')
      .eq('is_low_stock', true)
      .order('stock_qty', { ascending: true })
      .limit(20)
      .then(({ data }) => {
        setStockAlerts((data as VStockAlert[]) ?? []);
        setAlertCount(data?.length ?? 0);
      });
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-dark-950">
      {/* Sidebar */}
      <Sidebar
        profile={profile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSignOut={handleSignOut}
      />

      {/* Contenu principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          title={title}
          subtitle={subtitle}
          onMenuClick={() => setSidebarOpen(true)}
          alertCount={alertCount}
          stockAlerts={stockAlerts}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
