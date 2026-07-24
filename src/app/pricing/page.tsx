import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';
import type { PlanTier } from '@/store/userStore';
import { PricingCards } from './PricingCards';

export const metadata = {
  title: '요금제 — Park3D',
  description: 'Park3D 요금제를 비교하고 나에게 맞는 플랜을 선택하세요.',
};

export default async function PricingPage() {
  // 로그인 사용자면 현재 플랜을 읽어 "현재 플랜"으로 표시 (비로그인은 표시 안 함)
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentTier: PlanTier | null = null;
  if (user) {
    const { data: planData } = await supabase
      .from('users_plan')
      .select('plan_tier')
      .eq('user_id', user.id)
      .single();
    currentTier = (planData?.plan_tier ?? 'free') as PlanTier;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 배경 장식 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-600/5 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
      </div>

      {/* 미니 헤더 */}
      <header className="relative border-b border-border/60 px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-sidebar/70">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xs bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm shadow-lg shadow-violet-500/25">
            ⬡
          </div>
          <span className="font-bold text-lg tracking-tight">Park3D</span>
        </Link>
        <Link
          href={user ? '/dashboard' : '/login'}
          className="text-sm text-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-xs hover:bg-surface"
        >
          {user ? '대시보드' : '로그인'}
        </Link>
      </header>

      {/* 본문 */}
      <main className="relative max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            나에게 맞는 플랜을 선택하세요
          </h1>
          <p className="text-muted text-base">
            코딩 없이 3D 공간을 만들고 배포하세요. 언제든 업그레이드할 수 있습니다.
          </p>
        </div>

        <PricingCards currentTier={currentTier} loggedIn={!!user} />

        <p className="text-center text-muted/70 text-xs mt-14">
          가격은 확정 전 안내용이며 변경될 수 있습니다. 결제 기능은 준비 중입니다.
        </p>
      </main>
    </div>
  );
}
