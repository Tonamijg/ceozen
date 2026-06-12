import pandas as pd
import requests
import json

SUPABASE_URL = "https://ocjanwejwpezkhevkfyh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jamFud2Vqd3BlemtoZXZrZnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MzI0OSwiZXhwIjoyMDk0NjY5MjQ5fQ.dIStaHcRmpN4vO5lO9Yvh1DOUss1qaMksE9oVJWQZ6E"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation"
}

# 1. Récupérer les catégories depuis Supabase
print("📦 Chargement des catégories Supabase...")
r = requests.get(f"{SUPABASE_URL}/rest/v1/product_categories?select=id,name", headers=HEADERS)
categories = {c["name"]: c["id"] for c in r.json()}
print(f"   {len(categories)} catégories trouvées : {list(categories.keys())}")

# 2. Lire le template Excel
print("\n📄 Lecture du template Excel...")
df = pd.read_excel(
    r"C:\Users\EXPERT JG\Desktop\2026\k-tech-daily\template_import_produits.xlsx",
    sheet_name="Produits",
    dtype=str
)
df.columns = df.columns.str.strip()
print(f"   {len(df)} produits à importer")

# 3. Préparer les produits
products = []
skipped = []
cat_not_found = set()

for idx, row in df.iterrows():
    ref  = str(row.get("Référence *", "")).strip()
    name = str(row.get("Nom du produit *", "")).strip()
    cat  = str(row.get("Catégorie", "")).strip()

    if not ref or ref == "nan" or not name or name == "nan":
        skipped.append(f"Ligne {idx+2}: référence ou nom manquant")
        continue

    # Correspondance catégorie
    cat_id = categories.get(cat)
    if not cat_id:
        cat_not_found.add(cat)
        cat_id = categories.get("Autres")

    def to_num(val, default=0):
        try:
            v = str(val).strip()
            return float(v) if v and v != "nan" else default
        except:
            return default

    def to_int(val, default=0):
        try:
            v = str(val).strip()
            return int(float(v)) if v and v != "nan" else default
        except:
            return default

    desc = str(row.get("Description", "")).strip()
    if desc == "nan" or desc == "RAS":
        desc = None

    products.append({
        "reference":   ref,
        "name":        name,
        "category_id": cat_id,
        "buy_price":   to_num(row.get("Prix d'achat (FCFA) *")),
        "sell_price":  to_num(row.get("Prix de vente (FCFA) *")),
        "stock_qty":   to_int(row.get("Stock initial *")),
        "stock_min":   to_int(row.get("Seuil d'alerte"), 2),
        "unit":        str(row.get("Unité", "unité")).strip() if str(row.get("Unité", "")).strip() not in ["", "nan"] else "unité",
        "description": desc,
        "is_active":   True
    })

print(f"   ✅ {len(products)} produits prêts")
if skipped:
    print(f"   ⚠️  {len(skipped)} lignes ignorées : {skipped}")
if cat_not_found:
    print(f"   ⚠️  Catégories inconnues → mappées sur 'Autres' : {cat_not_found}")

# 4. Upsert par lots de 50
print(f"\n🚀 Import en cours (lots de 50)...")
BATCH = 50
inserted = 0
errors = []

for i in range(0, len(products), BATCH):
    batch = products[i:i+BATCH]
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/products",
        headers=HEADERS,
        data=json.dumps(batch)
    )
    if r.status_code in (200, 201):
        inserted += len(batch)
        print(f"   Lot {i//BATCH + 1} — {len(batch)} produits ✅")
    else:
        errors.append(f"Lot {i//BATCH + 1} : {r.status_code} — {r.text[:200]}")
        print(f"   Lot {i//BATCH + 1} — ❌ ERREUR : {r.status_code}")

# 5. Résumé
print(f"\n{'='*50}")
print(f"✅ Import terminé : {inserted}/{len(products)} produits insérés")
if errors:
    print(f"❌ {len(errors)} erreurs :")
    for e in errors:
        print(f"   {e}")
print("="*50)
