import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase-server';
import Link from 'next/link';

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function EditorPage({ params }: Props) {
  const { projectId } = await params;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, default_scene_id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .single();

  if (!project) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-zinc-800 px-4 py-3 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="text-zinc-400 hover:text-white transition-colors text-sm flex items-center gap-1.5"
        >
          ← 대시보드
        </Link>
        <div className="w-px h-4 bg-zinc-700" />
        <span className="text-sm font-medium">{project.name}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded-md">Phase 1 개발 예정</span>
        </div>
      </header>

      {/* 에디터 영역 플레이스홀더 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-24 h-24 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-4xl mx-auto mb-6">
            🛠️
          </div>
          <h1 className="text-2xl font-bold mb-2">에디터 준비 중</h1>
          <p className="text-zinc-400 text-sm max-w-sm leading-relaxed">
            3D 에디터는 Phase 1에서 구현됩니다.<br />
            프로젝트 ID: <span className="text-violet-400 font-mono text-xs">{project.id}</span>
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
              씬 ID: <span className="text-cyan-400 font-mono">{project.default_scene_id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
