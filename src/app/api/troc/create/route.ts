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
    selectedProdId, selectedProdName, selectedProdStock,
    givenPrice,
    receivedName, receivedRef, receivedValue,
    complement, acompte, paymentMethod, creditDueDate, trocDate, notes,
    trocNumber,
  } = await req.json();

  const complementNum = parseFloat(complement);
  const acompteNum    = parseFloat(acompte ?? '0') || 0;
  const isSettled     = acompteNum >= complementNum;

  try {
    // 3. Créer le produit repris
    const { data: newProd, error: prodErr } = await admin
      .from('products')
      .insert({
        name:        receivedName,
        reference:   receivedRef?.trim() || (() => {
          const now = new Date();
          return `TRC-${String(now.getFullYear()).slice(2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        })(),
        buy_price:   parseFloat(receivedValue),
        sell_price:  parseFloat(receivedValue),
        stock_qty:   1,
        stock_min:   1,
        unit:        'unité',
        description: `Reprise troc — ${clientName || 'Client'}`,
        is_active:   true,
      })
      .select()
      .single();
    if (prodErr) throw new Error(`Produit: ${prodErr.message}`);

    // 4. Décrémenter le stock du produit donné
    const { error: stockErr } = await admin
      .from('products')
      .update({ stock_qty: Math.max(0, selectedProdStock - 1) })
      .eq('id', selectedProdId);
    if (stockErr) throw new Error(`Stock: ${stockErr.message}`);

    // 5. Mouvements de stock
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
        unit_cost:      parseFloat(receivedValue),
        reference_type: 'troc',
        notes:          `Troc ${trocNumber} — repris au client`,
        created_by:     user.id,
      },
    ]);
    if (mvtErr) throw new Error(`Mouvements: ${mvtErr.message}`);

    // 6. Enregistrer le troc
    const { error: trocErr } = await admin.from('trocs').insert({
      troc_number:             trocNumber,
      client_name:             clientName  || null,
      client_phone:            clientPhone || null,
      product_given_id:        selectedProdId,
      product_given_name:      selectedProdName,
      product_given_price:     parseFloat(givenPrice),
      product_received_id:     newProd.id,
      product_received_name:   receivedName,
      product_received_ref:    receivedRef || null,
      product_received_value:  parseFloat(receivedValue),
      complement:              complementNum,
      acompte:                 acompteNum,
      payment_method:          paymentMethod,
      is_settled:              isSettled,
      credit_due_date:         !isSettled && creditDueDate ? creditDueDate : null,
      troc_date:               trocDate || null,
      notes:                   notes || null,
    });
    if (trocErr) throw new Error(`Troc: ${trocErr.message}`);

    // 7. Sauvegarder le client si nom fourni
    if (clientName?.trim()) {
      await admin.from('clients')
        .upsert({ name: clientName.trim() }, { onConflict: 'name', ignoreDuplicates: true });
    }

    return NextResponse.json({ success: true, trocNumber, newProdId: newProd.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
