# CEOZEN — Journal de développement complet
> Stack : Next.js 16 + Supabase + Tailwind CSS + Vercel  
> Repo GitHub : https://github.com/Tonamijg/ceozen  
> Dossier local : `C:\Users\EXPERT JG\Desktop\2026\k-tech-daily`  
> Dernière mise à jour : 23 mai 2026

---

## 1. Présentation du projet

**CEOZEN** est une application web de gestion de boutique de téléphones.  
Anciennement nommée **K-Tech Daily**, renommée CEOZEN *(Daily + CEO = piloter sa boutique au quotidien)*.  
Slogan : *by Tech big*

**Objectif commercial :** commercialiser l'app aux boutiques de vente de téléphones.

---

## 2. Stack technique

| Technologie | Usage |
|-------------|-------|
| Next.js 16.2.6 | Framework React (App Router) |
| Supabase | Base de données PostgreSQL + Auth + RLS |
| Tailwind CSS 3 | Styles |
| Vercel | Déploiement continu |
| TypeScript | Typage |
| Recharts | Graphiques |
| xlsx | Export Excel |

---

## 3. Fonctionnalités développées (v1.0 — en production)

### 3.1 Tableau de bord
- Stats en temps réel : CA, dépenses, bénéfice, ventes
- **Sélecteur de période** : Aujourd'hui / 7 jours / Ce mois / Cette année
- Graphique d'évolution ventes/dépenses
- Cloche de notification stock faible (dropdown avec liste)
- **CA inclut les ventes + compléments de trocs**

### 3.2 Ventes
- Formulaire de saisie rapide avec recherche produit
- Gestion clients (existants ou nom rapide)
- Modes de paiement : Espèces, Mobile Money, Carte, Virement, Crédit
- **Avoirs** : remboursements affichés en rouge/négatif dans le tableau
- **Modal détail** : articles, prix, quantités au clic
- **Bouton impression reçu** (ticket 80mm format thermique)
- Historique avec filtre par date

### 3.3 Dépenses
- Enregistrement par catégorie
- **Récap catégories en haut** sous forme de cartes horizontales avec barres
- Historique filtrable
- Support réapprovisionnement stock lié

### 3.4 Créances & Dettes
- Onglet **Créances** (clients qui doivent) + onglet **Dettes** (fournisseurs)
- **Inclut les trocs à crédit** (badge "Troc" visible)
- 4 cartes résumé : total créances, retard, total dettes, dettes en retard
- Bouton "Marquer soldé" par ligne
- Lignes rouges pour les retards
- Filtre pour afficher/masquer les éléments soldés

### 3.5 Stock
- Catalogue produits avec alertes stock faible
- Mouvements d'entrée/sortie

### 3.6 Trocs *(nouveau module)*
- Formulaire : téléphone donné (depuis stock) + téléphone repris + complément auto-calculé
- Paiement : Espèces / Mobile Money / Crédit
- **Le téléphone repris entre automatiquement dans le stock**
- **Onglet "Reprises en stock"** : liste tous les téléphones récupérés
- **Bouton impression reçu de troc**
- Trocs à crédit → apparaissent dans Créances

### 3.7 Rapports
- KPIs : CA, Dépenses, Marge, Nb ventes
- **+ 2 KPIs Trocs** : nombre et CA des compléments
- Graphique top produits (horizontal bar)
- Graphique dépenses par catégorie (pie chart)
- Performance par vendeur (barres de progression)
- État du stock à date (tableau complet)
- **Export Excel** (5 feuilles : résumé, top produits, vendeurs, stock, dépenses)
- **Impression PDF** (window.print)

### 3.8 Utilisateurs
- Deux rôles : **Admin** (tout voir) / **Collaborateur** (ventes, dépenses, stock)
- Invitation depuis l'interface

### 3.9 Mon profil
- Modification des informations personnelles

### 3.10 Notifications WhatsApp *(en cours de configuration)*
- Architecture prête dans le code
- Déclenché sur : vente, avoir, dépense, troc
- Voir section 7 pour la config

---

## 4. Architecture des fichiers

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── DashboardShell.tsx       ← Layout principal + alertes stock
│   │   ├── dashboard/
│   │   │   └── DashboardClient.tsx  ← Stats + période + graphique
│   │   ├── ventes/page.tsx          ← Ventes + avoirs + modal + reçu
│   │   ├── depenses/page.tsx        ← Dépenses + catégories
│   │   ├── creances/page.tsx        ← Créances + Dettes + Trocs crédit
│   │   ├── stock/                   ← Stock + alertes
│   │   ├── trocs/page.tsx           ← Trocs + reprises en stock + reçu
│   │   ├── rapports/page.tsx        ← KPIs + graphiques + export
│   │   └── utilisateurs/            ← Gestion des accès
│   ├── api/
│   │   └── notify/route.ts          ← API WhatsApp (POST /api/notify)
│   └── globals.css                  ← @import Google Fonts EN PREMIER
├── components/
│   └── layout/
│       ├── Sidebar.tsx              ← Navigation + logo CEOZEN
│       └── Header.tsx               ← Cloche notification
├── lib/
│   ├── supabase/                    ← Client Supabase
│   ├── utils.ts                     ← formatCFA, formatDate, cn
│   ├── print.ts                     ← Utilitaire reçus imprimables
│   └── whatsapp.ts                  ← Fonctions notifications WhatsApp
└── types/index.ts                   ← Tous les types TypeScript
```

---

## 5. Migrations SQL exécutées dans Supabase

### Migration 001 — Table sale_avoirs
```sql
CREATE TABLE IF NOT EXISTS public.sale_avoirs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avoir_number text NOT NULL,
  sale_id      uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  total        numeric(12,2) NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

### Migration 002 — Table trocs
```sql
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
  payment_method         text NOT NULL DEFAULT 'especes',
  is_settled             boolean NOT NULL DEFAULT true,
  credit_due_date        date,
  notes                  text,
  created_by             uuid REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trocs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_trocs_all" ON public.trocs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### Migration 003 — Vue v_creances mise à jour (ventes + trocs)
```sql
DROP VIEW IF EXISTS v_creances CASCADE;
CREATE VIEW public.v_creances AS
  SELECT
    s.id,
    'vente'::text              AS type,
    s.sale_number              AS reference_number,
    s.client_name,
    s.total                    AS amount,
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
```

---

## 6. Déploiement Vercel

### Problèmes résolus
| Problème | Fix |
|----------|-----|
| Next.js 15 bloqué CVE | Upgrade → Next.js 16.2.6 |
| eslint peer conflict | Upgrade eslint → ^9 |
| npm install fail Vercel | `.npmrc` avec `legacy-peer-deps=true` |
| Turbopack CSS error | `@import` Google Fonts déplacé en ligne 1 de globals.css |

### Commits clés
| Hash | Description |
|------|-------------|
| `beff952` | Fix @import Turbopack → 1er deploy OK ✅ |
| `72c07d6` | Module Trocs complet |
| `8297b29` | Fix input-field, trocs dans CA |
| `c200e2b` | Reçus imprimables + reprises stock + KPIs rapports |
| `6c61ce7` | Intégration WhatsApp API |

---

## 7. WhatsApp Cloud API (Meta) — EN COURS ⚠️

### État actuel
- ✅ Code complet dans `src/lib/whatsapp.ts` et `src/app/api/notify/route.ts`
- ✅ Intégré dans : ventes, avoirs, dépenses, trocs
- ✅ App Meta créée sur developers.facebook.com (app : CEOZEN)
- ✅ Numéro test vérifié : `+22962369645`
- ⚠️ **Token temporaire expiré** — besoin de générer un token permanent
- ⚠️ **Variables Vercel à mettre à jour** avec le nouveau token

### Credentials
| Variable | Valeur |
|----------|--------|
| `WHATSAPP_PHONE_ID` | `1190774254109710` |
| `WHATSAPP_RECIPIENT` | `+22962369645` |
| `WHATSAPP_TOKEN` | ⚠️ À régénérer (token permanent) |

### Générer un token permanent (à faire)
1. Aller sur **business.facebook.com**
2. **Paramètres → Utilisateurs → Utilisateurs système**
3. Créer un utilisateur système : `CEOZEN Bot` (rôle Admin)
4. **Générer un nouveau token** → app CEOZEN
5. Cocher permissions : `whatsapp_business_messaging` + `whatsapp_business_management`
6. Copier le token *(affiché une seule fois)*
7. Mettre à jour dans :
   - `.env.local` → `WHATSAPP_TOKEN=...`
   - **Vercel → Settings → Environment Variables → WHATSAPP_TOKEN**
   - Redéployer sur Vercel

### Messages envoyés automatiquement
| Événement | Déclencheur |
|-----------|-------------|
| 🛒 Vente | À chaque vente enregistrée |
| 🔄 Avoir | À chaque avoir créé |
| 💸 Dépense | À chaque dépense enregistrée |
| 🔁 Troc | À chaque troc enregistré |

---

## 8. Variables d'environnement

### `.env.local` (local)
```
NEXT_PUBLIC_SUPABASE_URL=https://ocjanwejwpezkhevkfyh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[clé anon Supabase]
NEXT_PUBLIC_APP_URL=http://localhost:3000
WHATSAPP_TOKEN=[TOKEN META — à renouveler]
WHATSAPP_PHONE_ID=1190774254109710
WHATSAPP_RECIPIENT=+22962369645
```

### Vercel — Environment Variables
Mêmes variables à ajouter dans : **Vercel → projet ceozen → Settings → Environment Variables**

---

## 9. Roadmap — Ce qui reste à faire

### 🔴 Court terme (prochaine session)
- [ ] Générer le **token WhatsApp permanent** (System User Token)
- [ ] Mettre à jour le token dans `.env.local` et Vercel
- [ ] Tester les notifications de bout en bout

### 🟡 Moyen terme
- [ ] **Multi-tenancy** : permettre à plusieurs boutiques d'utiliser l'app de façon isolée
  - Option recommandée : **une instance Supabase par boutique** (simple, propre)
  - Alternative : multi-tenancy par `company_id` + RLS (plus complexe)
- [ ] Page Paramètres boutique (nom, logo, config WhatsApp par boutique)
- [ ] Token WhatsApp permanent par boutique

### 🟢 Long terme
- [ ] Export PDF des rapports (jsPDF)
- [ ] Notifications email pour créances en retard
- [ ] Mode PWA (installation mobile)
- [ ] Multi-boutiques (même compte admin)
- [ ] Domaine personnalisé (ceozen.app)

---

## 10. Fonctionnalités commerciales (pitch)

### Ce que CEOZEN apporte à une boutique
- **Pilotage en temps réel** : CA, dépenses, marge d'un coup d'œil
- **Zéro erreur de stock** : mis à jour automatiquement à chaque vente
- **Traçabilité complète** : ventes, avoirs, trocs, dépenses, créances
- **Alertes intelligentes** : stock faible → notification WhatsApp immédiate
- **Reçus professionnels** : impression ticket en 1 clic
- **Multi-utilisateurs** : admin + collaborateurs avec accès différenciés
- **Accessible partout** : PC, tablette, mobile — aucune installation

---

*Document généré le 23 mai 2026 — CEOZEN by Tech big*
