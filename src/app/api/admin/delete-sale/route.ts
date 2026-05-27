// ============================================================
// CEOZEN — API Route DELETE /api/admin/delete-sale
// Supprime une vente + restaure le stock automatiquement
// Réservé aux admins. Utilise SERVICE ROLE KEY (bypasse RLS).
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
    .from('profiles').select('role').eq('id', user.id).single();

  if (callerProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé — réservé aux admins' }, { status: 403 });
  }

  const { sale_id, sale_number } = await req.json();
  if (!sale_id) {
    return NextResponse.json({ error: 'sale_id manquant' }, { status: 400 });
  }

  // 2. Client service role (bypasse RLS)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 3. Récupérer les articles pour restaurer le stock
  const { data: items, error: itemsErr } = await admin
    .from('sale_items').select('product_id, qty').eq('sale_id', sale_id);

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // 4. Insérer mouvements stock positifs (entrée = restauration)
  if (items && items.length > 0) {
    const { error: mvtErr } = await admin.from('stock_movements').insert(
      items.map((item: { product_id: string; qty: number }) => ({
        product_id:     item.product_id,
        type:           'entree',
        qty:            item.qty,
        reference_id:   sale_id,
        reference_type: 'annulation_vente',
        notes:          `Annulation vente ${sale_number ?? sale_id}`,
        created_by:     user.id,
      }))
    );
    if (mvtErr) {
      return NextResponse.json({ error: mvtErr.message }, { status: 500 });
    }
  }

  // 5. Supprimer les avoirs liés (contrainte on delete restrict)
  const { error: avoirErr } = await admin
    .from('sale_avoirs').delete().eq('sale_id', sale_id);

  if (avoirErr) {
    return NextResponse.json({ error: avoirErr.message }, { status: 500 });
  }

  // 6. Supprimer la vente (cascade → sale_items auto)
  const { error: saleErr } = await admin
    .from('sales').delete().eq('id', sale_id);

  if (saleErr) {
    return NextResponse.json({ error: saleErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
