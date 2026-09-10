-- ============================================================
-- 007 — Durcissement sécurité (audit du 2026-09-10)
-- ============================================================
-- Corrige :
--  - SÉC-C1 : la policy "profiles_update_own" n'avait pas de clause
--    WITH CHECK. Sans elle, Postgres réutilise USING pour valider la ligne
--    après écriture, qui ne vérifie que `id = auth.uid()` (toujours vrai
--    après update) — n'importe quel utilisateur pouvait donc changer sa
--    propre colonne `role` (ex: collaborateur -> admin -> super_admin) et
--    ouvrir de là l'accès à /api/super-admin/sql (SÉC-C2, corrigé à part
--    dans le code de la route).
--  - DB-C1  : l'enum user_role ne contenait pas 'super_admin' dans les
--    migrations versionnées alors que le code applicatif en dépend
--    partout. Si cette valeur a déjà été ajoutée manuellement en prod,
--    `IF NOT EXISTS` rend cette ligne inoffensive.
--
-- NB : `ALTER TYPE ... ADD VALUE` ne peut pas toujours être utilisé dans la
-- même transaction qu'une requête qui référence la nouvelle valeur, selon
-- la version de Postgres. Si l'exécution de ce fichier échoue avec
-- "unsafe use of new value of enum type", exécuter d'abord la ligne
-- ALTER TYPE seule, valider, puis rejouer le reste du fichier.

-- 1. Étendre l'enum de rôle.
alter type public.user_role add value if not exists 'super_admin';

-- 2. Helper : admin OU super_admin (super_admin doit hériter de tous les
--    droits admin au niveau RLS, comme il en hérite déjà côté application).
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select public.current_user_role() in ('admin', 'super_admin');
$$;

-- 3. profiles_update_own : ajout de WITH CHECK — un utilisateur non-admin
--    peut modifier son propre profil, mais jamais son `role` ni son
--    `is_active`. La sous-requête lit la valeur du profil telle qu'elle
--    était avant cette instruction (snapshot de la commande), donc compare
--    bien la nouvelle valeur écrite à l'ancienne.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update
  using (id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      id = auth.uid()
      and role = (select p.role from public.profiles p where p.id = auth.uid())
      and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
    )
  );

-- 4. Le reste des policies "admin" étendues à super_admin, pour que le
--    rôle super_admin (déjà traité comme superset d'admin côté application)
--    le soit aussi côté RLS.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
  for insert with check (public.is_admin());

drop policy if exists "products_write_admin" on public.products;
create policy "products_write_admin" on public.products
  for all using (public.is_admin());

drop policy if exists "categories_write_admin" on public.product_categories;
create policy "categories_write_admin" on public.product_categories
  for all using (public.is_admin());

drop policy if exists "stock_write_admin" on public.stock_movements;
create policy "stock_write_admin" on public.stock_movements
  for update using (public.is_admin());

drop policy if exists "stock_delete_admin" on public.stock_movements;
create policy "stock_delete_admin" on public.stock_movements
  for delete using (public.is_admin());

drop policy if exists "sales_update_admin" on public.sales;
create policy "sales_update_admin" on public.sales
  for update using (public.is_admin());

drop policy if exists "expenses_write_admin" on public.expenses;
create policy "expenses_write_admin" on public.expenses
  for all using (public.is_admin());

drop policy if exists "expense_cat_write_admin" on public.expense_categories;
create policy "expense_cat_write_admin" on public.expense_categories
  for all using (public.is_admin());
