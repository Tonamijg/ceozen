-- ============================================================
-- MIGRATION 003 — Fix triggers : SECURITY DEFINER
-- Problème : les triggers SECURITY INVOKER ne peuvent pas
-- UPDATE sales.total ni products.stock_qty à cause de la RLS
-- admin-only. En passant SECURITY DEFINER, les fonctions
-- s'exécutent en tant que owner (postgres) → bypass RLS.
-- ============================================================

-- 1. Trigger stock : update_product_stock
CREATE OR REPLACE FUNCTION public.update_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.products
  SET stock_qty  = stock_qty + new.qty,
      updated_at = now()
  WHERE id = new.product_id;
  RETURN new;
END;
$$;

-- 2. Trigger vente : after_sale_item_insert
CREATE OR REPLACE FUNCTION public.after_sale_item_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Mouvement de stock (sortie)
  INSERT INTO public.stock_movements (product_id, type, qty, reference_id, reference_type)
  VALUES (new.product_id, 'sortie', -new.qty, new.sale_id, 'sale');

  -- Recalcul du total de la vente
  UPDATE public.sales
  SET subtotal = (SELECT COALESCE(SUM(qty * unit_price), 0) FROM public.sale_items WHERE sale_id = new.sale_id),
      discount = (SELECT COALESCE(SUM(discount), 0)         FROM public.sale_items WHERE sale_id = new.sale_id),
      total    = (SELECT COALESCE(SUM(total), 0)            FROM public.sale_items WHERE sale_id = new.sale_id)
  WHERE id = new.sale_id;

  RETURN new;
END;
$$;

-- 3. Réparer les totaux existants à 0 (au cas où)
UPDATE public.sales s
SET subtotal = sub.subtotal,
    discount = sub.discount,
    total    = sub.total_val
FROM (
  SELECT sale_id,
    COALESCE(SUM(qty * unit_price), 0) AS subtotal,
    COALESCE(SUM(discount), 0)         AS discount,
    COALESCE(SUM(total), 0)            AS total_val
  FROM public.sale_items
  GROUP BY sale_id
) sub
WHERE s.id = sub.sale_id AND s.total = 0;
