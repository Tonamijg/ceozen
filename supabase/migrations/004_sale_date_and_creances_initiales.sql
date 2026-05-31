-- ============================================================
-- Migration 004 — sale_date + creances_initiales
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- ─── 1. Ajouter sale_date à la table sales ───────────────────
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_date date;

-- Remplir les ventes existantes avec la date de created_at
UPDATE public.sales
SET sale_date = created_at::date
WHERE sale_date IS NULL;

-- Rendre la colonne non-nullable après remplissage
ALTER TABLE public.sales ALTER COLUMN sale_date SET DEFAULT CURRENT_DATE;

-- ─── 2. Mettre à jour la vue v_sales pour inclure sale_date ──
-- (Adapter selon votre définition actuelle de v_sales)
-- Si la vue n'a pas de SECURITY DEFINER, recréez-la simplement :
CREATE OR REPLACE VIEW public.v_sales AS
SELECT
  s.id,
  s.sale_number,
  s.seller_id,
  s.client_id,
  s.client_name,
  s.payment_method,
  s.subtotal,
  s.discount,
  s.total,
  s.notes,
  s.credit_due_date,
  s.is_settled,
  s.sale_date,
  s.created_at,
  p.full_name AS seller_name,
  COUNT(si.id)::int AS item_count
FROM public.sales s
LEFT JOIN public.profiles p ON p.id = s.seller_id
LEFT JOIN public.sale_items si ON si.sale_id = s.id
GROUP BY s.id, p.full_name;

-- ─── 3. Créer la table creances_initiales ────────────────────
CREATE TABLE IF NOT EXISTS public.creances_initiales (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  client_id   uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  amount      numeric(15,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
  since_date  date NOT NULL,
  description text,
  is_settled  boolean NOT NULL DEFAULT false,
  settled_at  timestamptz,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. RLS sur creances_initiales ───────────────────────────
ALTER TABLE public.creances_initiales ENABLE ROW LEVEL SECURITY;

-- Lecture : tous les utilisateurs authentifiés
CREATE POLICY "creances_initiales_select"
  ON public.creances_initiales FOR SELECT
  USING (auth.role() = 'authenticated');

-- Insertion : tous les utilisateurs authentifiés
CREATE POLICY "creances_initiales_insert"
  ON public.creances_initiales FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Mise à jour (solde) : tous les utilisateurs authentifiés
CREATE POLICY "creances_initiales_update"
  ON public.creances_initiales FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ─── 5. Index pour les performances ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_creances_initiales_client ON public.creances_initiales(client_name);
CREATE INDEX IF NOT EXISTS idx_creances_initiales_settled ON public.creances_initiales(is_settled);
