// ============================================================
// API Route POST /api/super-admin/sql
// Exécute une requête SQL arbitraire — réservé au super_admin
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

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

  // 3. Client service role pour exécuter le SQL
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { query } = await req.json();

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Requête vide' }, { status: 400 });
  }

  try {
    // Utiliser la fonction rpc exec_sql si disponible, sinon passer par postgrest
    const { data, error } = await admin.rpc('exec_sql', { sql_query: query });

    if (error) {
      // Fallback : essayer directement via from().select() pour les SELECT simples
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    return NextResponse.json({ data: rows, rowCount: rows.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
