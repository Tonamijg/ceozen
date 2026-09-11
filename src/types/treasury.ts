// ============================================================
// CEOZEN — Types du domaine Trésorerie
// ============================================================
// Centralise ce qui était redéfini indépendamment dans chaque page
// (tresorerie/page.tsx, creances/page.tsx, DashboardClient.tsx) — voir
// src/lib/treasury.ts pour les fonctions qui les consomment.

export type TreasuryAccountType = 'especes' | 'banque' | 'mobile_money';

export interface TreasuryAccount {
  id: string;
  name: string;
  type: TreasuryAccountType;
  payment_keys: string[];
  initial_balance: number;
}

export interface TreasuryApport {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
  account?: { name: string };
}

export interface TreasuryRetrait {
  id: string;
  account_id: string;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
  account?: { name: string };
}

// ---------- Données brutes (une seule requête large, filtrée en mémoire) ----------

export interface TreasuryRawSale {
  total: number;
  payment_method: string;
  created_at: string;
}

export interface TreasuryRawExpense {
  amount: number;
  payment_method: string;
  expense_date: string;
  category_name: string | null;
}

export interface TreasuryRawTroc {
  complement: number;
  payment_method: string;
  created_at: string;
}

export interface TreasuryRawAvoir {
  total: number;
  created_at: string;
  payment_method: string | null;
}

export interface TreasuryRawApport {
  account_id: string;
  amount: number;
  date: string;
}

export interface TreasuryRawRetrait {
  account_id: string;
  amount: number;
  date: string;
}

/**
 * Règlement tracé d'une créance/dette (compte + montant renseignés à la
 * saisie). `kind` distingue un encaissement (créance client soldée) d'un
 * décaissement (dette fournisseur soldée) — les dettes_initiales soldées
 * n'étaient auparavant comptées nulle part (bug corrigé le 2026-09-11).
 */
export interface TreasurySettlement {
  settled_account_id: string | null;
  settled_amount: number | null;
  settled_at: string | null;
  kind: 'in' | 'out';
}

export interface TreasuryRawData {
  sales: TreasuryRawSale[];
  expenses: TreasuryRawExpense[];
  trocs: TreasuryRawTroc[];
  avoirs: TreasuryRawAvoir[];
  apports: TreasuryRawApport[];
  retraits: TreasuryRawRetrait[];
  settlements: TreasurySettlement[];
}

/** from=null signifie "depuis toujours". Les deux bornes sont des ISO 8601. */
export interface TreasuryPeriod {
  from: string | null;
  to: string;
}
