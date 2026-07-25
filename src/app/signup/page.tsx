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
  { icon: MousePointerClick, text: 'Drag-and-drop 3D creation' },
  { icon: Boxes, text: 'Physics, animation, and game logic — no code' },
  { icon: Rocket, text: 'Publish to the web in one click' },
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
      setError('Password must be at least 6 characters.');
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
      setError(err instanceof Error ? err.message : 'Something went wrong.');
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
        {/* 떠 있는 3D 칩 (장식) */}
        <div className="signup-chip pointer-events-none absolute right-10 top-[46%] w-24 h-24 rounded-xs"
          style={{ background: 'linear-gradient(145deg,#ffffff,#cbd6ff)', boxShadow: '0 30px 60px -18px rgba(0,0,0,.45), inset 0 3px 6px rgba(255,255,255,.6)', transform: 'rotate(-12deg)' }} />
        <style>{`
          @keyframes signupFloat { 0%,100%{ transform: rotate(-12deg) translateY(0); } 50%{ transform: rotate(-6deg) translateY(-14px); } }
          .signup-chip { animation: signupFloat 7s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce){ .signup-chip { animation: none; } }
        `}</style>

        <Link href="/" className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xs bg-white/15 backdrop-blur flex items-center justify-center text-2xl">
            ⬡
          </div>
          <span className="text-xl font-bold tracking-tight">Park3D</span>
        </Link>

        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight tracking-tight mb-4">
            Build 3D for the web,
            <br />
            without code.
          </h1>
          <p className="text-white/80 text-base leading-relaxed mb-10 max-w-md">
            Sign up free and start building your own 3D spaces, games, and interactive websites.
          </p>
          <ul className="space-y-4">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="w-9 h-9 shrink-0 rounded-xs bg-white/15 backdrop-blur flex items-center justify-center">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className="text-white/95 text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-white/60 text-xs">© Park3D — No-code 3D space builder</p>
      </aside>

      {/* 우측 — 가입 폼 */}
      <main className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm">
          {/* 모바일 로고 (좌측 배너가 숨겨질 때) */}
          <Link href="/" className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xs bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xl">
              ⬡
            </div>
            <span className="text-lg font-bold tracking-tight">Park3D</span>
          </Link>

          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-1.5">
            Sign up
          </h2>
          <p className="text-muted text-sm mb-8">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Log in
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AuthField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="hello@example.com"
              autoComplete="email"
            />
            <AuthField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="At least 6 characters"
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
            <AuthSubmit loading={loading}>Create account</AuthSubmit>
          </form>

          <p className="text-muted/70 text-xs mt-6 leading-relaxed">
            By signing up, you agree to Park3D's Terms and Privacy Policy.
          </p>
        </div>
      </main>
    </div>
  );
}
