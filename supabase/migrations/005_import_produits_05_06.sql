-- ============================================================
-- Migration 005 — Import produits ST05-06 (accessoires)
-- Stock initialisé à 0 — sera mis à jour via réappro
-- ============================================================

INSERT INTO public.products (reference, name, buy_price, sell_price, stock_qty, stock_min, category_id, is_active)
SELECT
  ref, name, buy_price, sell_price, 0, 1,
  (SELECT id FROM public.product_categories WHERE name = 'Accessoires Mobile'),
  true
FROM (VALUES
  ('PR05/06-001', 'ST05-06 Pochette 17 Pro Max',                  4000,  10000),
  ('PR05/06-002', 'ST05-06 Pochette 17 Pro',                      4000,  10000),
  ('PR05/06-003', 'ST05-06 Pochette 17',                          4000,  10000),
  ('PR05/06-004', 'ST05-06 Pochette 16 Pro Max',                  4000,  10000),
  ('PR05/06-005', 'ST05-06 Pochette 16 Plus',                     4000,  10000),
  ('PR05/06-006', 'ST05-06 Pochette 16 Pro',                      4000,  10000),
  ('PR05/06-007', 'ST05-06 Pochette 16',                          4000,  10000),
  ('PR05/06-008', 'ST05-06 Pochette 15 Pro Max',                  4000,  10000),
  ('PR05/06-009', 'ST05-06 Pochette 15 Pro',                      4000,  10000),
  ('PR05/06-010', 'ST05-06 Pochette 15',                          4000,  10000),
  ('PR05/06-011', 'ST05-06 Pochette 14 Pro Max',                  4000,  10000),
  ('PR05/06-012', 'ST05-06 Pochette 14 Pro',                      4000,  10000),
  ('PR05/06-013', 'ST05-06 Pochette 13 Pro',                      4000,  10000),
  ('PR05/06-014', 'ST05-06 Pochette 13',                          4000,  10000),
  ('PR05/06-015', 'ST05-06 Pochette 13 Pro Max',                  4000,  10000),
  ('PR05/06-016', 'ST05-06 Pochette S22 Ultra',                   5000,  10000),
  ('PR05/06-017', 'ST05-06 Pochette S23 Ultra',                   5000,  10000),
  ('PR05/06-018', 'ST05-06 Pochette S24 Ultra',                   5000,  10000),
  ('PR05/06-019', 'ST05-06 Pochette S25 Ultra',                   5000,  10000),
  ('PR05/06-020', 'ST05-06 Pochette S26 Ultra',                   5000,  10000),
  ('PR05/06-021', 'ST05-06 Pochette ZFold 6',                     7000,  10000),
  ('PR05/06-022', 'ST05-06 Pochette ZFold 7',                     7000,  10000),
  ('PR05/06-023', 'ST05-06 Pochette A16',                         7000,  10000),
  ('PR05/06-024', 'ST05-06 Cordes iPhones',                          0,      0),
  ('PR05/06-025', 'ST05-06 AirPods Pro 3',                        8000,  15000),
  ('PR05/06-026', 'ST05-06 Travel Adapteur 25W Chargeur USB-C',   4000,   8000),
  ('PR05/06-027', 'ST05-06 Travel Adapteur 45W Chargeur USB-C',   4000,   8000),
  ('PR05/06-028', 'ST05-06 Chargeur Google Pixel 2 bouts',        4000,   8000),
  ('PR05/06-029', 'ST05-06 Chargeur Google Pixel 3 bouts',        4000,   8000),
  ('PR05/06-030', 'ST05-06 Pencil Pro',                          11000,  30000),
  ('PR05/06-031', 'ST05-06 Pencil',                              10000,  20000),
  ('PR05/06-032', 'ST05-06 Pencil 2ème génération',              15000,  25000),
  ('PR05/06-033', 'ST05-06 Pochette AirPods',                     5000,   8000),
  ('PR05/06-034', 'ST05-06 Écouteurs Apple à fils iPhone',        3000,   8000),
  ('PR05/06-035', 'ST05-06 Écouteurs Apple à fils Type-C',        3000,   8000),
  ('PR05/06-036', 'ST05-06 Chargeur magnétique Galaxy Watch Type-C', 2500, 5000),
  ('PR05/06-037', 'ST05-06 Chargeur magnétique Watch Type-C',     2500,   5000)
) AS t(ref, name, buy_price, sell_price)
ON CONFLICT (reference) DO NOTHING;
