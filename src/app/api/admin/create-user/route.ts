// ============================================================
// CEOZEN — API Route POST /api/admin/create-user
// Crée un utilisateur Supabase Auth + profil depuis l'app
// Réservé aux admins. Utilise la SERVICE ROLE KEY (server-side uniquement).
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  // 1. Vérifier que le demandeur est un admin connecté
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!['admin', 'super_admin'].includes(callerProfile?.role ?? '')) {
    return NextResponse.json({ error: 'Accès refusé — réservé aux admins' }, { status: 403 });
  }

  // 2. Récupérer les données du formulaire
  const { full_name, email, password, phone, role } = await req.json();

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: 'Nom, email et mot de passe sont requis' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caractères' }, { status: 400 });
  }

  // 3. Créer l'utilisateur avec la clé service role (admin)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // compte actif immédiatement, sans vérification email
    user_metadata: {
      full_name,
      role: role ?? 'collaborateur',
    },
  });

  if (error) {
    const msg = error.message.includes('already registered')
      ? 'Cette adresse email est déjà utilisée'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 4. Mettre à jour le téléphone si fourni
  // (le trigger handle_new_user crée déjà le profil avec full_name + role)
  if (phone) {
    await supabaseAdmin
      .from('profiles')
      .update({ phone })
      .eq('id', data.user.id);
  }

  return NextResponse.json({ ok: true, userId: data.user.id });
}
