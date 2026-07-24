'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { AuthShell, AuthField, AuthSubmit, AuthMessage } from '@/components/ui/AuthShell';
import { BfcacheGuard } from '@/components/ui/BfcacheGuard';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserSupabase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user) {
        const { data: plan } = await supabase
          .from('users_plan')
          .select('plan_tier')
          .eq('user_id', data.user.id)
          .single();

        setUser(
          data.user.id,
          data.user.email ?? '',
          (plan?.plan_tier ?? 'free') as 'free' | 'pro' | 'business',
        );
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="로그인"
      footer={
        <p className="text-sm text-muted">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="text-foreground font-medium hover:underline">
            회원가입
          </Link>
        </p>
      }
    >
      <BfcacheGuard />
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          label="이메일"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="hello@example.com"
          autoComplete="email"
        />
        <AuthField
          label="비밀번호"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          autoComplete="current-password"
        />
        {error && <AuthMessage type="error" text={error} />}
        <AuthSubmit loading={loading}>로그인</AuthSubmit>
      </form>
    </AuthShell>
  );
}
