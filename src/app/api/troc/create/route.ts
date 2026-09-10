// ============================================================
// API Route POST /api/troc/create
// Crée un troc complet (produit repris + stock + enregistrement)
// Utilise SERVICE ROLE KEY pour bypasser RLS.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  // 1. Vérifier l'utilisateur connecté
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // 2. Client service role (bypasse RLS)
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    clientName, clientPhone,
    selectedProdId, selectedProdName,
    givenPrice,
    receivedName, receivedRef, receivedValue,
    complement, acompte, paymentMethod, creditDueDate, trocDate, notes,
  } = await req.json();

  const complementNum   = parseFloat(complement);
  const acompteNum      = parseFloat(acompte ?? '0') || 0;
  const givenPriceNum   = parseFloat(givenPrice);
  const receivedValueNum = parseFloat(receivedValue);
  const isSettled     = acompteNum >= complementNum;

  if (
    !Number.isFinite(complementNum) ||
    !Number.isFinite(acompteNum) || acompteNum < 0 ||
    !Number.isFinite(givenPriceNum) || givenPriceNum < 0 ||
    !Number.isFinite(receivedValueNum) || receivedValueNum < 0
  ) {
    return NextResponse.json({ error: 'Montants invalides.' }, { status: 400 });
  }
  if (!selectedProdId || !receivedName?.trim() || !paymentMethod) {
    return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 });
  }

  try {
    // 3. Numéro de troc généré côté base via une séquence Postgres
    // (public.next_troc_number(), migration 008) — atomique même en cas de
    // créations concurrentes, contrairement à l'ancien calcul côté client
    // "dernier numéro + 1" (MÉT-7, corrigé le 2026-09-10).
    const { data: trocNumber, error: numErr } = await admin.rpc('next_troc_number');
    if (numErr || !trocNumber) throw new Error(`Numérotation: ${numErr?.message ?? 'échec'}`);

    // 4. Créer le produit repris
    const { data: newProd, error: prodErr } = await admin
      .from('products')
      .insert({
        name:        receivedName,
        reference:   receivedRef?.trim() || (() => {
          const now = new Date();
          return `TRC-${String(now.getFullYear()).slice(2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        })(),
        buy_price:   receivedValueNum,
        sell_price:  receivedValueNum,
        // stock_qty démarre à 0 : le mouvement 'entree' inséré plus bas
        // (étape stock_movements) le porte à 1 via le trigger DB
        // after_stock_movement. Ne pas le mettre à 1 ici, sous peine de
        // compter l'entrée deux fois (bug corrigé le 2026-09-10).
        stock_qty:   0,
        stock_min:   1,
        unit:        'unité',
        description: `Reprise troc — ${clientName || 'Client'}`,
        is_active:   true,
      })
      .select()
      .single();
    if (prodErr) throw new Error(`Produit: ${prodErr.message}`);

    // 5. Le stock du produit donné est décrémenté uniquement via le
    // mouvement 'sortie' inséré ci-dessous (le trigger DB
    // after_stock_movement applique stock_qty = stock_qty - 1). Un update
    // direct ici en plus du mouvement comptait la sortie deux fois (bug
    // corrigé le 2026-09-10) — voir aussi MÉT-5 (audit) pour le contrôle de
    // stock non atomique côté client, non traité par ce correctif.

    // 6. Mouvements de stock
    const { error: mvtErr } = await admin.from('stock_movements').insert([
      {
        product_id:     selectedProdId,
        type:           'sortie',
        qty:            -1,
        reference_type: 'troc',
        notes:          `Troc ${trocNumber} — donné au client`,
        created_by:     user.id,
      },
      {
        product_id:     newProd.id,
        type:           'entree',
        qty:            1,
        unit_cost:      receivedValueNum,
        reference_type: 'troc',
        notes:          `Troc ${trocNumber} — repris au client`,
        created_by:     user.id,
      },
    ]);
    if (mvtErr) throw new Error(`Mouvements: ${mvtErr.message}`);

    // 7. Enregistrer le troc
    const { error: trocErr } = await admin.from('trocs').insert({
      troc_number:             trocNumber,
      client_name:             clientName  || null,
      client_phone:            clientPhone || null,
      product_given_id:        selectedProdId,
      product_given_name:      selectedProdName,
      product_given_price:     givenPriceNum,
      product_received_id:     newProd.id,
      product_received_name:   receivedName,
      product_received_ref:    receivedRef || null,
      product_received_value:  receivedValueNum,
      complement:              complementNum,
      acompte:                 acompteNum,
      payment_method:          paymentMethod,
      is_settled:              isSettled,
      credit_due_date:         !isSettled && creditDueDate ? creditDueDate : null,
      troc_date:               trocDate || null,
      notes:                   notes || null,
    });
    if (trocErr) throw new Error(`Troc: ${trocErr.message}`);

    // 8. Sauvegarder le client si nom fourni
    if (clientName?.trim()) {
      await admin.from('clients')
        .upsert({ name: clientName.trim() }, { onConflict: 'name', ignoreDuplicates: true });
    }

    return NextResponse.json({ success: true, trocNumber, newProdId: newProd.id });
  } catch (e: unknown) {
    console.error('[troc/create]', e);
    return NextResponse.json({ error: 'Erreur lors de la création du troc.' }, { status: 500 });
  }
}
