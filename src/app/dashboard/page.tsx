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
        />
      </div>
    </div>
  );
}
