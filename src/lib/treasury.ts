// ============================================================
// CEOZEN — Calcul mutualisé du solde de trésorerie
// ============================================================
// Avant ce module, le calcul du solde d'un compte (ventes + trocs +
// règlements de créances − dépenses − avoirs − retraits, filtré par
// account.payment_keys et par période) était réimplémenté indépendamment
// 4 fois : DashboardClient.tsx (carte "Disponibilités", export "Rapport du
// jour", export "Point financier") et tresorerie/page.tsx — avec des
// variables renommées à chaque fois, et sans qu'aucune des 4 versions ne
// compte les règlements de dettes_initiales (bug corrigé ici, voir
// TreasurySettlement.kind === 'out').
//
// Principe : un seul aller-retour Supabase pour toutes les tables brutes
// (fetchTreasuryRawData), puis des fonctions de calcul pures paramétrées
// par une période (computeAccountBalance / computePointFinancierRow) que
// chaque écran appelle avec la période qui l'intéresse.

import type { SupabaseClient } from '@supabase/supabase-js';
import { REAPPRO_CATEGORY } from '@/types';
import type {
  TreasuryAccount,
  TreasuryRawData,
  TreasuryPeriod,
  TreasurySettlement,
} from '@/types/treasury';

// ---------- Fetch brut ----------

/**
 * Récupère toutes les lignes brutes nécessaires au calcul de trésorerie
 * (tables complètes, non filtrées par période — comme le faisait déjà
 * chaque call site historique). Le filtrage par période se fait en mémoire
 * dans computeAccountBuckets, pour permettre plusieurs vues (solde courant,
 * solde du jour, solde sur une période choisie) à partir du même fetch.
 */
export async function fetchTreasuryRawData(
  supabase: SupabaseClient
): Promise<{ accounts: TreasuryAccount[]; data: TreasuryRawData }> {
  const [
    { data: accs },
    { data: sales },
    { data: expenses },
    { data: trocs },
    { data: avoirs },
    { data: apports },
    { data: retraits },
    { data: settledSales },
    { data: settledTrocs },
    { data: settledCreancesInitiales },
    { data: settledDettesInitiales },
  ] = await Promise.all([
    supabase.from('treasury_accounts').select('id,name,type,payment_keys,initial_balance').order('type'),
    supabase.from('sales').select('total, payment_method, created_at').neq('payment_method', 'credit'),
    supabase.from('expenses').select('amount, payment_method, expense_date, category:expense_categories(name)'),
    supabase.from('trocs').select('complement, payment_method, created_at'),
    supabase.from('sale_avoirs').select('total, created_at, sale:sales(payment_method)'),
    supabase.from('treasury_apports').select('account_id, amount, date'),
    supabase.from('treasury_retraits').select('account_id, amount, date'),
    supabase.from('sales').select('settled_amount, settled_account_id, settled_at').not('settled_account_id', 'is', null),
    supabase.from('trocs').select('settled_amount, settled_account_id, settled_at').not('settled_account_id', 'is', null),
    supabase.from('creances_initiales').select('settled_amount, settled_account_id, settled_at').not('settled_account_id', 'is', null),
    supabase.from('dettes_initiales').select('settled_amount, settled_account_id, settled_at').not('settled_account_id', 'is', null),
  ]);

  const expensesNorm = (expenses ?? []).map((e: Record<string, unknown>) => {
    const cat = Array.isArray(e.category) ? e.category[0] : (e.category as Record<string, unknown> | null);
    return {
      amount: (e.amount as number) ?? 0,
      payment_method: e.payment_method as string,
      expense_date: e.expense_date as string,
      category_name: (cat?.name as string | undefined) ?? null,
    };
  });

  const avoirsNorm = (avoirs ?? []).map((av: Record<string, unknown>) => {
    const sale = Array.isArray(av.sale) ? av.sale[0] : (av.sale as Record<string, unknown> | null);
    return {
      total: (av.total as number) ?? 0,
      created_at: av.created_at as string,
      payment_method: (sale?.payment_method as string | undefined) ?? null,
    };
  });

  const settlements: TreasurySettlement[] = [
    ...(settledSales ?? []).map((r) => ({ ...r, kind: 'in' as const })),
    ...(settledTrocs ?? []).map((r) => ({ ...r, kind: 'in' as const })),
    ...(settledCreancesInitiales ?? []).map((r) => ({ ...r, kind: 'in' as const })),
    // Les dettes_initiales soldées étaient auparavant absentes des 4
    // calculs de trésorerie existants — un remboursement de dette est un
    // décaissement, jamais compté nulle part avant ce correctif.
    ...(settledDettesInitiales ?? []).map((r) => ({ ...r, kind: 'out' as const })),
  ];

  return {
    accounts: (accs ?? []) as TreasuryAccount[],
    data: {
      sales: (sales ?? []) as TreasuryRawData['sales'],
      expenses: expensesNorm,
      trocs: (trocs ?? []) as TreasuryRawData['trocs'],
      avoirs: avoirsNorm,
      apports: (apports ?? []) as TreasuryRawData['apports'],
      retraits: (retraits ?? []) as TreasuryRawData['retraits'],
      settlements,
    },
  };
}

// ---------- Calcul pur ----------

/**
 * Les colonnes `date` SQL (expense_date, dates d'apport/retrait) n'ont pas
 * d'heure — les traiter comme minuit UTC les décale d'une heure par
 * rapport à des bornes de période en heure locale (bug MÉT-6, corrigé le
 * 2026-09-10/11). On les interprète systématiquement comme minuit local.
 */
function localDateToISO(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toISOString();
}

export interface AccountFlowBuckets {
  beforeIn: number;
  beforeOut: number;
  salesIn: number;
  trocsIn: number;
  trocsOut: number;
  expensesReapproOut: number;
  expensesAutresOut: number;
  avoirsOut: number;
  apportsIn: number;
  retraitsOut: number;
  reglementsIn: number;
  reglementsOut: number;
}

/**
 * Pour UN compte, répartit chaque ligne brute en "avant la période" (pour
 * le solde de début) ou "pendant la période" (pour les entrées/sorties),
 * par catégorie. Fonction pure, aucun accès réseau.
 */
export function computeAccountBuckets(
  account: TreasuryAccount,
  data: TreasuryRawData,
  period: TreasuryPeriod
): AccountFlowBuckets {
  const keys = account.payment_keys;
  const { from, to } = period;
  const inRange = (dt: string) => (!from || dt >= from) && dt <= to;
  const beforeRange = (dt: string) => !from || dt < from;

  let beforeIn = 0, beforeOut = 0;
  let salesIn = 0, trocsIn = 0, trocsOut = 0;
  let expensesReapproOut = 0, expensesAutresOut = 0, avoirsOut = 0;
  let apportsIn = 0, retraitsOut = 0, reglementsIn = 0, reglementsOut = 0;

  for (const s of data.sales) {
    if (!keys.includes(s.payment_method)) continue;
    const dt = s.created_at;
    if (inRange(dt)) salesIn += s.total ?? 0;
    else if (beforeRange(dt)) beforeIn += s.total ?? 0;
  }

  for (const e of data.expenses) {
    if (!keys.includes(e.payment_method)) continue;
    const dt = localDateToISO(e.expense_date);
    const amt = e.amount ?? 0;
    if (inRange(dt)) {
      if (e.category_name === REAPPRO_CATEGORY) expensesReapproOut += amt;
      else expensesAutresOut += amt;
    } else if (beforeRange(dt)) {
      beforeOut += amt;
    }
  }

  for (const av of data.avoirs) {
    if (!av.payment_method || !keys.includes(av.payment_method)) continue;
    const dt = av.created_at;
    if (inRange(dt)) avoirsOut += av.total ?? 0;
    else if (beforeRange(dt)) beforeOut += av.total ?? 0;
  }

  // Trocs (complément) — positif = encaissement, négatif = le magasin rend
  // de l'argent au client.
  for (const t of data.trocs) {
    if (!keys.includes(t.payment_method)) continue;
    const dt = t.created_at;
    const c = t.complement ?? 0;
    if (c >= 0) {
      if (inRange(dt)) trocsIn += c; else if (beforeRange(dt)) beforeIn += c;
    } else {
      const abs = Math.abs(c);
      if (inRange(dt)) trocsOut += abs; else if (beforeRange(dt)) beforeOut += abs;
    }
  }

  // Règlements de créances/dettes soldées (compte renseigné à la saisie).
  for (const r of data.settlements) {
    if (r.settled_account_id !== account.id || !r.settled_at) continue;
    const dt = r.settled_at;
    const amt = r.settled_amount ?? 0;
    if (r.kind === 'in') {
      if (inRange(dt)) reglementsIn += amt; else if (beforeRange(dt)) beforeIn += amt;
    } else {
      if (inRange(dt)) reglementsOut += amt; else if (beforeRange(dt)) beforeOut += amt;
    }
  }

  for (const ap of data.apports) {
    if (ap.account_id !== account.id) continue;
    const dt = localDateToISO(ap.date);
    if (inRange(dt)) apportsIn += ap.amount ?? 0;
    else if (beforeRange(dt)) beforeIn += ap.amount ?? 0;
  }

  for (const rt of data.retraits) {
    if (rt.account_id !== account.id) continue;
    const dt = localDateToISO(rt.date);
    if (inRange(dt)) retraitsOut += rt.amount ?? 0;
    else if (beforeRange(dt)) beforeOut += rt.amount ?? 0;
  }

  return {
    beforeIn, beforeOut,
    salesIn, trocsIn, trocsOut,
    expensesReapproOut, expensesAutresOut, avoirsOut,
    apportsIn, retraitsOut, reglementsIn, reglementsOut,
  };
}

export interface AccountBalance {
  soldeDebut: number;
  soldeFin: number;
  entrees: number;
  sorties: number;
  apports: number;
  retraits: number;
}

/**
 * Vue "solde" générique — couvre la carte Disponibilités du dashboard, le
 * rapport journalier et la page Trésorerie.
 */
export function computeAccountBalance(
  account: TreasuryAccount,
  data: TreasuryRawData,
  period: TreasuryPeriod
): AccountBalance {
  const b = computeAccountBuckets(account, data, period);
  const soldeDebut = account.initial_balance + b.beforeIn - b.beforeOut;
  const entrees = b.salesIn + b.trocsIn + b.apportsIn + b.reglementsIn;
  const sorties = b.trocsOut + b.expensesReapproOut + b.expensesAutresOut + b.avoirsOut + b.retraitsOut + b.reglementsOut;
  const soldeFin = soldeDebut + entrees - sorties;
  return { soldeDebut, soldeFin, entrees, sorties, apports: b.apportsIn, retraits: b.retraitsOut };
}

/** Ligne du tableau de réconciliation du rapport journalier (PDF). */
export interface TreasuryDailyRow {
  name: string;
  soldeDebut: number;
  entrees: number;
  sorties: number;
  soldeFin: number;
}

export function computeTreasuryDailyRow(
  account: TreasuryAccount,
  data: TreasuryRawData,
  period: TreasuryPeriod
): TreasuryDailyRow {
  const { soldeDebut, soldeFin, entrees, sorties } = computeAccountBalance(account, data, period);
  return { name: account.name, soldeDebut, entrees, sorties, soldeFin };
}

/** Ligne détaillée du Point financier (PDF) — un compte par ligne. */
export interface PointFinancierRow {
  name: string;
  soldeInitial: number;
  encaissementVentes: number;
  complementTrocs: number;
  apportsDG: number;
  reglementsClients: number;
  decaissementsAchats: number;
  decaissementsTrocs: number;
  retraitDG: number;
  autresDepenses: number;
  soldeFinal: number;
}

export function computePointFinancierRow(
  account: TreasuryAccount,
  data: TreasuryRawData,
  period: TreasuryPeriod
): PointFinancierRow {
  const b = computeAccountBuckets(account, data, period);
  const soldeInitial = account.initial_balance + b.beforeIn - b.beforeOut;
  const totalEntrees = b.salesIn + b.trocsIn + b.apportsIn + b.reglementsIn;
  // Les règlements de dettes soldées (décaissement) n'ont pas de colonne
  // dédiée dans le PDF existant — regroupés avec "autres dépenses" plutôt
  // que d'ajouter une colonne (mise en page du PDF non modifiée ici).
  const autresDepenses = b.expensesAutresOut + b.reglementsOut;
  const totalSorties = b.expensesReapproOut + b.trocsOut + b.retraitsOut + autresDepenses;
  const soldeFinal = soldeInitial + totalEntrees - totalSorties;
  return {
    name: account.name,
    soldeInitial,
    encaissementVentes: b.salesIn,
    complementTrocs: b.trocsIn,
    apportsDG: b.apportsIn,
    reglementsClients: b.reglementsIn,
    decaissementsAchats: b.expensesReapproOut,
    decaissementsTrocs: b.trocsOut,
    retraitDG: b.retraitsOut,
    autresDepenses,
    soldeFinal,
  };
}
