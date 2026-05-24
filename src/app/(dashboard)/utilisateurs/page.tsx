'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn, formatDateTime } from '@/lib/utils';
import type { Profile } from '@/types';
import {
  Users, Shield, UserCheck, UserX, Loader2,
  CheckCircle2, Edit2, ChevronDown, UserPlus, X, Eye, EyeOff
} from 'lucide-react';

type UserRole = 'admin' | 'collaborateur';

export default function UtilisateursPage() {
  const supabase = createClient();

  const [profiles,   setProfiles]   = useState<Profile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [currentId,  setCurrentId]  = useState<string>('');
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [newRole,    setNewRole]    = useState<UserRole>('collaborateur');
  const [saving,     setSaving]     = useState(false);
  const [success,    setSuccess]    = useState('');

  // Modal création utilisateur
  const [showModal,  setShowModal]  = useState(false);
  const [formData,   setFormData]   = useState({ full_name: '', email: '', password: '', phone: '', role: 'collaborateur' as UserRole });
  const [showPwd,    setShowPwd]    = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: { user } }, { data: profs }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('*').order('created_at'),
    ]);
    setCurrentId(user?.id ?? '');
    setProfiles((profs as Profile[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function handleRoleUpdate() {
    if (!editingId) return;
    setSaving(true);
    await supabase.from('profiles').update({ role: newRole }).eq('id', editingId);
    setSaving(false);
    setEditingId(null);
    setSuccess('Rôle mis à jour !');
    setTimeout(() => setSuccess(''), 3000);
    load();
  }

  async function toggleActive(profile: Profile) {
    await supabase.from('profiles').update({ is_active: !profile.is_active }).eq('id', profile.id);
    load();
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateErr('');
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (!res.ok) { setCreateErr(json.error ?? 'Erreur inconnue'); setCreating(false); return; }
      setShowModal(false);
      setFormData({ full_name: '', email: '', password: '', phone: '', role: 'collaborateur' });
      setSuccess('Utilisateur créé avec succès !');
      setTimeout(() => setSuccess(''), 4000);
      load();
    } catch {
      setCreateErr('Erreur réseau. Réessaie.');
    }
    setCreating(false);
  }

  const admins        = profiles.filter((p) => p.role === 'admin');
  const collaborateurs = profiles.filter((p) => p.role === 'collaborateur');

  return (
    <div className="space-y-6 max-w-3xl">

      {/* ── Modal création utilisateur ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Nouvel utilisateur</h2>
              <button onClick={() => { setShowModal(false); setCreateErr(''); }} className="text-slate-500 hover:text-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              {/* Nom */}
              <div>
                <label className="label">Nom complet *</label>
                <input className="input" placeholder="Jean Dupont" required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
              </div>

              {/* Email */}
              <div>
                <label className="label">Adresse email *</label>
                <input className="input" type="email" placeholder="jean@boutique.com" required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>

              {/* Mot de passe */}
              <div>
                <label className="label">Mot de passe *</label>
                <div className="relative">
                  <input className="input pr-11" type={showPwd ? 'text' : 'password'}
                    placeholder="Min. 6 caractères" required minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Téléphone */}
              <div>
                <label className="label">Téléphone <span className="text-slate-600">(optionnel)</span></label>
                <input className="input" placeholder="+229 00 00 00 00"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>

              {/* Rôle */}
              <div>
                <label className="label">Rôle *</label>
                <div className="relative">
                  <select className="input appearance-none pr-8"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}>
                    <option value="collaborateur">Collaborateur</option>
                    <option value="admin">Admin</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>

              {/* Erreur */}
              {createErr && (
                <p className="text-sm text-red-400 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  {createErr}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={creating} className="btn-primary flex-1 py-2.5">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Créer le compte'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setCreateErr(''); }}
                  className="btn-secondary py-2.5 px-4">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
          <CheckCircle2 className="w-5 h-5" />
          {success}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total utilisateurs', value: profiles.length,       icon: Users,     color: 'text-neon-blue',   bg: 'bg-neon-blue/10' },
          { label: 'Administrateurs',    value: admins.length,          icon: Shield,    color: 'text-neon-violet', bg: 'bg-neon-violet/10' },
          { label: 'Collaborateurs',     value: collaborateurs.length,  icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', s.bg)}>
              <s.icon className={cn('w-4.5 h-4.5', s.color)} size={18} />
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table utilisateurs */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
          <h3 className="font-semibold text-slate-200">Liste des utilisateurs</h3>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500">{profiles.length} compte(s)</p>
            <button onClick={() => { setShowModal(true); setCreateErr(''); }}
              className="btn-primary py-1.5 px-3 text-xs flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              Ajouter
            </button>
          </div>
        </div>

        <div className="divide-y divide-dark-600">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-dark-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-dark-700 rounded w-1/3" />
                  <div className="h-2.5 bg-dark-700 rounded w-1/4" />
                </div>
                <div className="h-5 w-20 bg-dark-700 rounded-full" />
              </div>
            ))
          ) : (
            profiles.map((profile) => (
              <div key={profile.id} className="flex items-center gap-4 px-5 py-4 hover:bg-dark-700/30 transition-colors">
                {/* Avatar */}
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border',
                  profile.role === 'admin'
                    ? 'bg-neon-blue/10 border-neon-blue/20'
                    : 'bg-neon-violet/10 border-neon-violet/20'
                )}>
                  <span className={cn(
                    'text-sm font-bold',
                    profile.role === 'admin' ? 'text-neon-blue' : 'text-neon-violet'
                  )}>
                    {profile.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-200 truncate">{profile.full_name}</p>
                    {profile.id === currentId && (
                      <span className="badge badge-blue text-[10px]">Vous</span>
                    )}
                    {!profile.is_active && (
                      <span className="badge badge-red text-[10px]">Désactivé</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {profile.phone ?? 'Pas de téléphone'} · Inscrit {formatDateTime(profile.created_at)}
                  </p>
                </div>

                {/* Rôle */}
                {editingId === profile.id ? (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as UserRole)}
                        className="input text-xs py-1.5 pr-7 appearance-none"
                      >
                        <option value="admin">Admin</option>
                        <option value="collaborateur">Collaborateur</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
                    </div>
                    <button onClick={handleRoleUpdate} disabled={saving} className="btn-primary py-1.5 text-xs min-w-16">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
                    </button>
                    <button onClick={() => setEditingId(null)} className="btn-secondary py-1.5 text-xs">
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'badge text-xs',
                      profile.role === 'admin' ? 'badge-blue' : 'badge-violet'
                    )}>
                      {profile.role === 'admin' ? 'Admin' : 'Collaborateur'}
                    </span>

                    {profile.id !== currentId && (
                      <>
                        <button
                          onClick={() => { setEditingId(profile.id); setNewRole(profile.role); }}
                          className="text-slate-500 hover:text-neon-blue transition-colors"
                          title="Modifier le rôle"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(profile)}
                          className={cn(
                            'transition-colors',
                            profile.is_active
                              ? 'text-slate-500 hover:text-red-400'
                              : 'text-slate-500 hover:text-emerald-400'
                          )}
                          title={profile.is_active ? 'Désactiver' : 'Réactiver'}
                        >
                          {profile.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card p-5 bg-neon-blue/5 border-neon-blue/20">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-neon-blue flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-200">Gestion des accès</p>
            <p className="text-xs text-slate-500 mt-1">
              Les comptes créés sont actifs immédiatement — aucune vérification email requise.
              Le collaborateur peut se connecter directement avec l&apos;email et le mot de passe définis.
              Tu peux modifier le rôle ou désactiver un compte à tout moment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
