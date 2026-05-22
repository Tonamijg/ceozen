// ============================================================
// CEOZEN — Types TypeScript centralisés v2
// ============================================================

export type UserRole          = 'admin' | 'collaborateur';
export type StockMovementType = 'entree' | 'sortie' | 'ajustement';
export type PaymentMethod     = 'especes' | 'mobile_money' | 'carte' | 'virement' | 'credit';

// ---------- Profil ----------
export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------- Client ----------
export interface Client {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ---------- Catégorie produit ----------
export interface ProductCategory {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

// ---------- Produit ----------
export interface Product {
  id: string;
  reference: string;
  name: string;
  category_id?: string;
  category?: ProductCategory;
  buy_price: number;
  sell_price: number;
  stock_qty: number;
  stock_min: number;
  unit: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------- Mouvement de stock ----------
export interface StockMovement {
  id: string;
  product_id: string;
  product?: Product;
  type: StockMovementType;
  qty: number;
  unit_cost?: number;
  reference_id?: string;
  reference_type?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

// ---------- Vente ----------
export interface Sale {
  id: string;
  sale_number: string;
  seller_id: string;
  seller?: Profile;
  client_id?: string;
  client_name?: string;
  payment_method: PaymentMethod;
  subtotal: number;
  discount: number;
  total: number;
  notes?: string;
  credit_due_date?: string;
  is_settled: boolean;
  created_at: string;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product?: Product;
  qty: number;
  unit_price: number;
  discount: number;
  total: number;
  created_at: string;
}

// ---------- Avoir (annulation vente) ----------
export interface SaleAvoir {
  id: string;
  avoir_number: string;
  sale_id: string;
  reason: string;
  total: number;
  created_by?: string;
  created_at: string;
}

// ---------- Dépense ----------
export interface ExpenseCategory {
  id: string;
  name: string;
  color: string;
}

export interface Expense {
  id: string;
  category_id?: string;
  category?: ExpenseCategory;
  amount: number;
  description: string;
  expense_date: string;
  supplier_name?: string;
  payment_method: PaymentMethod;
  credit_due_date?: string;
  is_settled: boolean;
  created_by?: string;
  creator?: Profile;
  created_at: string;
  items?: ExpenseItem[];
}

export interface ExpenseItem {
  id: string;
  expense_id: string;
  product_id: string;
  product?: Product;
  qty: number;
  unit_cost: number;
  created_at: string;
}

// ---------- Vues enrichies ----------
export interface VSale {
  id: string;
  sale_number: string;
  payment_method: PaymentMethod;
  subtotal: number;
  discount: number;
  total: number;
  created_at: string;
  notes?: string;
  client_id?: string;
  client_name?: string;
  seller_id: string;
  seller_name: string;
  item_count: number;
  credit_due_date?: string;
  is_settled: boolean;
}

export interface VStockAlert {
  id: string;
  reference: string;
  name: string;
  stock_qty: number;
  stock_min: number;
  category: string;
  sell_price: number;
  buy_price: number;
  stock_value: number;
  is_low_stock: boolean;
}

export interface VCreance {
  id: string;
  type: 'vente' | 'troc';
  reference_number: string;
  amount: number;
  created_at: string;
  client_name?: string;
  credit_due_date?: string;
  is_settled: boolean;
  creator_name: string;
  is_overdue: boolean;
}

// ---------- Troc ----------
export interface Troc {
  id: string;
  troc_number: string;
  client_name?: string;
  client_phone?: string;
  product_given_id?: string;
  product_given_name: string;
  product_given_price: number;
  product_received_id?: string;
  product_received_name: string;
  product_received_ref?: string;
  product_received_value: number;
  complement: number;
  payment_method: PaymentMethod;
  is_settled: boolean;
  credit_due_date?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface VDette {
  id: string;
  amount: number;
  description: string;
  expense_date: string;
  supplier_name?: string;
  credit_due_date?: string;
  is_settled: boolean;
  category_name?: string;
  category_color?: string;
  creator_name?: string;
  is_overdue: boolean;
}

// ---------- Stats tableau de bord ----------
export interface DashboardStats {
  revenue_today: number;
  sales_count_today: number;
  revenue_month: number;
  expenses_month: number;
  stock_value: number;
  low_stock_count: number;
}

export interface PeriodStats {
  revenue: number;
  sales_count: number;
  expenses: number;
  margin: number;
}

// ---------- Helpers ----------
export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  especes:      'Espèces',
  mobile_money: 'Mobile Money',
  carte:        'Carte',
  virement:     'Virement',
  credit:       'Crédit',
};

export const PAYMENT_BADGE_CLASS: Record<PaymentMethod, string> = {
  especes:      'badge-green',
  mobile_money: 'badge-blue',
  carte:        'badge-violet',
  virement:     'badge-orange',
  credit:       'badge-red',
};

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  entree:     'Entrée',
  sortie:     'Sortie',
  ajustement: 'Ajustement',
};

export const REAPPRO_CATEGORY = 'Réapprovisionnement';
