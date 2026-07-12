// ============================================================
// API Route POST /api/troc/update
// Corrige un troc déjà enregistré (erreur de saisie).
// Réservé admin/super_admin. Utilise SERVICE ROLE KEY pour
// synchroniser le produit "reprise" lié (nom/référence/prix achat).
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  // 1. Vérifier l'utilisateur connecté + rôle admin
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Modification réservée aux administrateurs' }, { status: 403 });
  }

  // 2. Client service role (bypasse RLS pour synchroniser le produit repris)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    trocId,
    clientName, clientPhone,
    productGivenPrice,
    productReceivedId, productReceivedName, productReceivedRef, productReceivedValue,
    paymentMethod, acompte, creditDueDate, trocDate, notes,
  } = await req.json();

  if (!trocId) return NextResponse.json({ error: 'trocId manquant' }, { status: 400 });

  const givenPriceNum    = parseFloat(productGivenPrice);
  const receivedValueNum = parseFloat(productReceivedValue);
  const complementNum    = givenPriceNum - receivedValueNum;
  const acompteNum       = parseFloat(acompte ?? '0') || 0;
  const isSettled        = acompteNum >= complementNum;

  try {
    const { error: trocErr } = await admin.from('trocs').update({
      client_name:             clientName  || null,
      client_phone:            clientPhone || null,
      product_given_price:     givenPriceNum,
      product_received_name:   productReceivedName,
      product_received_ref:    productReceivedRef || null,
      product_received_value:  receivedValueNum,
      complement:               complementNum,
      acompte:                  acompteNum,
      payment_method:           paymentMethod,
      is_settled:               isSettled,
      credit_due_date:          !isSettled && creditDueDate ? creditDueDate : null,
      troc_date:                trocDate || null,
      notes:                    notes || null,
    }).eq('id', trocId);
    if (trocErr) throw new Error(`Troc: ${trocErr.message}`);

    // Synchronise le produit "reprise" lié (best-effort — ne bloque pas la correction si absent)
    if (productReceivedId) {
      await admin.from('products').update({
        name:      productReceivedName,
        reference: productReceivedRef?.trim() || undefined,
        buy_price: receivedValueNum,
      }).eq('id', productReceivedId);
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
