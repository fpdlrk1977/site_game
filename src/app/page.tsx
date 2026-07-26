import { createSupabaseServer } from '@/lib/supabase-server';
import type { PlanTier } from '@/store/userStore';
import { LandingClient } from '@/components/landing/LandingClient';

// 공개 랜딩(마케팅) 페이지. 로그인 여부에 따라 CTA만 달라진다(대시보드 vs 회원가입).
export default async function RootPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // Pricing 섹션이 /pricing과 같은 카드를 쓰므로 현재 플랜도 동일하게 표시(비로그인은 없음)
  let currentTier: PlanTier | null = null;
  if (user) {
    const { data: planData } = await supabase
      .from('users_plan')
      .select('plan_tier')
      .eq('user_id', user.id)
      .single();
    currentTier = (planData?.plan_tier ?? 'free') as PlanTier;
  }

  return <LandingClient loggedIn={!!user} currentTier={currentTier} />;
}
