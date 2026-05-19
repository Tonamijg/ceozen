-- ============================================================
-- K-Tech Daily — Migration 002 : Évolutions métier
-- ============================================================

-- ============================================================
-- 1. AJOUT DU MODE CRÉDIT (ventes + dépenses)
-- ============================================================
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'credit';

-- ============================================================
-- 2. TABLE CLIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  phone       text,
  email       text,
  address     text,
  notes       text,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select_auth" ON public.clients
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "clients_insert_auth" ON public.clients
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "clients_update_auth" ON public.clients
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "clients_delete_admin" ON public.clients
  FOR DELETE USING (public.current_user_role() = 'admin');

-- ============================================================
-- 3. ÉVOLUTION TABLE SALES (client + crédit)
-- ============================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS client_id        uuid references public.clients(id) on delete set null,
  ADD COLUMN IF NOT EXISTS client_name      text,
  ADD COLUMN IF NOT EXISTS credit_due_date  date,
  ADD COLUMN IF NOT EXISTS is_settled       boolean not null default true;

-- ============================================================
-- 4. ÉVOLUTION TABLE EXPENSES (fournisseur + paiement + crédit)
-- ============================================================
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier_name    text,
  ADD COLUMN IF NOT EXISTS payment_method   public.payment_method not null default 'especes',
  ADD COLUMN IF NOT EXISTS credit_due_date  date,
  ADD COLUMN IF NOT EXISTS is_settled       boolean not null default true;

-- ============================================================
-- 5. TABLE LIGNES DE RÉAPPROVISIONNEMENT
--    (rattachées à une dépense de catégorie Réapprovisionnement)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expense_items (
  id          uuid primary key default uuid_generate_v4(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  qty         integer not null check (qty > 0),
  unit_cost   numeric(12,2) not null check (unit_cost >= 0),
  created_at  timestamptz not null default now()
);

ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_items_select_auth" ON public.expense_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "expense_items_insert_auth" ON public.expense_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "expense_items_admin" ON public.expense_items
  FOR ALL USING (public.current_user_role() = 'admin');

-- Trigger : quand on insère une ligne de réappro → mouvement stock entrée auto
CREATE OR REPLACE FUNCTION public.after_expense_item_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.stock_movements (
    product_id, type, qty, unit_cost, reference_id, reference_type
  ) VALUES (
    new.product_id, 'entree', new.qty, new.unit_cost, new.expense_id, 'reapprovisionnement'
  );
  RETURN new;
END;
$$;

CREATE TRIGGER after_expense_item_insert
  AFTER INSERT ON public.expense_items
  FOR EACH ROW EXECUTE PROCEDURE public.after_expense_item_insert();

-- ============================================================
-- 6. CATÉGORIE RÉAPPROVISIONNEMENT
-- ============================================================
INSERT INTO public.expense_categories (name, color)
VALUES ('Réapprovisionnement', '#6366f1')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 7. TABLE AVOIRS (annulations de ventes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sale_avoirs (
  id           uuid primary key default uuid_generate_v4(),
  avoir_number text not null unique,
  sale_id      uuid not null references public.sales(id) on delete restrict,
  reason       text not null,
  total        numeric(12,2) not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Numéro d'avoir automatique
CREATE OR REPLACE FUNCTION public.generate_avoir_number()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE seq integer;
BEGIN
  SELECT count(*) + 1 INTO seq FROM public.sale_avoirs
  WHERE date_trunc('month', created_at) = date_trunc('month', now());
  new.avoir_number := 'AVO-' || to_char(now(), 'YYYYMM') || '-' || lpad(seq::text, 4, '0');
  RETURN new;
END;
$$;

CREATE TRIGGER before_avoir_insert
  BEFORE INSERT ON public.sale_avoirs
  FOR EACH ROW EXECUTE PROCEDURE public.generate_avoir_number();

ALTER TABLE public.sale_avoirs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avoirs_select_auth" ON public.sale_avoirs
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "avoirs_insert_auth" ON public.sale_avoirs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "avoirs_admin" ON public.sale_avoirs
  FOR ALL USING (public.current_user_role() = 'admin');

-- ============================================================
-- 8. MISE À JOUR DES VUES
-- ============================================================

-- Vue ventes enrichie (avec client + crédit)
CREATE OR REPLACE VIEW public.v_sales AS
SELECT
  s.id, s.sale_number, s.payment_method, s.subtotal, s.discount, s.total,
  s.created_at, s.notes,
  s.client_id, s.client_name,
  s.credit_due_date, s.is_settled,
  p.id   AS seller_id,
  p.full_name AS seller_name,
  (SELECT count(*) FROM public.sale_items si WHERE si.sale_id = s.id) AS item_count
FROM public.sales s
JOIN public.profiles p ON p.id = s.seller_id;

-- Vue créances (ventes à crédit non soldées)
CREATE OR REPLACE VIEW public.v_creances AS
SELECT
  s.id, s.sale_number, s.total, s.created_at,
  s.client_name,
  s.credit_due_date,
  s.is_settled,
  p.full_name AS seller_name,
  CASE WHEN s.credit_due_date < current_date AND NOT s.is_settled
       THEN true ELSE false END AS is_overdue
FROM public.sales s
JOIN public.profiles p ON p.id = s.seller_id
WHERE s.payment_method = 'credit';

-- Vue dettes (dépenses à crédit non soldées)
CREATE OR REPLACE VIEW public.v_dettes AS
SELECT
  e.id, e.amount, e.description, e.expense_date,
  e.supplier_name, e.credit_due_date, e.is_settled,
  ec.name  AS category_name,
  ec.color AS category_color,
  pr.full_name AS creator_name,
  CASE WHEN e.credit_due_date < current_date AND NOT e.is_settled
       THEN true ELSE false END AS is_overdue
FROM public.expenses e
LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
LEFT JOIN public.profiles pr ON pr.id = e.created_by
WHERE e.payment_method = 'credit';

-- ============================================================
-- 9. REALTIME — activer les tables principales
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
