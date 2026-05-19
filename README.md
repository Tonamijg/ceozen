# K-Tech Daily 🚀

Plateforme de gestion de boutique tech — Afrique de l'Ouest.

## Stack
- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** v3 · dark mode · accents néon bleu/violet
- **Supabase** (PostgreSQL + Auth + Realtime)
- **Recharts** pour les graphiques
- **xlsx** pour export Excel
- **Vercel** pour le déploiement

## Modules
| Module | Rôles | Fonctionnalités |
|--------|-------|----------------|
| Auth | Tous | Login email/password, rôles admin/collaborateur |
| Dashboard | Tous | KPIs temps réel, graphiques 30 jours, alertes stock |
| Ventes | Tous | Saisie ventes (produit + qté + prix + remise), historique filtrable |
| Dépenses | Tous | Saisie par catégorie, résumé mensuel, graphique |
| Stock | Admin/Collab | État du stock, mouvements, CRUD catalogue (admin) |
| Rapports | Admin | CA/Dépenses/Marge, top produits, export Excel + PDF |
| Utilisateurs | Admin | Gestion rôles, activation/désactivation |

## Installation

### 1. Supabase
1. Crée un projet sur [supabase.com](https://supabase.com)
2. Va dans **SQL Editor** et exécute le fichier `supabase/migrations/001_initial_schema.sql`
3. Active **Realtime** sur les tables : `sales`, `expenses`, `stock_movements`
   - Dashboard Supabase → Database → Replication → ajouter les 3 tables
4. Crée ton premier utilisateur admin :
   - Authentication → Users → Add user
   - Puis mets à jour son rôle en SQL : `UPDATE profiles SET role = 'admin' WHERE id = '<uuid>';`

### 2. Variables d'environnement
```bash
cp .env.local.example .env.local
```
Remplis `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` depuis :
**Supabase → Project Settings → API**

### 3. Dev local
```bash
npm install
npm run dev
# → http://localhost:3000
```

### 4. Déploiement Vercel
```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel --prod
```
Ajoute les variables d'environnement dans **Vercel → Project → Settings → Environment Variables**.

## Structure du projet
```
src/
├── app/
│   ├── (auth)/login/         # Page de connexion
│   └── (dashboard)/
│       ├── dashboard/        # Tableau de bord
│       ├── ventes/           # Module ventes
│       ├── depenses/         # Module dépenses
│       ├── stock/            # Stock + catalogue + mouvements
│       ├── rapports/         # Rapports + exports
│       ├── utilisateurs/     # Gestion utilisateurs (admin)
│       └── profil/           # Profil utilisateur
├── components/
│   ├── layout/               # Sidebar + Header
│   └── dashboard/            # Composants graphiques
├── lib/supabase/             # Clients Supabase (browser + server)
├── types/                    # Types TypeScript
supabase/
└── migrations/001_initial_schema.sql   # Schéma complet
```

## Ajout de futurs utilisateurs
Invite-les depuis **Supabase → Authentication → Users → Invite user**.
Le profil est créé automatiquement (rôle `collaborateur` par défaut).
Modifie le rôle depuis **K-Tech Daily → Utilisateurs** (admin requis).

## Hook WhatsApp (prévu)
Le hook est prêt dans les triggers Supabase.
Intègre un webhook vers **CallMeBot** ou **Twilio** dans la fonction `after_sale_item_insert` ou via une Edge Function Supabase.
