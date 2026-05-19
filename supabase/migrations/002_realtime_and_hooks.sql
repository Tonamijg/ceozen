-- ============================================================
-- K-Tech Daily — Realtime + Hooks WhatsApp (migration 002)
-- ============================================================

-- Activer Realtime sur les tables principales
-- (à exécuter après avoir activé la réplication dans le Dashboard Supabase)
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.stock_movements;
alter publication supabase_realtime add table public.expenses;

-- ============================================================
-- Hook WhatsApp (optionnel — à activer quand Twilio/CallMeBot configuré)
-- ============================================================
-- Nécessite l'extension pg_net pour les requêtes HTTP depuis PostgreSQL
-- create extension if not exists pg_net;

-- Exemple : notifier par webhook à chaque nouvelle vente
-- create or replace function public.notify_whatsapp_sale()
-- returns trigger language plpgsql security definer as $$
-- begin
--   perform net.http_post(
--     url     := 'https://api.callmebot.com/whatsapp.php?phone=XXXX&apikey=XXXX&text=' ||
--                urlencode('Nouvelle vente K-Tech: ' || new.sale_number || ' - ' || new.total || ' FCFA'),
--     headers := '{"Content-Type": "application/json"}'::jsonb
--   );
--   return new;
-- end;
-- $$;

-- create trigger after_sale_notify_whatsapp
--   after insert on public.sales
--   for each row execute procedure public.notify_whatsapp_sale();

-- ============================================================
-- Index pour les performances
-- ============================================================
create index if not exists idx_sales_created_at    on public.sales(created_at desc);
create index if not exists idx_sales_seller_id     on public.sales(seller_id);
create index if not exists idx_sale_items_sale_id  on public.sale_items(sale_id);
create index if not exists idx_sale_items_product  on public.sale_items(product_id);
create index if not exists idx_expenses_date       on public.expenses(expense_date desc);
create index if not exists idx_stock_product_id    on public.stock_movements(product_id);
create index if not exists idx_stock_created_at    on public.stock_movements(created_at desc);
