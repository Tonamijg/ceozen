-- ============================================================
-- 010 — Vente atomique avec contrôle de stock (audit du 2026-09-10, MÉT-5)
-- ============================================================
-- Avant : le contrôle "stock suffisant ?" se faisait côté client sur une
-- valeur chargée en mémoire à l'ouverture du formulaire, jamais revérifiée
-- juste avant l'insertion, et l'insertion de la vente + de ses lignes se
-- faisait en deux appels Supabase séparés. Deux ventes concurrentes sur un
-- article à stock=1 pouvaient toutes les deux passer le contrôle et faire
-- passer le stock à -1 (empêché depuis par le CHECK stock_qty >= 0 de
-- 008_data_integrity.sql, mais de façon brutale : la vente était déjà
-- créée, échec en pleine écriture des articles avec un message Postgres
-- brut).
--
-- Cette fonction fait tout en une seule transaction, avec un verrou ligne
-- (FOR UPDATE) sur chaque produit concerné pendant la vérification : une
-- deuxième vente concurrente sur le même produit attend que la première
-- ait fini (commit ou rollback) avant de vérifier son propre stock, ce qui
-- rend le contrôle réellement atomique. Le message d'erreur reste clair et
-- catchable côté client (le nom du produit et les quantités y figurent).
CREATE OR REPLACE FUNCTION public.create_sale_with_items(
  p_payment_method  public.payment_method,
  p_client_id       uuid,
  p_client_name     text,
  p_notes           text,
  p_credit_due_date date,
  p_is_settled      boolean,
  p_sale_date       date,
  p_acompte         numeric,
  p_items           jsonb  -- [{product_id, qty, unit_price, discount}, ...]
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_id uuid;
  v_item    jsonb;
  v_stock   int;
  v_name    text;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Aucun article dans la vente.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT stock_qty, name INTO v_stock, v_name
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Produit introuvable (%).', v_item->>'product_id';
    END IF;
    IF v_stock < (v_item->>'qty')::int THEN
      RAISE EXCEPTION 'Stock insuffisant pour "%" — % disponible(s), % demandé(s).',
        v_name, v_stock, (v_item->>'qty')::int;
    END IF;
  END LOOP;

  INSERT INTO public.sales (
    seller_id, payment_method, client_id, client_name, notes,
    credit_due_date, is_settled, sale_date, acompte
  ) VALUES (
    auth.uid(), p_payment_method, p_client_id, p_client_name, p_notes,
    p_credit_due_date, p_is_settled, p_sale_date, p_acompte
  ) RETURNING id INTO v_sale_id;

  -- Déclenche after_sale_item_insert (mouvement de stock + recalcul du
  -- total de la vente) pour chaque ligne, comme avant.
  INSERT INTO public.sale_items (sale_id, product_id, qty, unit_price, discount)
  SELECT v_sale_id, (i->>'product_id')::uuid, (i->>'qty')::int,
         (i->>'unit_price')::numeric, (i->>'discount')::numeric
  FROM jsonb_array_elements(p_items) i;

  RETURN v_sale_id;
END;
$$;

-- SECURITY INVOKER (par défaut) : la fonction s'exécute avec les droits de
-- l'utilisateur appelant, donc soumise aux mêmes policies RLS
-- (sales_insert, sale_items_insert, products_select_auth) qu'un insert
-- direct — pas de contournement de permissions.
GRANT EXECUTE ON FUNCTION public.create_sale_with_items TO authenticated;
