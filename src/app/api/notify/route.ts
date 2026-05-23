// ============================================================
// CEOZEN — API Route /api/notify
// Reçoit les événements du front et envoie la notif WhatsApp
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import {
  notifyVente, notifyAvoir, notifyDepense,
  notifyEntreeStock, notifySortieStock,
  notifyTroc, notifyAlertStock,
} from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    let ok = false;
    switch (type) {
      case 'vente':         ok = await notifyVente(data);        break;
      case 'avoir':         ok = await notifyAvoir(data);        break;
      case 'depense':       ok = await notifyDepense(data);      break;
      case 'entree_stock':  ok = await notifyEntreeStock(data);  break;
      case 'sortie_stock':  ok = await notifySortieStock(data);  break;
      case 'troc':          ok = await notifyTroc(data);         break;
      case 'alerte_stock':  ok = await notifyAlertStock(data);   break;
      default:
        return NextResponse.json({ error: 'Type inconnu' }, { status: 400 });
    }

    return NextResponse.json({ ok });
  } catch (e) {
    console.error('[/api/notify]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
