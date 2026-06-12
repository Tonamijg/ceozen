// Fix : applique tous les mouvements stock (réappro/adjustment/annulation)
// qui n'ont PAS mis à jour products.stock_qty à cause du trigger SECURITY INVOKER
// Méthode : compare stock attendu (somme des mouvements) vs actuel
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ocjanwejwpezkhevkfyh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jamFud2Vqd3BlemtoZXZrZnloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA5MzI0OSwiZXhwIjoyMDk0NjY5MjQ5fQ.dIStaHcRmpN4vO5lO9Yvh1DOUss1qaMksE9oVJWQZ6E'
);

// Tous les mouvements NON-vente NON-annulation_vente (= ceux gérés par fix_data.mjs)
// qui ont été créés avant le fix SQL (~20:17 UTC le 29/05)
const CUTOFF = '2026-05-29T20:17:00.000Z';

const { data: mvts } = await supabase
  .from('stock_movements')
  .select('product_id, qty, reference_type, created_at')
  .not('reference_type', 'in', '(sale,annulation_vente)')
  .lt('created_at', CUTOFF);

// Grouper par produit
const delta = {};
for (const m of mvts ?? []) {
  delta[m.product_id] = (delta[m.product_id] || 0) + m.qty;
}

console.log(`\nProduits à corriger : ${Object.keys(delta).filter(k => delta[k] !== 0).length}`);

let fixed = 0;
for (const [pid, d] of Object.entries(delta)) {
  if (d === 0) continue;

  const { data: prod } = await supabase
    .from('products').select('reference,name,stock_qty').eq('id', pid).single();

  const newQty = prod.stock_qty + d;
  console.log(`  ${prod.reference} "${prod.name?.slice(0,25)}" : ${prod.stock_qty} + (${d}) → ${newQty}`);

  const { error } = await supabase
    .from('products').update({ stock_qty: newQty }).eq('id', pid);

  if (!error) fixed++;
  else console.log(`    ❌ Erreur: ${error.message}`);
}

console.log(`\n✅ ${fixed} produits corrigés`);
