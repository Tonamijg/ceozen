import XLSX from 'xlsx';

const SUPABASE_URL = "https://ocjanwejwpezkhevkfyh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jamFud2Vqd3BlemtoZXZrZnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MzI0OSwiZXhwIjoyMDk0NjY5MjQ5fQ.dIStaHcRmpN4vO5lO9Yvh1DOUss1qaMksE9oVJWQZ6E";
const HEADERS = { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` };

// 1. Lire Excel
const wb = XLSX.readFile(String.raw`C:\Users\EXPERT JG\Documents\prod.xlsx`);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Produits"], { defval: "" });

const excelMap = {};
for (const row of rows) {
  const ref = String(row["Référence *"] ?? "").trim();
  const stock = parseInt(row["Stock initial *"]) || 0;
  const name = String(row["Nom du produit *"] ?? "").trim();
  if (ref) excelMap[ref] = { stock, name };
}

// 2. Lire Supabase (toutes les pages)
let allProds = [];
let offset = 0;
while (true) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/products?select=reference,name,stock_qty&order=reference&limit=500&offset=${offset}`, { headers: HEADERS });
  const data = await r.json();
  if (!data.length) break;
  allProds = allProds.concat(data);
  offset += data.length;
  if (data.length < 500) break;
}

const dbMap = {};
for (const p of allProds) dbMap[p.reference] = { stock: p.stock_qty, name: p.name };

// 3. Comparer
const ok = [], diffs = [], onlyExcel = [], onlyDB = [];

const allRefs = new Set([...Object.keys(excelMap), ...Object.keys(dbMap)]);
for (const ref of [...allRefs].sort()) {
  const xl = excelMap[ref];
  const db = dbMap[ref];
  if (!xl) { onlyDB.push({ ref, ...db }); continue; }
  if (!db) { onlyExcel.push({ ref, ...xl }); continue; }
  if (xl.stock !== db.stock) {
    diffs.push({ ref, name: xl.name, excel: xl.stock, db: db.stock, diff: db.stock - xl.stock });
  } else {
    ok.push(ref);
  }
}

// 4. Rapport
console.log(`\n${'='.repeat(60)}`);
console.log(`RAPPORT CONFORMITÉ STOCKS — prod.xlsx vs Supabase`);
console.log(`${'='.repeat(60)}`);
console.log(`\n✅ Conformes    : ${ok.length} produits`);
console.log(`❌ Différences  : ${diffs.length} produits`);
console.log(`📋 Excel seult  : ${onlyExcel.length} produits`);
console.log(`🗄️  DB seulement : ${onlyDB.length} produits`);

if (diffs.length > 0) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`❌ DIFFÉRENCES DE STOCK :`);
  console.log(`${'─'.repeat(60)}`);
  for (const d of diffs) {
    const arrow = d.diff > 0 ? `+${d.diff} en trop en DB` : `${d.diff} manquant en DB`;
    console.log(`  ${d.ref.padEnd(12)} | Excel=${String(d.excel).padStart(4)} | DB=${String(d.db).padStart(5)} | ${arrow}`);
    console.log(`             | ${d.name}`);
  }
}

if (onlyDB.length > 0) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🗄️  EN BASE MAIS PAS DANS EXCEL :`);
  for (const p of onlyDB) console.log(`  ${p.ref.padEnd(12)} | ${p.name} | stock=${p.stock}`);
}

if (onlyExcel.length > 0) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📋 DANS EXCEL MAIS PAS EN BASE :`);
  for (const p of onlyExcel) console.log(`  ${p.ref.padEnd(12)} | ${p.name} | stock=${p.stock}`);
}

console.log(`\n${'='.repeat(60)}\n`);
