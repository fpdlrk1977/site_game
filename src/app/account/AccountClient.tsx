'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase';
import type { PlanTier } from '@/store/userStore';

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

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setNameSaving(true);
    setNameMsg(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
    setNameSaving(false);
    setNameMsg(error ? { text: '저장 실패: ' + error.message, ok: false } : { text: '저장되었습니다.', ok: true });
  };

  const handleChangePw = async () => {
    setPwMsg(null);
    if (!currentPw) { setPwMsg({ text: '현재 비밀번호를 입력하세요.', ok: false }); return; }
    if (pw.length < 8) { setPwMsg({ text: '새 비밀번호는 8자 이상이어야 합니다.', ok: false }); return; }
    if (pw !== pwConfirm) { setPwMsg({ text: '새 비밀번호가 일치하지 않습니다.', ok: false }); return; }
    setPwSaving(true);
    const supabase = createBrowserSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPw });
    if (signInError) {
      setPwSaving(false);
      setPwMsg({ text: '현재 비밀번호가 올바르지 않습니다.', ok: false });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwSaving(false);
    if (error) {
      setPwMsg({ text: '변경 실패: ' + error.message, ok: false });
    } else {
      setPwMsg({ text: '비밀번호가 변경되었습니다.', ok: true });
      setCurrentPw('');
      setPw('');
      setPwConfirm('');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 배경 장식 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-600/5 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
      </div>

      {/* 헤더 */}
      <header className="relative border-b border-border/60 px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-sidebar/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xs bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm shadow-lg shadow-violet-500/25">
            ⬡
          </div>
          <span className="font-bold text-lg tracking-tight">Park3D</span>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-xs hover:bg-surface"
        >
          ← 대시보드
        </Link>
      </header>

      {/* 본문 */}
      <main className="relative max-w-xl mx-auto px-6 py-12 space-y-6">
        <h1 className="text-2xl font-bold">계정 설정</h1>

        {/* 프로필 */}
        <section className="bg-surface border border-border rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">프로필</h2>

          {/* 이메일 */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">이메일</label>
            <div className="flex items-center px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-muted select-all">
              {email}
            </div>
            <p className="text-[11px] text-muted/60 mt-1">이메일은 변경할 수 없습니다.</p>
          </div>

          {/* 표시 이름 */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">표시 이름</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                placeholder="이름을 입력하세요"
                maxLength={40}
                className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
              <button
                onClick={handleSaveName}
                disabled={nameSaving || !name.trim()}
                className="px-4 py-2.5 bg-primary hover:bg-primary/80 disabled:bg-background disabled:text-muted text-white text-sm font-medium rounded-xs transition-colors shrink-0"
              >
                {nameSaving ? '저장 중…' : '저장'}
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
        <section className="bg-surface border border-border rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">보안</h2>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">현재 비밀번호</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="현재 비밀번호 입력"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">새 비밀번호</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="8자 이상"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xs text-sm text-foreground placeholder-muted/60 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">새 비밀번호 확인</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChangePw()}
              placeholder="동일한 비밀번호 입력"
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
            {pwSaving ? '변경 중…' : '비밀번호 변경'}
          </button>
        </section>

        {/* 플랜 */}
        <section className="bg-surface border border-border rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">플랜</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${plan.color}`}>
                {plan.label}
              </span>
              <span className="text-sm text-muted">현재 플랜</span>
            </div>
            {planTier === 'free' && (
              <Link
                href="/pricing"
                className="text-xs px-3 py-1.5 rounded-xs bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold hover:from-violet-500 hover:to-cyan-500 transition-all"
              >
                업그레이드
              </Link>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
