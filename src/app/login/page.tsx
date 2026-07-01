'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    const supabase = createBrowserSupabase();

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage({ type: 'info', text: '이메일을 확인하여 인증을 완료해주세요.' });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user) {
        const { data: plan } = await supabase
          .from('users_plan')
          .select('plan_tier')
          .eq('user_id', data.user.id)
          .single();

        setUser(data.user.id, data.user.email ?? '', (plan?.plan_tier ?? 'free') as 'free' | 'pro' | 'business');
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : '오류가 발생했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* 배경 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 mb-4 shadow-lg shadow-violet-500/25">
            <span className="text-3xl">⬡</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Park3D</h1>
          <p className="text-muted text-sm mt-1">노코드 3D 공간 제작 플랫폼</p>
        </div>

        {/* 카드 */}
        <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-modal">
          <h2 className="text-lg font-semibold text-foreground mb-6">
            {isSignUp ? '새 계정 만들기' : '로그인'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="hello@example.com"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-foreground placeholder-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            {message && (
              <p className={`text-sm rounded-lg px-3 py-2 ${
                message.type === 'error'
                  ? 'text-danger bg-danger/10 border border-danger/20'
                  : 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/20'
              }`}>
                {message.text}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
            >
              {loading ? '처리 중...' : isSignUp ? '계정 만들기' : '로그인'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setMessage(null); }}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
