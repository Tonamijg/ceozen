# CEOZEN — Journal de développement complet

> Projet : Application de gestion de boutique tech
> Stack : Next.js 16 + Supabase + Tailwind CSS + Vercel
> Dossier local : `C:\Users\EXPERT JG\Desktop\2026\k-tech-daily`
> Repo GitHub : https://github.com/Tonamijg/ceozen
> Date de session : Mai 2026

---

## 1. Point de départ

Le projet s'appelait **K-Tech Daily**. C'était une app Next.js + Supabase pour gérer une boutique de téléphones/accessoires tech. La base fonctionnait, mais plusieurs choses manquaient ou étaient cassées.

---

## 2. Problèmes signalés par l'utilisateur

- Les avoirs (remboursements) n'apparaissaient pas dans le tableau des ventes
- Pas de détail de vente cliquable (noms des articles invisibles)
- Dans Dépenses : le récap "par catégorie" était en bas/côté, mal aligné
- Les dates dans les tableaux étaient "serrées" (pas de `whitespace-nowrap`)
- La cloche de notification en haut à droite ne fonctionnait pas
- Pas de module Créances & Dettes
- Pas de sélecteur de période sur le tableau de bord
- Volonté de changer le nom de l'application

---

## 3. Fonctionnalités développées

### 3.1 Avoirs dans la page Ventes

**Problème :** les avoirs créés en base ne s'affichaient pas.

**Solution :**
- Création d'une interface `AvoirRow` et d'un type union `CombinedRow`
- Fetch de la table `sale_avoirs` avec jointure sur `sales`
- Fusion des ventes et avoirs triés par `created_at` décroissant
- Affichage des avoirs en rouge avec montant négatif et bordure gauche rouge

```tsx
interface AvoirRow {
  id: string; avoir_number: string; sale_id: string;
  sale_number: string; client_name: string | null;
  reason: string; total: number; created_at: string;
}
type CombinedRow = { _t: 'sale'; d: VSale } | { _t: 'avoir'; d: AvoirRow };
```

---

### 3.2 Détail d'une vente (modal)

**Problème :** impossible de voir les articles d'une vente.

**Solution :**
- Ajout d'une fonction `openDetail(sale)` qui fetch `sale_items` à la demande
- Modal affichant : nom du produit, référence, quantité, prix unitaire, total ligne
- Bouton œil (Eye) sur chaque ligne de vente pour ouvrir le détail

---

### 3.3 Page Dépenses — récap par catégorie

**Avant :** le récap catégorie était une colonne latérale en bas du tableau.

**Après :**
- Récap déplacé **en haut** de la page sous forme de cartes horizontales
- Chaque carte = nom catégorie + montant + barre de progression en %
- Tableau pleine largeur en dessous

---

### 3.4 Dates "serrées"

**Fix :** ajout de `whitespace-nowrap` sur toutes les colonnes date dans ventes et dépenses.

---

### 3.5 Cloche de notification (stock faible)

**Problème :** la cloche était décorative, rien ne se passait au clic.

**Solution :**
- `DashboardShell` fetch maintenant les données complètes de `v_stock_alerts`
- Passe `stockAlerts: VStockAlert[]` au composant `Header`
- `Header` gère un state `showNotif` + ref pour fermer au clic extérieur
- Dropdown affichant : nom produit, stock actuel, stock minimum
- Lien vers `/stock` en bas du dropdown

---

### 3.6 Module Créances & Dettes (nouveau)

**Fichier :** `src/app/(dashboard)/creances/page.tsx`

**Fonctionnalités :**
- Deux onglets : **Créances** (clients qui doivent) et **Dettes** (fournisseurs)
- 4 cartes de synthèse : total créances, en retard, total dettes, dettes en retard
- Bouton "Marquer soldé" → met à jour `is_settled = true` en base
- Checkbox pour afficher/masquer les éléments soldés
- Lignes rouges pour les paiements en retard
- Totaux dans le pied de tableau

**Vues Supabase créées :**
```sql
-- v_creances : ventes à crédit non soldées
-- v_dettes : dépenses à crédit non soldées
```

---

### 3.7 Sélecteur de période sur le Dashboard

**Fichier :** `src/app/(dashboard)/dashboard/DashboardClient.tsx`

**Périodes disponibles :**
| Clé | Label |
|-----|-------|
| `today` | Aujourd'hui |
| `week` | 7 jours |
| `month` | Ce mois |
| `year` | Cette année |

**Comportement :**
- `fetchPeriodStats(p)` refetch toutes les données selon la période
- Graphique agrège par jour (≤ 30 jours) ou par mois (année)
- Les labels des cartes stats changent dynamiquement

---

### 3.8 Renommage → CEOZEN

**Ancien nom :** K-Tech Daily
**Nouveau nom :** CEOZEN *(Daily + CEO = piloter sa boutique au quotidien)*

**Fichiers modifiés :**
- `Sidebar.tsx` : logo texte → `CEOZEN` / sous-titre `by Tech big`
- `package.json` : `"name": "k-tech-daily"` conservé (technique uniquement)
- Page title dans layout → `CEOZEN`

---

## 4. SQL — Migrations Supabase exécutées

### Migration 001 — Table sale_avoirs
```sql
CREATE TABLE IF NOT EXISTS public.sale_avoirs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avoir_number text NOT NULL,
  sale_id      uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  total        numeric(12,2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

### Migration 002 — Vues créances/dettes
```sql
DROP VIEW IF EXISTS v_creances CASCADE;
DROP VIEW IF EXISTS v_dettes CASCADE;

CREATE VIEW v_creances AS
SELECT s.id, s.sale_number, s.client_name, s.total,
       s.credit_due_date, s.is_settled, s.created_at,
       CASE WHEN s.credit_due_date < now() AND NOT s.is_settled
            THEN true ELSE false END as is_overdue
FROM sales s
WHERE s.payment_method = 'credit';

CREATE VIEW v_dettes AS
SELECT e.id, e.description, e.amount, e.category,
       e.credit_due_date, e.is_settled, e.created_at,
       CASE WHEN e.credit_due_date < now() AND NOT e.is_settled
            THEN true ELSE false END as is_overdue
FROM expenses e
WHERE e.payment_method = 'credit';
```

### Migration 003 — Colonne sale_id sur avoirs
```sql
ALTER TABLE sale_avoirs ADD COLUMN IF NOT EXISTS sale_number text;
```

---

## 5. Déploiement Vercel

### Problèmes rencontrés

| Problème | Cause | Fix |
|----------|-------|-----|
| Build bloqué CVE-2025-66478 | Next.js 15 vulnérable | Upgrade → Next.js 16.2.6 |
| npm install fail | eslint-config-next@16 requiert eslint@9 | Upgrade eslint → ^9 |
| npm peer conflict sur Vercel | Dépendances legacy | `.npmrc` avec `legacy-peer-deps=true` |
| Turbopack CSS error | `@import` Google Fonts après `@tailwind` | Déplacer `@import` en ligne 1 du CSS |

### Fix final — globals.css
```css
/* ✅ @import DOIT être avant tout le reste */
@import url('https://fonts.googleapis.com/...');

@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Commits clés
| Hash | Description |
|------|-------------|
| `ecc906b` | Next.js 16 + eslint@9 |
| `beff952` | Fix @import Turbopack → **DEPLOY OK** ✅ |

---

## 6. Architecture technique

```
k-tech-daily/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── DashboardShell.tsx     ← Layout principal + alertes stock
│   │   │   ├── dashboard/
│   │   │   │   └── DashboardClient.tsx ← Stats + période sélecteur + graphique
│   │   │   ├── ventes/
│   │   │   │   └── page.tsx           ← Ventes + avoirs + modal détail
│   │   │   ├── depenses/
│   │   │   │   └── page.tsx           ← Dépenses + catégories en haut
│   │   │   ├── creances/
│   │   │   │   └── page.tsx           ← NEW — Créances & Dettes
│   │   │   ├── stock/
│   │   │   ├── rapports/
│   │   │   └── utilisateurs/
│   │   └── globals.css                ← @import en premier (fix Turbopack)
│   ├── components/
│   │   └── layout/
│   │       ├── Sidebar.tsx            ← Logo CEOZEN + lien Créances
│   │       └── Header.tsx             ← Notification bell fonctionnelle
│   ├── lib/
│   │   └── supabase/
│   └── types/
├── .npmrc                             ← legacy-peer-deps=true
├── .gitignore
└── package.json
```

---

## 7. Fonctionnalités actives (v1.0 en production)

- ✅ Tableau de bord avec sélecteur de période
- ✅ Gestion des ventes + avoirs en négatif
- ✅ Détail d'une vente (articles, prix, quantités)
- ✅ Gestion des dépenses + récap catégories
- ✅ Créances & Dettes (clients + fournisseurs)
- ✅ Gestion du stock + alertes
- ✅ Cloche de notification stock faible
- ✅ Gestion des utilisateurs (admin / collaborateur)
- ✅ Profil utilisateur
- ✅ Déployé sur Vercel

---

## 8. Roadmap v2 (fonctionnalités prévues)

- 📄 Export Excel / PDF des rapports
- 🧾 Impression de reçus et factures
- 📊 Rapports avancés (top produits, comparaisons)
- 🏭 Gestion des fournisseurs
- 📦 Historique des mouvements de stock tracé
- 📧 Alertes email pour créances en retard
- 🌐 Domaine personnalisé
- 📱 Mode PWA (installation mobile)
- 🏪 Multi-boutiques

---

*Document généré le 19 mai 2026 — CEOZEN by Tech big*
