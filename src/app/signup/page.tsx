'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes, MousePointerClick, Rocket, Check } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase';
import { useUserStore } from '@/store/userStore';
import { AuthField, AuthSubmit, AuthMessage } from '@/components/ui/AuthShell';
import { BfcacheGuard } from '@/components/ui/BfcacheGuard';

const BENEFITS = [
  { icon: MousePointerClick, text: '드래그 앤 드롭으로 3D 공간 제작' },
  { icon: Boxes, text: '물리 · 애니메이션 · 게임 로직까지 노코드로' },
  { icon: Rocket, text: '클릭 한 번으로 웹에 바로 배포' },
];

export default function SignUpPage() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);
    const supabase = createBrowserSupabase();

    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // 이메일 인증이 꺼져 있으면 session이 즉시 발급된다 → 바로 로그인 상태.
      // 켜져 있으면 session이 없다 → 완료 페이지에서 로그인 안내.
      if (data.session && data.user) {
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
        router.push('/signup/complete?status=active');
      } else {
        router.push('/signup/complete?status=pending');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <BfcacheGuard />
      {/* 좌측 — 서비스 소개 배너 (데스크톱 전용) */}
      <aside className="hidden lg:flex flex-col justify-between w-[46%] max-w-2xl p-12 bg-gradient-to-br from-violet-600 via-violet-600 to-cyan-600 text-white relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-300/20 rounded-full blur-3xl" />
        </div>

        <Link href="/" className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-2xl">
            ⬡
          </div>
          <span className="text-xl font-bold tracking-tight">Park3D</span>
        </Link>

        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight tracking-tight mb-4">
            코딩 없이,
            <br />
            3D 웹을 만들다.
          </h1>
          <p className="text-white/80 text-base leading-relaxed mb-10 max-w-md">
            지금 무료로 가입하고 나만의 3D 공간·게임·인터랙티브 웹사이트를
            직접 만들어 배포해 보세요.
          </p>
          <ul className="space-y-4">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="w-9 h-9 shrink-0 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className="text-white/95 text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-white/60 text-xs">© Park3D — 노코드 3D 공간 제작 플랫폼</p>
      </aside>

      {/* 우측 — 가입 폼 */}
      <main className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          {/* 모바일 로고 (좌측 배너가 숨겨질 때) */}
          <Link href="/" className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xl">
              ⬡
            </div>
            <span className="text-lg font-bold tracking-tight">Park3D</span>
          </Link>

          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1.5">
            회원가입
          </h2>
          <p className="text-muted text-sm mb-8">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">
              로그인
            </Link>
          </p>

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
              placeholder="6자 이상"
              autoComplete="new-password"
              minLength={6}
            />

            {/* 모바일에서는 좌측 배너 혜택이 안 보이므로 간단히 노출 */}
            <ul className="lg:hidden space-y-1.5 pt-1">
              {BENEFITS.map(({ text }) => (
                <li key={text} className="flex items-center gap-2 text-xs text-muted">
                  <Check size={14} className="text-primary shrink-0" strokeWidth={2} />
                  {text}
                </li>
              ))}
            </ul>

            {error && <AuthMessage type="error" text={error} />}
            <AuthSubmit loading={loading}>계정 만들기</AuthSubmit>
          </form>

          <p className="text-muted/70 text-xs mt-6 leading-relaxed">
            가입하면 Park3D의 서비스 약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
