-- ============================================================
-- 009 — Index de performance manquants (audit du 2026-09-10, DB-M2)
-- ============================================================
-- Ces colonnes sont filtrées à chaque chargement des pages Créances,
-- Trésorerie et Rapports sans index dédié — sans impact fonctionnel, mais
-- coûteux (scan complet des tables sales/expenses) à mesure que le volume
-- de données grossit.

-- Filtres combinés utilisés par v_creances / v_dettes / la page Trésorerie
-- (payment_method = 'credit' ou payment_method IN (...), croisé avec
-- is_settled).
CREATE INDEX IF NOT EXISTS idx_sales_payment_settled    ON public.sales(payment_method, is_settled);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_settled ON public.expenses(payment_method, is_settled);

-- FK posée en 002_evolutions.sql mais jamais indexée.
CREATE INDEX IF NOT EXISTS idx_sales_client_id ON public.sales(client_id);

-- Colonnes de rapprochement ajoutées par 006_point_financier.sql, utilisées
-- par la page Trésorerie pour retrouver les règlements d'un compte donné.
CREATE INDEX IF NOT EXISTS idx_sales_settled_account_id              ON public.sales(settled_account_id);
CREATE INDEX IF NOT EXISTS idx_trocs_settled_account_id              ON public.trocs(settled_account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_settled_account_id           ON public.expenses(settled_account_id);
CREATE INDEX IF NOT EXISTS idx_creances_initiales_settled_account_id ON public.creances_initiales(settled_account_id);
CREATE INDEX IF NOT EXISTS idx_dettes_initiales_settled_account_id   ON public.dettes_initiales(settled_account_id);

-- FK expense_items.product_id, jamais indexée.
CREATE INDEX IF NOT EXISTS idx_expense_items_product_id ON public.expense_items(product_id);

-- trocs.payment_method, filtré comme sales.payment_method dans le calcul de
-- trésorerie et v_creances.
CREATE INDEX IF NOT EXISTS idx_trocs_payment_settled ON public.trocs(payment_method, is_settled);
