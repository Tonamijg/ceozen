// Script de correction des données CEOZEN
// Corrige : totaux ventes à 0 + stocks non décrémentés
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ocjanwejwpezkhevkfyh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jamFud2Vqd3BlemtoZXZrZnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MzI0OSwiZXhwIjoyMDk0NjY5MjQ5fQ.dIStaHcRmpN4vO5lO9Yvh1DOUss1qaMksE9oVJWQZ6E'
);

// ══════════════════════════════════════════════
// 1. CORRIGER LES TOTAUX DES VENTES À 0
// ══════════════════════════════════════════════
console.log('\n[1/2] Correction des totaux de ventes...');
const { data: zeroSales } = await supabase.from('sales').select('id,sale_number').eq('total', 0);
console.log(`  ${zeroSales.length} ventes à corriger`);

let fixedSales = 0;
for (const sale of zeroSales) {
  const { data: items } = await supabase
    .from('sale_items')
    .select('qty,unit_price,discount,total')
    .eq('sale_id', sale.id);

  if (!items?.length) continue;

  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const discount = items.reduce((s, i) => s + (i.discount || 0), 0);
  const total    = items.reduce((s, i) => s + (i.total || 0), 0);

  const { error } = await supabase
    .from('sales')
    .update({ subtotal, discount, total })
    .eq('id', sale.id);

  if (!error) { fixedSales++; process.stdout.write('.'); }
  else console.log(`\n  Erreur ${sale.sale_number}: ${error.message}`);
}
console.log(`\n  ✅ ${fixedSales}/${zeroSales.length} ventes corrigées`);

// ══════════════════════════════════════════════
// 2. CORRIGER LE STOCK (mouvements vente ratés)
// ══════════════════════════════════════════════
console.log('\n[2/2] Correction des stocks...');
const { data: saleMvts } = await supabase
  .from('stock_movements')
  .select('product_id,qty')
  .eq('reference_type', 'sale');

const saleDelta = {};
for (const m of saleMvts) {
  saleDelta[m.product_id] = (saleDelta[m.product_id] || 0) + m.qty;
}

let fixedStock = 0;
for (const [pid, delta] of Object.entries(saleDelta)) {
  const { data: prod } = await supabase
    .from('products')
    .select('reference,stock_qty')
    .eq('id', pid)
    .single();

  const newQty = Math.max(0, prod.stock_qty + delta);
  console.log(`  ${prod.reference}: ${prod.stock_qty} + (${delta}) = ${newQty}`);

  const { error } = await supabase
    .from('products')
    .update({ stock_qty: newQty })
    .eq('id', pid);

  if (!error) fixedStock++;
  else console.log(`    Erreur: ${error.message}`);
}
console.log(`\n✅ ${fixedStock} stocks mis à jour`);
console.log('\n⚠️  Pensez à appliquer le SQL des triggers dans Supabase SQL Editor !');
