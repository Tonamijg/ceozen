# CEOZEN — Notes de session de développement
> Session du 27–29 mai 2026 · Next.js + Supabase

---

## 🏗️ Stack technique
- **Frontend** : Next.js 16 App Router (Server Components + Client Components)
- **Backend** : Supabase (PostgreSQL + RLS + Realtime + Auth)
- **Hébergement** : Vercel (auto-deploy depuis GitHub)
- **Repo** : https://github.com/Tonamijg/ceozen
- **URL prod** : https://ceozen.vercel.app

---

## 🐛 BUGS RÉSOLUS

### 1. Totaux ventes à 0 FCFA
**Cause** : Les triggers PostgreSQL `after_sale_item_insert` et `update_product_stock` étaient `SECURITY INVOKER`. Quand un collaborateur insère un sale_item, le trigger tourne avec ses droits → la RLS admin-only bloque `UPDATE sales.total` et `UPDATE products.stock_qty` silencieusement.

**Fix** :
- SQL à executer dans Supabase SQL Editor (déjà fait) :
```sql
CREATE OR REPLACE FUNCTION public.update_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.products
  SET stock_qty = stock_qty + new.qty, updated_at = now()
  WHERE id = new.product_id;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.after_sale_item_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.stock_movements (product_id, type, qty, reference_id, reference_type)
  VALUES (new.product_id, 'sortie', -new.qty, new.sale_id, 'sale');
  UPDATE public.sales
  SET subtotal = (SELECT COALESCE(SUM(qty * unit_price), 0) FROM public.sale_items WHERE sale_id = new.sale_id),
      discount = (SELECT COALESCE(SUM(discount), 0) FROM public.sale_items WHERE sale_id = new.sale_id),
      total    = (SELECT COALESCE(SUM(total), 0) FROM public.sale_items WHERE sale_id = new.sale_id)
  WHERE id = new.sale_id;
  RETURN new;
END;
$$;
```
- Script `fix_data.mjs` : 15 totaux ventes recalculés + 11 stocks corrigés
- Script `fix_stock_reappro.mjs` : 6 stocks réappro appliqués (mouvements de transition)

---

### 2. Stock non mis à jour par les réappros
**Cause** : Même problème SECURITY INVOKER. Le trigger `after_expense_item_insert` insère un mouvement de stock, puis `update_product_stock` (SECURITY INVOKER) essaie de faire UPDATE products → bloqué par RLS.

**Fix** : Le SQL ci-dessus (SECURITY DEFINER sur `update_product_stock`) règle toute la chaîne. Désormais : réappro → stock_movement INSERT → `update_product_stock` (SECURITY DEFINER, bypass RLS) → stock_qty mis à jour ✅

---

### 3. Trocs ne s'enregistraient pas
**Cause** : La création d'un troc insère un nouveau produit (reprise) directement via le client Supabase authenticated. La RLS `products_write_admin` bloque tout INSERT produit pour les non-admins.

**Fix** : Nouvelle API route `/api/troc/create` avec service_role key.
- Fichier : `src/app/api/troc/create/route.ts`
- `src/app/(dashboard)/trocs/page.tsx` mis à jour pour appeler cette route

---

### 4. Dépenses backdatées dans "Dépenses du jour"
**Cause** : Le dashboard filtrait les dépenses par `created_at` (date d'insertion en DB) au lieu de `expense_date` (date comptable saisie par l'utilisateur).

**Fix** :
- `src/app/(dashboard)/dashboard/page.tsx` : `.eq('expense_date', todayDate)`
- `src/app/(dashboard)/dashboard/DashboardClient.tsx` : suppression du `if (period === 'today') return;`

---

### 5. Bug timezone — dates décalées d'un jour (UTC+)
**Cause** : `.toISOString().split('T')[0]` retourne la date en UTC. Pour un utilisateur en UTC+1, minuit local = 23h UTC la veille → la date calculée était hier.

**Fix** : Ajout de `localDateStr()` dans `src/lib/utils.ts` :
```typescript
export function localDateStr(d: Date = new Date()): string {
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
```
Utilisée dans : `DashboardClient.tsx`, `depenses/page.tsx`, `tresorerie/page.tsx`, `rapports/page.tsx`, `ventes/page.tsx`

---

### 6. Suppression de ventes silencieuse (sans effet)
**Cause** : Pas de politique RLS DELETE sur la table `sales`. La suppression depuis le client Supabase échouait silencieusement.

**Fix** : Nouvelle API route `/api/admin/delete-sale` avec service_role :
- Vérifie que l'utilisateur est admin
- Insère des stock_movements de type `annulation_vente` (+qty pour restaurer)
- Supprime les avoirs liés
- Supprime la vente (cascade → sale_items)

---

### 7. Suppression de dépenses — reversal réappro
**Cause** : La suppression d'une dépense réappro ne restaurait pas le stock.

**Fix** : `depenses/page.tsx` — `handleDeleteExpense()` insère des mouvements négatifs (`annulation_reappro`) pour chaque expense_item avant de supprimer la dépense.

---

## 📁 FICHIERS CLÉS MODIFIÉS / CRÉÉS

| Fichier | Rôle |
|---|---|
| `src/app/(dashboard)/dashboard/page.tsx` | SSR dashboard — fix expense_date |
| `src/app/(dashboard)/dashboard/DashboardClient.tsx` | Client dashboard — fix timezone + period |
| `src/app/(dashboard)/ventes/page.tsx` | Ventes + suppression admin |
| `src/app/(dashboard)/depenses/page.tsx` | Dépenses + suppression admin + réappro reversal |
| `src/app/(dashboard)/trocs/page.tsx` | Trocs — appel API route |
| `src/app/(dashboard)/rapports/page.tsx` | Fix timezone date initiale |
| `src/app/(dashboard)/tresorerie/page.tsx` | Fix timezone date apport |
| `src/app/api/admin/delete-sale/route.ts` | DELETE vente (service_role) |
| `src/app/api/troc/create/route.ts` | Création troc (service_role) |
| `src/lib/utils.ts` | + `localDateStr()` timezone-safe |
| `supabase/migrations/003_fix_triggers_security_definer.sql` | SQL triggers SECURITY DEFINER |
| `fix_data.mjs` | Script correction totaux ventes + stocks vente |
| `fix_stock_reappro.mjs` | Script correction stocks réappro |
| `compare_stocks.mjs` | Script comparaison Excel vs DB |
| `import_produits.mjs` | Script import 203 produits depuis Excel |

---

## 🗄️ STRUCTURE BASE DE DONNÉES (tables principales)

```
profiles          — utilisateurs (role: admin | collaborateur)
products          — catalogue produits (stock_qty, stock_min, buy_price, sell_price)
product_categories — catégories produits
stock_movements   — tous les mouvements de stock (entree/sortie/ajustement)
sales             — ventes (total calculé par trigger)
sale_items        — lignes de vente (qty × unit_price)
sale_avoirs       — avoirs/annulations de ventes
expenses          — dépenses (expense_date ≠ created_at !)
expense_items     — lignes réappro (déclenche stock entree)
expense_categories — catégories dépenses (dont "Réapprovisionnement")
clients           — carnet clients
trocs             — échanges téléphones avec complément
treasury_accounts — comptes de trésorerie (espèces, mobile money, banque)
treasury_apports  — apports de capital
```

---

## ⚙️ TRIGGERS POSTGRESQL (tous SECURITY DEFINER maintenant)

| Trigger | Table | Fonction | Action |
|---|---|---|---|
| `after_sale_item_insert` | sale_items | `after_sale_item_insert()` | Insère stock_movement sortie + met à jour sales.total |
| `after_stock_movement` | stock_movements | `update_product_stock()` | Met à jour products.stock_qty += new.qty |
| `after_expense_item_insert` | expense_items | `after_expense_item_insert()` | Insère stock_movement entree pour réappro |
| `before_sale_insert` | sales | `generate_sale_number()` | Génère VTE-YYYYMM-XXXX |

---

## 🔐 RLS — RÈGLES IMPORTANTES

- **Collaborateur** : peut SELECT tout, INSERT ventes/dépenses/clients. NE PEUT PAS UPDATE products directement.
- **Admin** : peut tout faire (UPDATE, DELETE, etc.)
- **Triggers SECURITY DEFINER** : bypass RLS → les triggers s'exécutent toujours avec les droits `postgres`
- **API routes service_role** : utilisées pour DELETE vente, CREATE troc → bypass total RLS

---

## 🚨 POINT D'ATTENTION — TEL-109
Ce produit (SC Samsung A16 128GB) a eu de nombreuses opérations de test (mai 26-27) laissant des mouvements incohérents. Stock fixé manuellement à **16** (1 import + 20 réappro - 5 ventes nettes). **Vérifier physiquement** en boutique.

---

## 📦 PRODUITS IMPORTÉS
- **203 produits** importés depuis `prod.xlsx` via `import_produits.mjs`
- Catégories : Téléphones (TEL-XXX), Accessoires (ACC-XXX), Produits MOOV (MOV-XXX)
- Import Supabase : table `products` via upsert par référence

---

## 🔧 VARIABLES D'ENVIRONNEMENT
```env
NEXT_PUBLIC_SUPABASE_URL=https://ocjanwejwpezkhevkfyh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   ← NE JAMAIS EXPOSER AU CLIENT
RESEND_API_KEY=re_...
NOTIFY_EMAIL=denissou.biga@gmail.com
```

---

## ✅ ÉTAT ACTUEL (29 mai 2026)
- Build Vercel : ✅ OK
- Triggers SQL : ✅ SECURITY DEFINER en place
- Ventes collaborateur : ✅ Total et stock mis à jour
- Réappro : ✅ Stock mis à jour
- Trocs : ✅ Création via API route
- Dashboard dates : ✅ Timezone-safe + expense_date
- Multi-utilisateurs : ✅ PostgreSQL gère nativement la concurrence
