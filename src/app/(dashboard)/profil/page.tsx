'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
import { User, Save, Loader2, CheckCircle2 } from 'lucide-react';

export default function ProfilPage() {
  const supabase = createClient();

  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone,    setPhone]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setProfile(data as Profile);
            setFullName(data.full_name ?? '');
            setPhone(data.phone ?? '');
          }
        });
    });
  }, [supabase]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    await supabase
      .from('profiles')
      .update({ full_name: fullName, phone })
      .eq('id', profile.id);

    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  return (
    <div className="max-w-lg space-y-6">
      {success && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
          <CheckCircle2 className="w-5 h-5" />
          Profil mis à jour !
        </div>
      )}

      <div className="card p-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-neon-violet/20 border border-neon-violet/30 flex items-center justify-center">
            <span className="text-2xl font-bold text-neon-violet">
              {fullName.charAt(0)?.toUpperCase() ?? <User />}
            </span>
          </div>
          <div>
            <p className="font-semibold text-white text-lg">{fullName || '—'}</p>
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              profile?.role === 'super_admin' ? 'text-yellow-400' :
              profile?.role === 'admin' ? 'text-neon-blue' : 'text-neon-violet'
            }`}>
              {profile?.role ?? '…'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Nom complet</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
              placeholder="Ton nom complet"
              required
            />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
              placeholder="+225 07 00 00 00 00"
            />
          </div>
          <div>
            <label className="label">Rôle</label>
            <input
              type="text"
              value={
                profile?.role === 'super_admin' ? '⚡ Super Admin' :
                profile?.role === 'admin' ? 'Administrateur' : 'Collaborateur'
              }
              className="input opacity-50 cursor-not-allowed"
              disabled
            />
            <p className="text-xs text-slate-600 mt-1">Le rôle est géré par l&apos;administrateur.</p>
          </div>

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        </form>
      </div>
    </div>
  );
}
