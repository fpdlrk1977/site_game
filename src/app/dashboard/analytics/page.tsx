import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Eye, MousePointerClick, Globe, TrendingUp, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase-server';
import { DashboardTopBar } from '../DashboardTopBar';
import { DashboardSidebar } from '../DashboardSidebar';
import { UserInitializer } from '@/components/ui/UserInitializer';
import { BfcacheGuard } from '@/components/ui/BfcacheGuard';
import { PricingModal } from '@/components/ui/PricingModal';
import { UpgradeCta } from './UpgradeCta';
import { DailyChart } from './DailyChart';
import { buildDailySeries, trendPct, parseRange, ANALYTICS_RANGES, type DailyRow } from '@/lib/analytics';
import type { PlanTier } from '@/store/userStore';

export const metadata = { title: 'Analytics — Park3D' };

interface SceneRow { id: string; name: string; project_id: string }
interface ByScene { scene_id: string; event_type: string; cnt: number }
interface TopObj { scene_id: string; object_name: string; cnt: number }

/** 큰 숫자 타일 — 값이 주인공, 라벨은 부차적 */
function Stat({ icon, label, value, delta }: { icon: React.ReactNode; label: string; value: string; delta?: number | null }) {
  return (
    <div className="bg-surface border border-border rounded-xs p-5">
      <div className="flex items-center gap-2 text-muted text-[.78rem]">
        <span className="w-6 h-6 rounded-xs grid place-items-center bg-foreground/[0.04] text-foreground">{icon}</span>
        {label}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-[1.9rem] font-bold tracking-tight tabular-nums leading-none">{value}</span>
        {typeof delta === 'number' && (
          <span className={`inline-flex items-center gap-0.5 text-[.75rem] font-semibold mb-1 ${delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
    </div>
  );
}

/** 순위 막대 — 값을 직접 라벨링하므로 툴팁이 필요 없다 */
function RankBar({ label, sub, value, max, href }: { label: string; sub?: string; value: number; max: number; href?: string }) {
  const inner = (
    <>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[.85rem] font-medium truncate">{label}</span>
        {sub && <span className="text-[.7rem] text-muted truncate">{sub}</span>}
        <span className="ml-auto text-[.8rem] tabular-nums text-muted shrink-0">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 rounded-[2px] bg-foreground/[0.06] overflow-hidden">
        <div className="h-full rounded-[2px]" style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: 'var(--primary)' }} />
      </div>
    </>
  );
  return href
    ? <Link href={href} className="block py-2.5 hover:opacity-80 transition-opacity">{inner}</Link>
    : <div className="py-2.5">{inner}</div>;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = parseRange((await searchParams).days);
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: planData } = await supabase.from('users_plan').select('plan_tier').eq('user_id', user.id).single();
  const planTier = (planData?.plan_tier ?? 'free') as PlanTier;
  const allowed = planTier === 'pro' || planTier === 'business';

  const shell = (body: React.ReactNode) => (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <UserInitializer userId={user.id} email={user.email ?? ''} planTier={planTier} />
      <BfcacheGuard />
      <PricingModal />
      <DashboardTopBar email={user.email ?? ''} />
      <div className="flex flex-1 min-h-0">
        <DashboardSidebar planTier={planTier} active="analytics" />
        <main className="flex-1 min-w-0 overflow-y-auto"><div className="px-8 py-8 w-full">{body}</div></main>
      </div>
    </div>
  );

  const header = (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
      <div>
        <h1 className="text-[1.6rem] font-bold tracking-tight">Analytics</h1>
        <p className="text-muted text-sm mt-1">How people are using your published spaces</p>
      </div>
      {allowed && (
        <div className="flex items-center gap-1.5 bg-surface border border-border rounded-xs p-1">
          {ANALYTICS_RANGES.map((r) => (
            <Link key={r} href={`/dashboard/analytics?days=${r}`}
              className={`px-3 py-1.5 rounded-xs text-[.8rem] transition-colors ${r === days ? 'text-primary font-semibold bg-primary/[0.12]' : 'text-muted hover:text-foreground'}`}>
              {r}d
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  if (!allowed) {
    return shell(<>{header}<UpgradeCta /></>);
  }

  // ── 내 프로젝트/씬 ────────────────────────────────────────
  const { data: projects } = await supabase
    .from('projects').select('id, name, is_published').eq('owner_id', user.id);
  const projectList = projects ?? [];
  const projectIds = projectList.map((p) => p.id);
  const projectName = new Map(projectList.map((p) => [p.id, p.name as string]));
  const publishedCount = projectList.filter((p) => p.is_published).length;

  let scenes: SceneRow[] = [];
  if (projectIds.length) {
    const { data } = await supabase.from('scenes').select('id, name, project_id').in('project_id', projectIds);
    scenes = (data ?? []) as SceneRow[];
  }
  const sceneMeta = new Map(scenes.map((s) => [s.id, s]));

  // ── 집계(RPC) ─────────────────────────────────────────────
  // 원본 행을 끌어오면 PostgREST max_rows에 잘려 조용히 틀린다 → DB에서 집계(0008 마이그레이션).
  const [dailyRes, sceneRes, objRes] = await Promise.all([
    supabase.rpc('owner_events_daily', { p_days: days }),
    supabase.rpc('owner_events_by_scene', { p_days: days }),
    supabase.rpc('owner_events_top_objects', { p_days: days, p_limit: 12 }),
  ]);
  const needsMigration = !!dailyRes.error;

  const series = buildDailySeries((dailyRes.data ?? []) as DailyRow[], days);
  const totalViews = series.reduce((s, p) => s + p.views, 0);
  const totalInteractions = series.reduce((s, p) => s + p.interactions, 0);

  const byScene = (sceneRes.data ?? []) as ByScene[];
  const viewsByScene = new Map<string, number>();
  for (const r of byScene) {
    if (r.event_type !== 'view') continue;
    viewsByScene.set(r.scene_id, (viewsByScene.get(r.scene_id) ?? 0) + Number(r.cnt));
  }
  const topScenes = [...viewsByScene.entries()]
    .map(([id, v]) => ({ id, v, meta: sceneMeta.get(id) }))
    .filter((x) => x.meta) // 남의 씬은 RLS가 이미 막지만, 삭제된 씬 참조도 걸러낸다
    .sort((a, b) => b.v - a.v).slice(0, 8);
  const topSceneMax = Math.max(1, ...topScenes.map((s) => s.v));

  const topObjects = ((objRes.data ?? []) as TopObj[]).map((o) => ({ ...o, cnt: Number(o.cnt) }));
  const topObjMax = Math.max(1, ...topObjects.map((o) => o.cnt));

  return shell(
    <>
      {header}

      {needsMigration && (
        <div className="flex items-start gap-2.5 bg-surface border border-border rounded-xs p-4 mb-6 text-[.82rem]">
          <Info size={16} className="text-foreground shrink-0 mt-0.5" />
          <div>
            <b>집계 함수가 아직 없습니다.</b>
            <p className="text-muted mt-1 leading-relaxed">
              Supabase SQL Editor에서 <code className="px-1 py-0.5 rounded-[3px] bg-foreground/[0.06]">supabase/migrations/0008_analytics_rpc.sql</code> 을 실행하면
              아래 수치가 채워집니다. (적용 전에는 0으로 표시됩니다.)
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-7">
        <Stat icon={<Eye size={14} />} label={`Views · ${days}d`} value={totalViews.toLocaleString()} delta={trendPct(series, (p) => p.views)} />
        <Stat icon={<MousePointerClick size={14} />} label={`Interactions · ${days}d`} value={totalInteractions.toLocaleString()} delta={trendPct(series, (p) => p.interactions)} />
        <Stat icon={<TrendingUp size={14} />} label="Avg views / day" value={(totalViews / days).toFixed(totalViews / days >= 10 ? 0 : 1)} />
        <Stat icon={<Globe size={14} />} label="Published spaces" value={String(publishedCount)} />
      </div>

      <section className="bg-surface border border-border rounded-xs p-6 mb-7">
        <h2 className="text-[.95rem] font-semibold mb-1">Traffic over time</h2>
        <p className="text-[.78rem] text-muted mb-5">Daily views and interactions across all your scenes</p>
        <DailyChart data={series} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface border border-border rounded-xs p-6">
          <h2 className="text-[.95rem] font-semibold mb-1">Top spaces</h2>
          <p className="text-[.78rem] text-muted mb-3">Most visited scenes</p>
          {topScenes.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">No visits in this period yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {topScenes.map((s) => (
                <RankBar key={s.id} label={s.meta!.name} sub={projectName.get(s.meta!.project_id)} value={s.v} max={topSceneMax} href={`/space/${s.id}`} />
              ))}
            </div>
          )}
        </section>

        <section className="bg-surface border border-border rounded-xs p-6">
          <h2 className="text-[.95rem] font-semibold mb-1">Most interacted objects</h2>
          <p className="text-[.78rem] text-muted mb-3">Clicks and area triggers by object</p>
          {topObjects.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">No interactions recorded yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {topObjects.map((o, i) => (
                <RankBar key={`${o.scene_id}-${o.object_name}-${i}`} label={o.object_name}
                  sub={sceneMeta.get(o.scene_id)?.name} value={o.cnt} max={topObjMax} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>,
  );
}
