import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase-server';
import { DashboardTopBar } from './DashboardTopBar';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardBody } from './DashboardBody';
import { UserInitializer } from '@/components/ui/UserInitializer';
import { BfcacheGuard } from '@/components/ui/BfcacheGuard';
import { PricingModal } from '@/components/ui/PricingModal';
import type { PlanTier } from '@/store/userStore';

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: projects }, { data: planData }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, is_published, created_at, updated_at, thumbnail_url, default_scene_id, custom_domain')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('users_plan').select('plan_tier').eq('user_id', user.id).single(),
  ]);

  const list = projects ?? [];
  const planTier = (planData?.plan_tier ?? 'free') as PlanTier;

  // 씬 방문 통계 (Pro 이상)
  const sceneIds = list.map((p) => p.default_scene_id).filter(Boolean) as string[];
  let viewCounts: Record<string, number> = {};
  if ((planTier === 'pro' || planTier === 'business') && sceneIds.length > 0) {
    const countResults = await Promise.all(
      sceneIds.map(async (id) => {
        const { count } = await supabase
          .from('scene_events')
          .select('*', { count: 'exact', head: true })
          .eq('scene_id', id)
          .eq('event_type', 'view');
        return [id, count ?? 0] as const;
      }),
    );
    viewCounts = Object.fromEntries(countResults);
  }

  // 온보딩 진행도 — 추적 테이블 없이 이미 있는 데이터로만 판정.
  // (플랜 무관하게 필요하므로 위 viewCounts와 별개로 총합 1회만 센다.)
  let totalViews = 0;
  if (sceneIds.length > 0) {
    const { count } = await supabase
      .from('scene_events')
      .select('*', { count: 'exact', head: true })
      .in('scene_id', sceneIds)
      .eq('event_type', 'view');
    totalViews = count ?? 0;
  }
  const { count: remixCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .not('remixed_from', 'is', null);

  const onboarding = {
    hasProject: list.length > 0,
    hasPublished: list.some((p) => p.is_published),
    hasVisitor: totalViews > 0,
    hasRemixed: (remixCount ?? 0) > 0,
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <UserInitializer userId={user.id} email={user.email ?? ''} planTier={planTier} />
      <BfcacheGuard />
      <PricingModal />
      <DashboardTopBar email={user.email ?? ''} />
      <div className="flex flex-1 min-h-0">
        <DashboardSidebar planTier={planTier} />
        <DashboardBody
          projects={list}
          viewCounts={viewCounts}
          showAnalytics={planTier === 'pro' || planTier === 'business'}
          onboarding={onboarding}
        />
      </div>
    </div>
  );
}
