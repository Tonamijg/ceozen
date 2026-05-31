// ============================================================
// CEOZEN — API Route POST /api/creances/send-reminders
// Envoie un email récapitulatif des créances & dettes en retard
// ============================================================
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}

function formatDate(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function POST() {
  const resendKey  = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;

  if (!resendKey || !notifyEmail) {
    return NextResponse.json({ error: 'Variables RESEND_API_KEY / NOTIFY_EMAIL manquantes' }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ── Récupérer toutes les créances non soldées ────────────────────────────────
  const [
    { data: creances },
    { data: dettes },
    { data: initiales },
  ] = await Promise.all([
    supabase.from('v_creances').select('*').eq('is_settled', false).order('created_at'),
    supabase.from('v_dettes').select('*').eq('is_settled', false).order('expense_date'),
    supabase.from('creances_initiales').select('*').eq('is_settled', false).order('since_date'),
  ]);

  const overdueCreances = (creances ?? []).filter((c: Record<string, unknown>) => c.is_overdue);
  const allDettesOverdue = (dettes ?? []).filter((d: Record<string, unknown>) => d.is_overdue);
  const now = new Date();
  const overdueInitiales = (initiales ?? []).filter((i: Record<string, unknown>) => {
    const diffDays = (now.getTime() - new Date(i.since_date as string).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 60;
  });

  const totalCreancesEnRetard = overdueCreances.reduce((s: number, c: Record<string, unknown>) => s + (c.amount as number), 0)
    + overdueInitiales.reduce((s: number, i: Record<string, unknown>) => s + (i.amount as number), 0);
  const totalDettesEnRetard   = allDettesOverdue.reduce((s: number, d: Record<string, unknown>) => s + (d.amount as number), 0);

  // ── Construire l'email HTML ──────────────────────────────────────────────────
  const rows = (items: Record<string, unknown>[], type: 'creance' | 'dette' | 'initiale') =>
    items.map(item => {
      if (type === 'creance') {
        return `<tr style="border-bottom:1px solid #2a2a3a;">
          <td style="padding:8px 12px;font-family:monospace;color:#00d4ff;">${item.reference_number}</td>
          <td style="padding:8px 12px;color:#e2e8f0;">${item.client_name ?? '—'}</td>
          <td style="padding:8px 12px;color:#94a3b8;">${formatDate(item.credit_due_date as string ?? '')}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;color:#fff;">${fmt(item.amount as number)}</td>
        </tr>`;
      }
      if (type === 'initiale') {
        return `<tr style="border-bottom:1px solid #2a2a3a;">
          <td style="padding:8px 12px;color:#a78bfa;">Situation initiale</td>
          <td style="padding:8px 12px;color:#e2e8f0;">${item.client_name}</td>
          <td style="padding:8px 12px;color:#94a3b8;">${formatDate(item.since_date as string)} (+60j)</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;color:#fff;">${fmt(item.amount as number)}</td>
        </tr>`;
      }
      // dette
      return `<tr style="border-bottom:1px solid #2a2a3a;">
        <td style="padding:8px 12px;color:#e2e8f0;">${item.description}</td>
        <td style="padding:8px 12px;color:#94a3b8;">${item.supplier_name ?? '—'}</td>
        <td style="padding:8px 12px;color:#f87171;">${formatDate(item.credit_due_date as string ?? '')}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:#fff;">${fmt(item.amount as number)}</td>
      </tr>`;
    }).join('');

  const hasAnything = overdueCreances.length + overdueInitiales.length + allDettesOverdue.length > 0;

  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="background:#0f0f1a;color:#e2e8f0;font-family:sans-serif;margin:0;padding:24px;">
  <div style="max-width:680px;margin:auto;">
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:16px;padding:24px;border:1px solid #2a2a4a;">
      <h1 style="margin:0 0 4px;font-size:20px;color:#00d4ff;">📋 Rappels Créances & Dettes</h1>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;">
        Généré le ${now.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
      </p>

      ${hasAnything ? '' : '<p style="color:#4ade80;font-size:15px;text-align:center;padding:32px;">✅ Aucun impayé en retard !</p>'}

      ${(overdueCreances.length + overdueInitiales.length) > 0 ? `
      <h2 style="font-size:14px;color:#00d4ff;margin:20px 0 8px;border-bottom:1px solid #2a2a4a;padding-bottom:8px;">
        ⚠️ Créances clients en retard — ${fmt(totalCreancesEnRetard)}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#1e1e30;">
          <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:500;">Référence</th>
          <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:500;">Client</th>
          <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:500;">Échéance</th>
          <th style="padding:8px 12px;text-align:right;color:#64748b;font-weight:500;">Montant</th>
        </tr></thead>
        <tbody>
          ${rows(overdueCreances as Record<string, unknown>[], 'creance')}
          ${rows(overdueInitiales as Record<string, unknown>[], 'initiale')}
        </tbody>
      </table>` : ''}

      ${allDettesOverdue.length > 0 ? `
      <h2 style="font-size:14px;color:#fb923c;margin:28px 0 8px;border-bottom:1px solid #2a2a4a;padding-bottom:8px;">
        ⚠️ Dettes fournisseurs en retard — ${fmt(totalDettesEnRetard)}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#1e1e30;">
          <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:500;">Description</th>
          <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:500;">Fournisseur</th>
          <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:500;">Échéance</th>
          <th style="padding:8px 12px;text-align:right;color:#64748b;font-weight:500;">Montant</th>
        </tr></thead>
        <tbody>${rows(allDettesOverdue as Record<string, unknown>[], 'dette')}</tbody>
      </table>` : ''}

      <div style="margin-top:24px;padding:12px;background:#111827;border-radius:10px;font-size:12px;color:#475569;">
        Envoyé depuis <strong style="color:#00d4ff;">CEOZEN</strong> · ceozen.vercel.app
      </div>
    </div>
  </div>
</body></html>`;

  // ── Envoyer l'email ──────────────────────────────────────────────────────────
  const resend = new Resend(resendKey);
  const { error } = await resend.emails.send({
    from:    'CEOZEN <onboarding@resend.dev>',
    to:      notifyEmail,
    subject: `[CEOZEN] Rappel — ${overdueCreances.length + overdueInitiales.length} créance(s), ${allDettesOverdue.length} dette(s) en retard`,
    html,
  });

  if (error) {
    console.error('[send-reminders]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = overdueCreances.length + overdueInitiales.length + allDettesOverdue.length;
  return NextResponse.json({
    ok: true,
    message: count > 0
      ? `Rappel envoyé — ${count} impayé(s) en retard signalé(s).`
      : 'Email envoyé — aucun impayé en retard actuellement.',
  });
}
