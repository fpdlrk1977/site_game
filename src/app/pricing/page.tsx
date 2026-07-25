import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';
import type { PlanTier } from '@/store/userStore';
import { PricingCards } from './PricingCards';
import { SiteShell } from '@/components/ui/SiteShell';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

export const metadata = {
  title: 'Pricing — Park3D',
  description: 'Compare Park3D plans and pick the one that fits.',
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

  const nav = (
    <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem]">
        <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: GRAD }}>⬡</span> Park3D
      </Link>
      <Link href={user ? '/dashboard' : '/login'} className="text-sm text-foreground/70 hover:text-foreground transition-colors">
        {user ? "Dashboard" : "Log in"}
      </Link>
    </div>
  );

  return (
    <SiteShell nav={nav}>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <span className="text-[.72rem] tracking-[.14em] uppercase text-primary font-bold">Pricing</span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 mt-3">
            Choose the plan that fits
          </h1>
          <p className="text-muted text-base">
            Build and publish 3D spaces without code. Upgrade anytime.
          </p>
        </div>

        <PricingCards currentTier={currentTier} loggedIn={!!user} />

        <p className="text-center text-muted/70 text-xs mt-14">
          Prices are provisional and may change. Billing is coming soon.
        </p>
      </div>
    </SiteShell>
  );
}
