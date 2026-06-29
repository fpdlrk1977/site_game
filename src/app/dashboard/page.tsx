import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase-server';
import { ProjectCard } from './ProjectCard';
import { NewProjectButton } from './NewProjectButton';
import { NewProjectCard } from './NewProjectCard';
import { UserInitializer } from '@/components/ui/UserInitializer';
import { createProject } from './actions';
import type { PlanTier } from '@/store/userStore';

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: projects }, { data: planData }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, is_published, updated_at, thumbnail_url, default_scene_id')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('users_plan')
      .select('plan_tier')
      .eq('user_id', user.id)
      .single(),
  ]);

  const list = projects ?? [];
  const planTier = (planData?.plan_tier ?? 'free') as PlanTier;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <UserInitializer userId={user.id} email={user.email ?? ''} planTier={planTier} />
      {/* 배경 장식 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2" />
      </div>

      {/* 헤더 */}
      <header className="relative border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm shadow-lg shadow-violet-500/25">
            ⬡
          </div>
          <span className="font-bold text-lg tracking-tight">Park3D</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{user.email}</span>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {/* 메인 */}
      <main className="relative max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">내 프로젝트</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {list.length > 0 ? `${list.length}개의 프로젝트` : '3D 공간을 만들고 배포하세요'}
            </p>
          </div>
          <NewProjectButton />
        </div>

        {list.length === 0 ? (
          /* 빈 상태 */
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="relative mb-6">
              <div className="w-28 h-28 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-5xl shadow-inner">
                🌐
              </div>
              <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-xs font-bold shadow-lg shadow-violet-500/25 animate-bounce">
                +
              </div>
            </div>
            <h2 className="text-xl font-semibold mb-2">아직 프로젝트가 없어요</h2>
            <p className="text-zinc-400 text-sm max-w-sm mb-8 leading-relaxed">
              첫 번째 3D 공간을 만들어보세요.<br />
              코딩 없이 멋진 3D 웹 경험을 완성할 수 있습니다.
            </p>
            <form action={createProject}>
              <input type="hidden" name="name" value="나의 첫 번째 3D 공간" />
              <button
                type="submit"
                className="group flex items-center gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5"
              >
                <span className="text-base leading-none transition-transform group-hover:rotate-90 duration-200">+</span>
                첫 프로젝트 만들기
              </button>
            </form>
          </div>
        ) : (
          /* 프로젝트 그리드 */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {list.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
            {/* 새 프로젝트 카드 */}
            <NewProjectCard />
          </div>
        )}
      </main>
    </div>
  );
}
