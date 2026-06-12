import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const SUPABASE_URL = "https://ocjanwejwpezkhevkfyh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jamFud2Vqd3BlemtoZXZrZnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MzI0OSwiZXhwIjoyMDk0NjY5MjQ5fQ.dIStaHcRmpN4vO5lO9Yvh1DOUss1qaMksE9oVJWQZ6E";

const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates,return=representation"
};

function toNum(val, def = 0) {
  const v = String(val ?? "").trim();
  const n = parseFloat(v);
  return isNaN(n) ? def : n;
}
function toInt(val, def = 0) {
  const v = String(val ?? "").trim();
  const n = parseInt(v);
  return isNaN(n) ? def : n;
}

// 1. Récupérer les catégories Supabase
console.log("📦 Chargement des catégories Supabase...");
const catRes = await fetch(`${SUPABASE_URL}/rest/v1/product_categories?select=id,name`, { headers: HEADERS });
const catList = await catRes.json();
const categories = Object.fromEntries(catList.map(c => [c.name, c.id]));
console.log(`   ${Object.keys(categories).length} catégories : ${Object.keys(categories).join(", ")}`);

// 2. Lire le template Excel
console.log("\n📄 Lecture du template Excel...");
const wb = XLSX.readFile(String.raw`C:\Users\EXPERT JG\Desktop\2026\k-tech-daily\template_import_produits.xlsx`);
const ws = wb.Sheets["Produits"];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
console.log(`   ${rows.length} produits trouvés`);

// 3. Préparer les produits
const products = [];
const skipped = [];
const catNotFound = new Set();

for (const [i, row] of rows.entries()) {
  const ref  = String(row["Référence *"] ?? "").trim();
  const name = String(row["Nom du produit *"] ?? "").trim();
  const cat  = String(row["Catégorie"] ?? "").trim();

  if (!ref || !name) {
    skipped.push(`Ligne ${i + 2} : ref ou nom manquant`);
    continue;
  }

  let catId = categories[cat];
  if (!catId) {
    catNotFound.add(cat);
    catId = categories["Autres"];
  }

  let desc = String(row["Description"] ?? "").trim();
  if (!desc || desc === "RAS") desc = null;

  products.push({
    reference:   ref,
    name:        name,
    category_id: catId,
    buy_price:   toNum(row["Prix d'achat (FCFA) *"]),
    sell_price:  toNum(row["Prix de vente (FCFA) *"]),
    stock_qty:   toInt(row["Stock initial *"]),
    stock_min:   toInt(row["Seuil d'alerte"], 2),
    unit:        String(row["Unité"] ?? "unité").trim() || "unité",
    description: desc,
    is_active:   true
  });
}

console.log(`   ✅ ${products.length} produits prêts`);
if (skipped.length)     console.log(`   ⚠️  Ignorés : ${skipped.join(" | ")}`);
if (catNotFound.size)   console.log(`   ⚠️  Catégories inconnues → 'Autres' : ${[...catNotFound].join(", ")}`);

// 4. Upsert par lots de 50
console.log(`\n🚀 Import en cours...`);
const BATCH = 50;
let inserted = 0;
const errors = [];

for (let i = 0; i < products.length; i += BATCH) {
  const batch = products.slice(i, i + BATCH);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(batch)
  });
  if (r.ok) {
    inserted += batch.length;
    console.log(`   Lot ${Math.floor(i/BATCH)+1} — ${batch.length} produits ✅`);
  } else {
    const txt = await r.text();
    errors.push(`Lot ${Math.floor(i/BATCH)+1} : ${r.status} — ${txt.slice(0,200)}`);
    console.log(`   Lot ${Math.floor(i/BATCH)+1} — ❌ ERREUR ${r.status}`);
  }
}

// 5. Résumé final
console.log(`\n${"=".repeat(50)}`);
console.log(`✅ Import terminé : ${inserted}/${products.length} produits insérés`);
if (errors.length) {
  console.log(`❌ ${errors.length} erreur(s) :`);
  errors.forEach(e => console.log(`   ${e}`));
}
console.log("=".repeat(50));
