// ============================================================
// API Route POST /api/super-admin/sql
// Exécute une requête SQL en lecture seule (SELECT/CTE) — réservé au
// super_admin. Toute requête de modification (INSERT/UPDATE/DELETE/DDL...)
// est refusée : cet endpoint sert à consulter les données, pas à les
// modifier hors des écrans d'édition dédiés.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Mots-clés qui, s'ils apparaissent n'importe où dans la requête, la
// disqualifient (y compris dans une sous-requête ou un CTE d'un SELECT par
// ailleurs valide) : toute forme d'écriture ou de changement de schéma/droits.
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|merge|drop|alter|truncate|grant|revoke|create|comment|vacuum|reindex|refresh|copy|call|do|execute|into|lock)\b/i;

function assertReadOnlySelect(query: string) {
  const statements = query
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length !== 1) {
    throw new Error('Une seule requête à la fois (pas de point-virgule multiple).');
  }

  const stmt = statements[0];
  if (!/^(select|with)\b/i.test(stmt)) {
    throw new Error('Seules les requêtes SELECT (ou WITH ... SELECT) sont autorisées.');
  }
  if (FORBIDDEN_KEYWORDS.test(stmt)) {
    throw new Error('Requête refusée : mot-clé de modification interdit.');
  }
}

export async function POST(req: NextRequest) {
  // 1. Vérifier l'utilisateur connecté
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // 2. Vérifier que c'est bien un super_admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Accès réservé au Super Admin' }, { status: 403 });
  }

  const { query } = await req.json();

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Requête vide' }, { status: 400 });
  }

  try {
    assertReadOnlySelect(query);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  // Journalisation serveur (auteur + requête) — ne fuite jamais au client.
  console.log(`[super-admin/sql] user=${user.id} query=${query.trim().slice(0, 2000)}`);

  // 3. Client service role pour exécuter le SQL
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Utiliser la fonction rpc exec_sql si disponible, sinon passer par postgrest
    const { data, error } = await admin.rpc('exec_sql', { sql_query: query });

    if (error) {
      console.error('[super-admin/sql] erreur exec_sql:', error.message);
      return NextResponse.json({ error: 'Erreur lors de l\'exécution de la requête.' }, { status: 400 });
    }

    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    return NextResponse.json({ data: rows, rowCount: rows.length });
  } catch (e) {
    console.error('[super-admin/sql] exception:', e);
    return NextResponse.json({ error: 'Erreur interne lors de l\'exécution de la requête.' }, { status: 500 });
  }
}
