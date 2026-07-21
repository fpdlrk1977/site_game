'use server';

// 에디터 전용 서버 액션.
import { createSupabaseServer } from '@/lib/supabase-server';

/**
 * 메인 씬 지정 — `projects.default_scene_id`를 이 씬으로.
 * 커스텀 도메인/공유 링크로 프로젝트에 들어왔을 때 처음 열리는 씬이다.
 * (지금까지 이 값은 프로젝트 생성 시 첫 씬으로 자동 설정될 뿐 에디터에서 바꿀 방법이 없었다.)
 */
export async function setMainScene(projectId: string, sceneId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요합니다.' };

  // 소유자 확인 — RLS가 있더라도 명시적으로 막아 남의 프로젝트를 건드리지 못하게 한다.
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .single();
  if (!project || project.owner_id !== user.id) return { ok: false, error: '권한이 없습니다.' };

  // 그 씬이 정말 이 프로젝트의 것인지 확인(잘못된 id로 default가 깨지지 않게).
  const { data: scene } = await supabase
    .from('scenes')
    .select('id, project_id')
    .eq('id', sceneId)
    .single();
  if (!scene || scene.project_id !== projectId) return { ok: false, error: '이 프로젝트의 씬이 아닙니다.' };

  const { error } = await supabase
    .from('projects')
    .update({ default_scene_id: sceneId })
    .eq('id', projectId);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
