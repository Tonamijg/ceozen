-- ============================================================
-- CEOZEN — Reset données de démonstration
-- ⚠️  Exécuter dans Supabase SQL Editor
-- Supprime TOUTES les données transactionnelles.
-- Conserve : produits, profils utilisateurs, paramètres.
-- ============================================================

-- 1. Avoirs (dépend de sales)
DELETE FROM public.sale_avoirs;

-- 2. Lignes de vente (dépend de sales)
DELETE FROM public.sale_items;

-- 3. Ventes
DELETE FROM public.sales;

-- 4. Trocs
DELETE FROM public.trocs;

-- 5. Dépenses
DELETE FROM public.expenses;

-- 6. Mouvements de stock (remet les compteurs à zéro proprement)
DELETE FROM public.stock_movements;

-- 7. Remettre le stock de tous les produits à 0
UPDATE public.products SET stock_qty = 0;

-- ============================================================
-- Vérification après reset
-- ============================================================
SELECT 'sales'           AS table_name, COUNT(*) AS lignes FROM public.sales
UNION ALL
SELECT 'sale_items',      COUNT(*) FROM public.sale_items
UNION ALL
SELECT 'sale_avoirs',     COUNT(*) FROM public.sale_avoirs
UNION ALL
SELECT 'trocs',           COUNT(*) FROM public.trocs
UNION ALL
SELECT 'expenses',        COUNT(*) FROM public.expenses
UNION ALL
SELECT 'stock_movements', COUNT(*) FROM public.stock_movements
UNION ALL
SELECT 'products (conservés)', COUNT(*) FROM public.products
UNION ALL
SELECT 'profiles (conservés)', COUNT(*) FROM public.profiles;
