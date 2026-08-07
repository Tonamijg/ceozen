-- ============================================================
-- Migration 006 — Point financier (règlements tracés + retraits DG)
-- À exécuter dans Supabase SQL Editor
--
-- Note : comme treasury_accounts / treasury_apports (voir sessions
-- précédentes), ces tables existent en prod mais ne sont pas
-- toutes versionnées ici. Les ALTER TABLE ci-dessous sont idempotents
-- (IF NOT EXISTS) et supposent que sales/trocs/expenses/
-- creances_initiales/dettes_initiales/treasury_accounts existent déjà.
-- ============================================================

-- ─── 1. Traçabilité des règlements (compte + montant + date) ─────
-- Sans ça, impossible de savoir combien est rentré aujourd'hui sur
-- quel compte quand une créance/dette est soldée.

ALTER TABLE public.sales   ADD COLUMN IF NOT EXISTS settled_at         timestamptz;
ALTER TABLE public.sales   ADD COLUMN IF NOT EXISTS settled_amount     numeric(15,2);
ALTER TABLE public.sales   ADD COLUMN IF NOT EXISTS settled_account_id uuid REFERENCES public.treasury_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.trocs   ADD COLUMN IF NOT EXISTS settled_at         timestamptz;
ALTER TABLE public.trocs   ADD COLUMN IF NOT EXISTS settled_amount     numeric(15,2);
ALTER TABLE public.trocs   ADD COLUMN IF NOT EXISTS settled_account_id uuid REFERENCES public.treasury_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS settled_at         timestamptz;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS settled_amount     numeric(15,2);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS settled_account_id uuid REFERENCES public.treasury_accounts(id) ON DELETE SET NULL;

-- creances_initiales / dettes_initiales ont déjà settled_at (migration 004) —
-- il ne manque que le compte et le montant réellement encaissé.
ALTER TABLE public.creances_initiales ADD COLUMN IF NOT EXISTS settled_amount     numeric(15,2);
ALTER TABLE public.creances_initiales ADD COLUMN IF NOT EXISTS settled_account_id uuid REFERENCES public.treasury_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.dettes_initiales   ADD COLUMN IF NOT EXISTS settled_amount     numeric(15,2);
ALTER TABLE public.dettes_initiales   ADD COLUMN IF NOT EXISTS settled_account_id uuid REFERENCES public.treasury_accounts(id) ON DELETE SET NULL;

-- ─── 2. Retraits DG (symétrique de treasury_apports) ──────────────
CREATE TABLE IF NOT EXISTS public.treasury_retraits (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  uuid NOT NULL REFERENCES public.treasury_accounts(id) ON DELETE CASCADE,
  amount      numeric(15,2) NOT NULL CHECK (amount > 0),
  date        date NOT NULL DEFAULT CURRENT_DATE,
  note        text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treasury_retraits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "treasury_retraits_select"
  ON public.treasury_retraits FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "treasury_retraits_insert"
  ON public.treasury_retraits FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_treasury_retraits_account ON public.treasury_retraits(account_id);
CREATE INDEX IF NOT EXISTS idx_treasury_retraits_date    ON public.treasury_retraits(date);

-- ─── 3. Index sur les nouvelles colonnes de règlement ─────────────
CREATE INDEX IF NOT EXISTS idx_sales_settled_at    ON public.sales(settled_at);
CREATE INDEX IF NOT EXISTS idx_trocs_settled_at    ON public.trocs(settled_at);
CREATE INDEX IF NOT EXISTS idx_expenses_settled_at ON public.expenses(settled_at);
