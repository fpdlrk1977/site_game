'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase';
import type { PlanTier } from '@/store/userStore';
import { SiteShell } from '@/components/ui/SiteShell';
import { PricingModal } from '@/components/ui/PricingModal';
import { usePricingModal } from '@/store/pricingModalStore';

const PLAN_LABELS: Record<PlanTier, { label: string; color: string }> = {
  free:     { label: 'Free',     color: 'text-muted bg-background' },
  pro:      { label: 'Pro',      color: 'text-primary bg-primary/10' },
  business: { label: 'Business', color: 'text-cyan-300 bg-cyan-900/30' },
};

interface Props {
  email: string;
  displayName: string;
  planTier: PlanTier;
}

export function AccountClient({ email, displayName, planTier }: Props) {
  const [name, setName] = useState(displayName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const plan = PLAN_LABELS[planTier];
  const showPricing = usePricingModal((s) => s.show);

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setNameSaving(true);
    setNameMsg(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
    setNameSaving(false);
    setNameMsg(error ? { text: 'Save failed: ' + error.message, ok: false } : { text: 'Saved.', ok: true });
  };

  const handleChangePw = async () => {
    setPwMsg(null);
    if (!currentPw) { setPwMsg({ text: 'Enter your current password.', ok: false }); return; }
    if (pw.length < 8) { setPwMsg({ text: 'New password must be at least 8 characters.', ok: false }); return; }
    if (pw !== pwConfirm) { setPwMsg({ text: 'New passwords don’t match.', ok: false }); return; }
    setPwSaving(true);
    const supabase = createBrowserSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPw });
    if (signInError) {
      setPwSaving(false);
      setPwMsg({ text: 'Current password is incorrect.', ok: false });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) {
      setPwMsg({ text: 'Update failed: ' + error.message, ok: false });
    } else {
      setPwMsg({ text: 'Password updated.', ok: true });
      setCurrentPw('');
      setPw('');
      setPwConfirm('');
    }
  };

  const nav = (
    <div className="max-w-xl mx-auto px-6 h-full flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem]">
        <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: 'linear-gradient(120deg,#6a4dff,#39d0ea)' }}>⬡</span> Park3D
      </Link>
      <Link href="/dashboard" className="text-sm text-foreground/70 hover:text-foreground transition-colors">← Dashboard</Link>
    </div>
  );

  return (
    <SiteShell nav={nav}>
      <PricingModal />
      <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
        <h1 className="text-2xl font-bold">Account settings</h1>

        {/* 프로필 */}
        <section className="bg-surface border border-border rounded-xs p-6 space-y-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Profile</h2>

          {/* 이메일 */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Email</label>
            <div className="flex items-center px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-muted select-all">
              {email}
            </div>
            <p className="text-[11px] text-muted/60 mt-1">Email can’t be changed.</p>
          </div>

          {/* 표시 이름 */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Display name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                placeholder="Enter your name"
                maxLength={40}
                className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
              <button
                onClick={handleSaveName}
                disabled={nameSaving || !name.trim()}
                className="px-4 py-2.5 bg-primary hover:bg-primary/80 disabled:bg-background disabled:text-muted text-white text-sm font-medium rounded-xs transition-colors shrink-0"
              >
                {nameSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameMsg && (
              <p className={`text-xs mt-1.5 ${nameMsg.ok ? 'text-success' : 'text-danger'}`}>
                {nameMsg.text}
              </p>
            )}
          </div>
        </section>

        {/* 보안 */}
        <section className="bg-surface border border-border rounded-xs p-6 space-y-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">Security</h2>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Current password</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Current password"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">New password</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Confirm new password</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChangePw()}
              placeholder="Re-enter new password"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          {pwMsg && (
            <p className={`text-xs ${pwMsg.ok ? 'text-success' : 'text-danger'}`}>
              {pwMsg.text}
            </p>
          )}

          <button
            onClick={handleChangePw}
            disabled={pwSaving || !currentPw || !pw || !pwConfirm}
            className="w-full py-2.5 bg-background hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-sm font-medium rounded-xs border border-border transition-all"
          >
            {pwSaving ? 'Updating…' : 'Change password'}
          </button>
        </section>

        {/* 플랜 */}
        <section className="bg-surface border border-border rounded-xs p-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Plan</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${plan.color}`}>
                {plan.label}
              </span>
              <span className="text-sm text-muted">Current plan</span>
            </div>
            {planTier === 'free' && (
              <button
                onClick={showPricing}
                className="text-xs px-3 py-1.5 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all"
              >
                Upgrade
              </button>
            )}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
