// ============================================================
// Script import créances initiales → Supabase
// Usage : node import_creances.mjs
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = 'https://ocjanwejwpezkhevkfyh.supabase.co';
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Variable SUPABASE_SERVICE_ROLE_KEY manquante.');
  console.error('   Lance : $env:SUPABASE_SERVICE_ROLE_KEY="ta_clé" (PowerShell)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Données à importer ───────────────────────────────────────
const creances = [
  { client_name: 'Djibril Pochettes', amount: 75000,  description: 'Créance pour 15C SC',             since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 65000,  description: 'Créance pour Smart 20 SC',         since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 8000,   description: 'Créance restante',                 since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 55000,  description: 'Créance pour S8+ Ven',             since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 50000,  description: 'Créance pour S8 Ven',              since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 110000, description: 'Créance pour iPhone 11 128Go Ven', since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 45000,  description: 'Créance pour ZTE A56 Ven',         since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 67000,  description: 'Créance pour S9+ Ven',             since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 58000,  description: 'Créance pour S9 Ven',              since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 155000, description: 'Créance pour iPhone 12 256Go',     since_date: '2026-05-31' },
  { client_name: 'Djibril Pochettes', amount: 40000,  description: 'Créance pour Redmi',               since_date: '2026-05-31' },
  { client_name: 'Haris',             amount: 135000, description: 'Créance sur Biz 16 Pro Max',        since_date: '2026-05-31' },
  { client_name: 'Haris',             amount: 500000, description: 'Créance pour iPhone 17R',           since_date: '2026-05-31' },
];

// ─── Import ───────────────────────────────────────────────────
async function run() {
  console.log(`\n📋 ${creances.length} créances à importer...\n`);

  let ok = 0;
  let ko = 0;

  for (const c of creances) {
    const { error } = await supabase.from('creances_initiales').insert({
      client_name:  c.client_name,
      amount:       c.amount,
      since_date:   c.since_date,
      description:  c.description,
      is_settled:   false,
    });

    if (error) {
      console.error(`❌ ${c.description} — ${error.message}`);
      ko++;
    } else {
      console.log(`✅ ${c.client_name} | ${c.amount.toLocaleString('fr-FR')} FCFA | ${c.description}`);
      ok++;
    }
  }

  const total = creances.reduce((s, c) => s + c.amount, 0);
  console.log(`\n─────────────────────────────────────────`);
  console.log(`✅ ${ok} importées   ❌ ${ko} échouées`);
  console.log(`💰 Total créances Djibril : ${total.toLocaleString('fr-FR')} FCFA`);
  console.log(`─────────────────────────────────────────\n`);
}

run();
