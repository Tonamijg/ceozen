-- ============================================================
-- 008 — Contraintes d'intégrité, RLS, vues et trigger avoir
-- (audit du 2026-09-10)
-- ============================================================
-- Dépend de public.is_admin() (migration 007) et des tables créées par
-- 005a_missing_tables_troc_treasury.sql — doit s'exécuter après les deux.

-- ─── DB-C4 : upserts clients/suppliers en échec silencieux ────────────────
-- supabase.from('clients'|'suppliers').upsert({name}, {onConflict:'name'})
-- exige un index unique réel sur `name`, absent des migrations versionnées.
DO $$ BEGIN
  ALTER TABLE public.clients ADD CONSTRAINT clients_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

-- ─── DB-E2 : total de ligne de vente négatif possible ─────────────────────
DO $$ BEGIN
  ALTER TABLE public.sale_items ADD CONSTRAINT chk_sale_items_unit_price CHECK (unit_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.sale_items ADD CONSTRAINT chk_sale_items_discount
    CHECK (discount >= 0 AND discount <= qty * unit_price);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── DB-E3 : stock négatif possible ────────────────────────────────────────
-- NB : si des lignes existantes ont déjà stock_qty < 0, cette contrainte
-- échouera à l'ajout — corriger ces lignes avant de rejouer cette migration.
DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT chk_products_stock_qty_non_negative CHECK (stock_qty >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── DB-F2 : stock_min négatif possible ────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT chk_products_stock_min_non_negative CHECK (stock_min >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── DB-M1 : cohérence signe/type des mouvements de stock ─────────────────
DO $$ BEGIN
  ALTER TABLE public.stock_movements ADD CONSTRAINT chk_stock_movements_qty_sign
    CHECK (
      (type = 'sortie'     AND qty <= 0) OR
      (type = 'entree'     AND qty >= 0) OR
      (type = 'ajustement')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── DB-E4 : RLS trop permissive sur creances_initiales / dettes_initiales ─
-- Avant : n'importe quel authentifié pouvait modifier n'importe quel champ
-- (montant, description...), pas seulement solder. Après : un non-admin ne
-- peut toucher que les colonnes de règlement (is_settled/settled_*) ; un
-- admin garde le droit d'édition complète (écran Super Admin).
DROP POLICY IF EXISTS "creances_initiales_update" ON public.creances_initiales;

CREATE POLICY "creances_initiales_update_admin" ON public.creances_initiales
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "creances_initiales_settle_own" ON public.creances_initiales
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (
    auth.role() = 'authenticated'
    AND client_name = (SELECT ci.client_name FROM public.creances_initiales ci WHERE ci.id = id)
    AND amount       = (SELECT ci.amount       FROM public.creances_initiales ci WHERE ci.id = id)
    AND since_date    = (SELECT ci.since_date    FROM public.creances_initiales ci WHERE ci.id = id)
    AND description IS NOT DISTINCT FROM (SELECT ci.description FROM public.creances_initiales ci WHERE ci.id = id)
  );

DROP POLICY IF EXISTS "dettes_initiales_update" ON public.dettes_initiales;

CREATE POLICY "dettes_initiales_update_admin" ON public.dettes_initiales
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "dettes_initiales_settle_own" ON public.dettes_initiales
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (
    auth.role() = 'authenticated'
    AND supplier_name = (SELECT di.supplier_name FROM public.dettes_initiales di WHERE di.id = id)
    AND amount         = (SELECT di.amount         FROM public.dettes_initiales di WHERE di.id = id)
    AND since_date      = (SELECT di.since_date      FROM public.dettes_initiales di WHERE di.id = id)
    AND description IS NOT DISTINCT FROM (SELECT di.description FROM public.dettes_initiales di WHERE di.id = id)
  );

-- ─── DB-E5 : pas de trigger de réintégration de stock sur un avoir ────────
-- Le code applicatif (src/app/(dashboard)/ventes/page.tsx, handleAvoir) ne
-- fait plus l'insertion de stock_movements lui-même depuis ce correctif —
-- c'est désormais ce trigger, dans la même transaction que l'avoir, qui
-- s'en charge (source unique de vérité, plus de risque d'incohérence si la
-- connexion coupe entre les deux appels).
CREATE OR REPLACE FUNCTION public.restore_stock_on_avoir()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.stock_movements (product_id, type, qty, reference_id, reference_type, notes, created_by)
  SELECT si.product_id, 'entree', si.qty, new.sale_id, 'avoir',
         'Avoir ' || new.avoir_number, new.created_by
  FROM public.sale_items si
  WHERE si.sale_id = new.sale_id;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS after_avoir_insert_restore_stock ON public.sale_avoirs;
CREATE TRIGGER after_avoir_insert_restore_stock
  AFTER INSERT ON public.sale_avoirs
  FOR EACH ROW EXECUTE PROCEDURE public.restore_stock_on_avoir();

-- ─── DB-C2 / DB-M3 : v_creances et v_sales obsolètes (pas d'union trocs,
-- pas de colonne acompte) ───────────────────────────────────────────────
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
  s.acompte,
  s.created_at,
  p.full_name AS seller_name,
  COUNT(si.id)::int AS item_count
FROM public.sales s
LEFT JOIN public.profiles p ON p.id = s.seller_id
LEFT JOIN public.sale_items si ON si.sale_id = s.id
GROUP BY s.id, p.full_name;

DROP VIEW IF EXISTS public.v_creances CASCADE;
CREATE VIEW public.v_creances AS
  SELECT
    s.id,
    'vente'::text              AS type,
    s.sale_number              AS reference_number,
    s.client_name,
    s.total                    AS amount,
    s.acompte,
    s.credit_due_date,
    s.is_settled,
    s.created_at,
    p.full_name                AS creator_name,
    CASE
      WHEN s.credit_due_date::timestamptz < now()
       AND NOT s.is_settled THEN true ELSE false
    END                        AS is_overdue
  FROM public.sales s
  LEFT JOIN public.profiles p ON p.id = s.seller_id
  WHERE s.payment_method = 'credit'

  UNION ALL

  SELECT
    t.id,
    'troc'::text               AS type,
    t.troc_number              AS reference_number,
    t.client_name,
    t.complement               AS amount,
    t.acompte,
    t.credit_due_date,
    t.is_settled,
    t.created_at,
    p.full_name                AS creator_name,
    CASE
      WHEN t.credit_due_date::timestamptz < now()
       AND NOT t.is_settled THEN true ELSE false
    END                        AS is_overdue
  FROM public.trocs t
  LEFT JOIN public.profiles p ON p.id = t.created_by
  WHERE t.payment_method = 'credit';

-- ─── MÉT-7 : génération du numéro de troc non atomique ────────────────────
-- Avant : le client lisait le dernier troc_number puis l'incrémentait —
-- deux créations concurrentes pouvaient lire le même "dernier" numéro et
-- produire une référence dupliquée. Une séquence Postgres (nextval) est
-- atomique par construction, quelle que soit la concurrence.
CREATE SEQUENCE IF NOT EXISTS public.trocs_number_seq;

-- Aligner la séquence sur le plus grand numéro déjà utilisé (TR-XXX), pour
-- ne pas reproduire une référence existante lors du premier appel.
SELECT setval(
  'public.trocs_number_seq',
  GREATEST(
    COALESCE((
      SELECT max(substring(troc_number FROM 'TR-(\d+)')::int)
      FROM public.trocs
      WHERE troc_number ~ '^TR-\d+$'
    ), 0),
    1
  ),
  true
);

CREATE OR REPLACE FUNCTION public.next_troc_number()
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT 'TR-' || lpad(nextval('public.trocs_number_seq')::text, 3, '0');
$$;

-- ─── DB-M5 : trocs.payment_method en texte libre plutôt que l'enum ────────
-- Déjà correct pour les environnements où `trocs` est créée par
-- 005a_missing_tables_troc_treasury.sql (colonne typée public.payment_method
-- dès la création). Si la table existe déjà en prod avec payment_method en
-- `text`, la conversion ne peut pas être automatisée ici sans risquer un
-- échec sur une valeur invalide déjà en base — vérifier manuellement puis,
-- si tout est propre, exécuter :
--   ALTER TABLE public.trocs
--     ALTER COLUMN payment_method TYPE public.payment_method
--     USING payment_method::public.payment_method;
