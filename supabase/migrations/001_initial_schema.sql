-- ============================================================
-- K-Tech Daily — Schéma initial Supabase / PostgreSQL
-- ============================================================

-- Extensions utiles
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILS UTILISATEURS (extension de auth.users)
-- ============================================================
create type public.user_role as enum ('admin', 'collaborateur');

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null default '',
  role          public.user_role not null default 'collaborateur',
  phone         text,
  avatar_url    text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Trigger : crée automatiquement un profil à la création d'un user auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'collaborateur')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger : met à jour updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- 2. CATÉGORIES DE PRODUITS
-- ============================================================
create table public.product_categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

insert into public.product_categories (name, description) values
  ('Téléphones',        'Smartphones et téléphones classiques'),
  ('Accessoires Mobile','Coques, chargeurs, câbles, écouteurs'),
  ('Tablettes',         'Tablettes et iPads'),
  ('Informatique',      'PC, laptops, périphériques'),
  ('Réseau',            'Routeurs, switchs, câbles réseau'),
  ('Autres',            'Autres produits tech');

-- ============================================================
-- 3. PRODUITS (catalogue)
-- ============================================================
create table public.products (
  id              uuid primary key default uuid_generate_v4(),
  reference       text not null unique,
  name            text not null,
  category_id     uuid references public.product_categories(id) on delete set null,
  buy_price       numeric(12,2) not null default 0 check (buy_price >= 0),
  sell_price      numeric(12,2) not null default 0 check (sell_price >= 0),
  stock_qty       integer not null default 0,
  stock_min       integer not null default 5,   -- seuil d'alerte
  unit            text not null default 'unité',
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger products_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

-- Quelques produits de démonstration
insert into public.products (reference, name, category_id, buy_price, sell_price, stock_qty, stock_min)
select
  'TEL-001', 'Samsung Galaxy A55', id, 185000, 220000, 12, 3
from public.product_categories where name = 'Téléphones';

insert into public.products (reference, name, category_id, buy_price, sell_price, stock_qty, stock_min)
select
  'TEL-002', 'iPhone 15 128Go', id, 580000, 650000, 4, 2
from public.product_categories where name = 'Téléphones';

insert into public.products (reference, name, category_id, buy_price, sell_price, stock_qty, stock_min)
select
  'ACC-001', 'Chargeur USB-C 65W', id, 8000, 15000, 25, 10
from public.product_categories where name = 'Accessoires Mobile';

insert into public.products (reference, name, category_id, buy_price, sell_price, stock_qty, stock_min)
select
  'ACC-002', 'Écouteurs Bluetooth TWS', id, 12000, 22000, 3, 5
from public.product_categories where name = 'Accessoires Mobile';

insert into public.products (reference, name, category_id, buy_price, sell_price, stock_qty, stock_min)
select
  'INF-001', 'Routeur WiFi TP-Link 4G', id, 45000, 65000, 7, 3
from public.product_categories where name = 'Réseau';

-- ============================================================
-- 4. MOUVEMENTS DE STOCK
-- ============================================================
create type public.stock_movement_type as enum ('entree', 'sortie', 'ajustement');

create table public.stock_movements (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid not null references public.products(id) on delete cascade,
  type          public.stock_movement_type not null,
  qty           integer not null,   -- positif pour entrée, négatif pour sortie
  unit_cost     numeric(12,2),      -- prix unitaire d'achat (pour les entrées)
  reference_id  uuid,               -- lié à une vente ou commande
  reference_type text,              -- 'sale', 'purchase', 'adjustment'
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Trigger : met à jour le stock_qty du produit après un mouvement
create or replace function public.update_product_stock()
returns trigger language plpgsql as $$
begin
  update public.products
  set stock_qty = stock_qty + new.qty,
      updated_at = now()
  where id = new.product_id;
  return new;
end;
$$;

create trigger after_stock_movement
  after insert on public.stock_movements
  for each row execute procedure public.update_product_stock();

-- ============================================================
-- 5. VENTES
-- ============================================================
create type public.payment_method as enum ('especes', 'mobile_money', 'carte', 'virement');

create table public.sales (
  id              uuid primary key default uuid_generate_v4(),
  sale_number     text not null unique,
  seller_id       uuid not null references public.profiles(id) on delete restrict,
  payment_method  public.payment_method not null default 'especes',
  subtotal        numeric(12,2) not null default 0,
  discount        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now()
);

-- Numéro de vente auto
create or replace function public.generate_sale_number()
returns trigger language plpgsql as $$
declare
  seq integer;
begin
  select count(*) + 1 into seq from public.sales
  where date_trunc('month', created_at) = date_trunc('month', now());
  new.sale_number := 'VTE-' || to_char(now(), 'YYYYMM') || '-' || lpad(seq::text, 4, '0');
  return new;
end;
$$;

create trigger before_sale_insert
  before insert on public.sales
  for each row execute procedure public.generate_sale_number();

-- Lignes de vente
create table public.sale_items (
  id          uuid primary key default uuid_generate_v4(),
  sale_id     uuid not null references public.sales(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  qty         integer not null check (qty > 0),
  unit_price  numeric(12,2) not null,
  discount    numeric(12,2) not null default 0,
  total       numeric(12,2) generated always as (qty * unit_price - discount) stored,
  created_at  timestamptz not null default now()
);

-- Trigger : après ajout d'un item, crée un mouvement de stock sortie et met à jour le total vente
create or replace function public.after_sale_item_insert()
returns trigger language plpgsql as $$
begin
  -- Mouvement de stock (sortie)
  insert into public.stock_movements (product_id, type, qty, reference_id, reference_type)
  values (new.product_id, 'sortie', -new.qty, new.sale_id, 'sale');

  -- Recalcul du total de la vente
  update public.sales
  set subtotal = (select coalesce(sum(qty * unit_price), 0) from public.sale_items where sale_id = new.sale_id),
      discount = (select coalesce(sum(discount), 0)         from public.sale_items where sale_id = new.sale_id),
      total    = (select coalesce(sum(total), 0)            from public.sale_items where sale_id = new.sale_id)
  where id = new.sale_id;

  return new;
end;
$$;

create trigger after_sale_item_insert
  after insert on public.sale_items
  for each row execute procedure public.after_sale_item_insert();

-- ============================================================
-- 6. DÉPENSES
-- ============================================================
create table public.expense_categories (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  color      text not null default '#6366f1'
);

insert into public.expense_categories (name, color) values
  ('Loyer',          '#f59e0b'),
  ('Transport',      '#3b82f6'),
  ('Fournitures',    '#10b981'),
  ('Salaires',       '#8b5cf6'),
  ('Électricité',    '#ef4444'),
  ('Communication',  '#06b6d4'),
  ('Marketing',      '#ec4899'),
  ('Autre',          '#6b7280');

create table public.expenses (
  id           uuid primary key default uuid_generate_v4(),
  category_id  uuid references public.expense_categories(id) on delete set null,
  amount       numeric(12,2) not null check (amount > 0),
  description  text,
  expense_date date not null default current_date,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Activer RLS sur toutes les tables sensibles
alter table public.profiles         enable row level security;
alter table public.products         enable row level security;
alter table public.product_categories enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.sales            enable row level security;
alter table public.sale_items       enable row level security;
alter table public.expenses         enable row level security;
alter table public.expense_categories enable row level security;

-- Helper : rôle de l'utilisateur connecté
create or replace function public.current_user_role()
returns public.user_role language sql security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- PROFILES : chacun voit son profil, l'admin voit tous
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.current_user_role() = 'admin');
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid() or public.current_user_role() = 'admin');
create policy "profiles_insert_admin" on public.profiles
  for insert with check (public.current_user_role() = 'admin');

-- PRODUCTS : lecture pour tous les authentifiés, écriture admin seulement
create policy "products_select_auth" on public.products
  for select using (auth.uid() is not null);
create policy "products_write_admin" on public.products
  for all using (public.current_user_role() = 'admin');

-- PRODUCT CATEGORIES : lecture pour tous
create policy "categories_select_auth" on public.product_categories
  for select using (auth.uid() is not null);
create policy "categories_write_admin" on public.product_categories
  for all using (public.current_user_role() = 'admin');

-- STOCK MOVEMENTS : lecture admin, écriture tous
create policy "stock_select_admin" on public.stock_movements
  for select using (auth.uid() is not null);
create policy "stock_insert_auth" on public.stock_movements
  for insert with check (auth.uid() is not null);
create policy "stock_write_admin" on public.stock_movements
  for update using (public.current_user_role() = 'admin');
create policy "stock_delete_admin" on public.stock_movements
  for delete using (public.current_user_role() = 'admin');

-- SALES : chacun voit ses ventes, admin voit tout
create policy "sales_select" on public.sales
  for select using (seller_id = auth.uid() or public.current_user_role() = 'admin');
create policy "sales_insert" on public.sales
  for insert with check (auth.uid() is not null);
create policy "sales_update_admin" on public.sales
  for update using (public.current_user_role() = 'admin');

-- SALE ITEMS
create policy "sale_items_select" on public.sale_items
  for select using (auth.uid() is not null);
create policy "sale_items_insert" on public.sale_items
  for insert with check (auth.uid() is not null);

-- EXPENSES
create policy "expenses_select" on public.expenses
  for select using (auth.uid() is not null);
create policy "expenses_insert" on public.expenses
  for insert with check (auth.uid() is not null);
create policy "expenses_write_admin" on public.expenses
  for all using (public.current_user_role() = 'admin');

create policy "expense_cat_select" on public.expense_categories
  for select using (auth.uid() is not null);
create policy "expense_cat_write_admin" on public.expense_categories
  for all using (public.current_user_role() = 'admin');

-- ============================================================
-- 8. VUES UTILITAIRES
-- ============================================================

-- Vue : ventes enrichies
create view public.v_sales as
select
  s.id, s.sale_number, s.payment_method, s.subtotal, s.discount, s.total,
  s.created_at, s.notes,
  p.id as seller_id, p.full_name as seller_name,
  (select count(*) from public.sale_items si where si.sale_id = s.id) as item_count
from public.sales s
join public.profiles p on p.id = s.seller_id;

-- Vue : stock avec alertes
create view public.v_stock_alerts as
select
  p.id, p.reference, p.name, p.stock_qty, p.stock_min,
  c.name as category,
  p.sell_price, p.buy_price,
  (p.stock_qty * p.buy_price) as stock_value,
  case when p.stock_qty <= p.stock_min then true else false end as is_low_stock
from public.products p
left join public.product_categories c on c.id = p.category_id
where p.is_active = true
order by is_low_stock desc, p.name;

-- Vue : CA du jour
create view public.v_today_stats as
select
  coalesce(sum(total), 0)        as revenue_today,
  count(*)                        as sales_count_today,
  coalesce(avg(total), 0)         as avg_sale_today
from public.sales
where date_trunc('day', created_at at time zone 'Africa/Abidjan') =
      date_trunc('day', now() at time zone 'Africa/Abidjan');

-- ============================================================
-- 9. REALTIME (activer les tables pour le broadcast)
-- ============================================================
-- À exécuter dans le Dashboard Supabase → Database → Replication
-- ou décommenter si l'extension replication est activée :
-- alter publication supabase_realtime add table public.sales;
-- alter publication supabase_realtime add table public.stock_movements;
-- alter publication supabase_realtime add table public.expenses;
