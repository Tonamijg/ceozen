'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  Smartphone, Eye, EyeOff, Loader2, Zap, Shield, TrendingUp
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(
        authError.message.includes('Invalid login')
          ? 'Email ou mot de passe incorrect.'
          : authError.message
      );
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* ---- Panneau gauche (branding) — caché sur mobile ---- */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        {/* Fond décoratif */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-neon-blue/5 via-neon-violet/5 to-transparent"
          aria-hidden
        />
        <div
          className="absolute top-1/3 -left-20 w-96 h-96 bg-neon-blue/10 rounded-full blur-3xl"
          aria-hidden
        />
        <div
          className="absolute bottom-1/4 right-0 w-72 h-72 bg-neon-violet/10 rounded-full blur-3xl"
          aria-hidden
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neon-blue/20 border border-neon-blue/30 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-neon-blue" />
            </div>
            <span className="text-3xl font-black tracking-tight">
              <span className="gradient-text">CEO</span>
              <span className="text-white font-light">ZEN</span>
            </span>
          </div>
          <p className="mt-3 text-slate-400 text-sm font-medium">
            Sell. Manage. Grow.
          </p>
        </div>

        {/* Features */}
        <div className="relative z-10 space-y-6">
          {[
            {
              icon: TrendingUp,
              title: 'Ventes en temps réel',
              desc: 'Suivez votre chiffre d\'affaires instant par instant',
              color: 'text-neon-blue',
              bg: 'bg-neon-blue/10',
            },
            {
              icon: Shield,
              title: 'Stock sécurisé',
              desc: 'Alertes automatiques sur les stocks bas',
              color: 'text-neon-violet',
              bg: 'bg-neon-violet/10',
            },
            {
              icon: Zap,
              title: 'Rapports instantanés',
              desc: 'PDF & Excel générés en un clic',
              color: 'text-emerald-400',
              bg: 'bg-emerald-500/10',
            },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-4">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', f.bg)}>
                <f.icon className={cn('w-5 h-5', f.color)} />
              </div>
              <div>
                <p className="font-semibold text-slate-200">{f.title}</p>
                <p className="text-sm text-slate-500 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="relative z-10 space-y-3">
          {/* SenseLab logo */}
          <div className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
            <img src="/senselab-logo.svg" alt="SenseLab" className="h-5 w-auto invert brightness-200" />
          </div>
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} CEOZEN by SenseLab — Afrique de l&apos;Ouest
          </p>
        </div>
      </div>

      {/* ---- Panneau droit (formulaire) ---- */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">
          {/* Header mobile */}
          <div className="lg:hidden text-center">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-neon-blue/20 border border-neon-blue/30 flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-neon-blue" />
              </div>
              <span className="text-2xl font-black tracking-tight">
                <span className="gradient-text">CEO</span>
                <span className="text-white font-light">ZEN</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">Sell. Manage. Grow.</p>
          </div>

          {/* Card formulaire */}
          <div className="card p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Connexion</h1>
              <p className="text-slate-500 text-sm mt-1">
                Accède à ton tableau de bord
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="label">
                  Adresse email
                </label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="admin@ktech.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>

              {/* Mot de passe */}
              <div>
                <label htmlFor="password" className="label">
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    className="input pr-11"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={showPwd ? 'Masquer' : 'Afficher'}
                  >
                    {showPwd ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Erreur */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <Shield className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full py-3 text-base"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connexion…
                  </>
                ) : (
                  'Se connecter'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-600">
            Problème de connexion ? Contacte l&apos;administrateur.
          </p>
        </div>
      </div>
    </div>
  );
}
