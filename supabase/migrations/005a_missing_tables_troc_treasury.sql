-- ============================================================
-- 005a — Reconstruction des tables non versionnées (audit du 2026-09-10)
-- ============================================================
-- DB-C3 : trocs, treasury_accounts, treasury_apports, dettes_initiales et
-- suppliers existent en production mais n'ont jamais été créées par une
-- migration versionnée (elles ont été créées à la main dans le SQL Editor
-- Supabase). Ce fichier reconstruit leur définition à partir :
--  - du journal de développement (CEOZEN_JOURNAL_COMPLET.md, section
--    "Migration 003") pour `trocs` et la vue v_creances,
--  - des interfaces TypeScript et des requêtes Supabase réellement
--    utilisées par l'application pour treasury_accounts/treasury_apports/
--    dettes_initiales/suppliers (aucune autre source disponible pour elles).
--
-- ⚠️ IMPORTANT — à vérifier avant d'exécuter sur le projet Supabase réel :
-- tout est écrit en CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS,
-- donc sans effet si la table/colonne existe déjà avec le même nom. Mais
-- cette reconstruction n'a pas pu être comparée au schéma réel de
-- production (aucun accès direct à la base CEOZEN depuis cette session) :
-- avant d'appliquer ce fichier, comparer avec un export réel du schéma
-- (`supabase db pull` ou Dashboard → Database → Schema) pour s'assurer
-- qu'aucun nom/type ne diverge.
--
-- Placé avant 006_point_financier.sql (qui suppose déjà l'existence de ces
-- tables) pour qu'une base neuve puisse rejouer toutes les migrations dans
-- l'ordre sans erreur.

-- ─── 1. trocs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trocs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  troc_number            text UNIQUE NOT NULL,
  client_name            text,
  client_phone           text,
  product_given_id       uuid REFERENCES public.products(id),
  product_given_name     text NOT NULL,
  product_given_price    numeric(12,2) NOT NULL DEFAULT 0,
  product_received_id    uuid REFERENCES public.products(id),
  product_received_name  text NOT NULL,
  product_received_ref   text,
  product_received_value numeric(12,2) NOT NULL DEFAULT 0,
  complement             numeric(12,2) NOT NULL DEFAULT 0,
  payment_method         public.payment_method NOT NULL DEFAULT 'especes',
  is_settled             boolean NOT NULL DEFAULT true,
  credit_due_date        date,
  notes                  text,
  created_by             uuid REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Colonnes ajoutées après la création initiale de la table (troc_date,
-- acompte) — si `trocs` existe déjà en prod sans elles, DB-C3.
ALTER TABLE public.trocs ADD COLUMN IF NOT EXISTS troc_date date;
ALTER TABLE public.trocs ADD COLUMN IF NOT EXISTS acompte   numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.trocs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "trocs_select_auth" ON public.trocs
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "trocs_insert_auth" ON public.trocs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Historiquement ouvert à tout authentifié (l'écran Créances permet à
  -- n'importe quel collaborateur de solder un troc à crédit) — les routes
  -- /api/troc/create et /api/troc/update passent de toute façon par la clé
  -- de service et ne dépendent pas de cette policy.
  CREATE POLICY "trocs_update_auth" ON public.trocs
    FOR UPDATE USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "trocs_delete_admin" ON public.trocs
    FOR DELETE USING (public.current_user_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_trocs_created_at ON public.trocs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trocs_client     ON public.trocs(client_name);

-- ─── 2. treasury_accounts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.treasury_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  type            text NOT NULL CHECK (type IN ('especes', 'banque', 'mobile_money')),
  payment_keys    text[] NOT NULL DEFAULT '{}',
  initial_balance numeric(15,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treasury_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "treasury_accounts_select_auth" ON public.treasury_accounts
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "treasury_accounts_write_admin" ON public.treasury_accounts
    FOR ALL USING (public.current_user_role() = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. treasury_apports (symétrique de treasury_retraits, migration 006) ─
CREATE TABLE IF NOT EXISTS public.treasury_apports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.treasury_accounts(id) ON DELETE CASCADE,
  amount      numeric(15,2) NOT NULL CHECK (amount > 0),
  date        date NOT NULL DEFAULT CURRENT_DATE,
  note        text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treasury_apports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "treasury_apports_select" ON public.treasury_apports
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "treasury_apports_insert" ON public.treasury_apports
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_treasury_apports_account ON public.treasury_apports(account_id);
CREATE INDEX IF NOT EXISTS idx_treasury_apports_date    ON public.treasury_apports(date);

-- ─── 4. suppliers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  phone      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "suppliers_select_auth" ON public.suppliers
    FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "suppliers_insert_auth" ON public.suppliers
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. dettes_initiales (miroir de creances_initiales, migration 004) ────
CREATE TABLE IF NOT EXISTS public.dettes_initiales (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name text NOT NULL,
  amount        numeric(15,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
  since_date    date NOT NULL,
  description   text,
  is_settled    boolean NOT NULL DEFAULT false,
  settled_at    timestamptz,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dettes_initiales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "dettes_initiales_select" ON public.dettes_initiales
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "dettes_initiales_insert" ON public.dettes_initiales
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Policy volontairement large ici (comme creances_initiales_update en
  -- 004) — resserrée par 008_data_integrity.sql (DB-E4) une fois
  -- public.is_admin() disponible (migration 007).
  CREATE POLICY "dettes_initiales_update" ON public.dettes_initiales
    FOR UPDATE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_dettes_initiales_supplier ON public.dettes_initiales(supplier_name);
CREATE INDEX IF NOT EXISTS idx_dettes_initiales_settled  ON public.dettes_initiales(is_settled);

-- ─── 6. sales.acompte (utilisé depuis le commit fcf8c2d, jamais migré) ────
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS acompte numeric(15,2) NOT NULL DEFAULT 0;
