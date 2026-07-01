'use server';

import { createSupabaseServer } from '@/lib/supabase-server';
import { assertCountLimit, assertFeatureEnabled } from '@/lib/checkPlan';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { makeEmptySceneData } from '@/types/scene';

export async function createProject(formData: FormData) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const name = (formData.get('name') as string)?.trim() || '새 프로젝트';

  // 1. project INSERT (default_scene_id = null)
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({ owner_id: user.id, name })
    .select('id')
    .single();

  if (projectError || !project) throw new Error(projectError?.message ?? 'project 생성 실패');

  // 플랜 한도 검증: INSERT 이후 재카운트 → 동시 요청에 의한 초과 감지 + 롤백
  const { count: countAfter } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', user.id);
  try {
    await assertCountLimit(user.id, 'maxProjects', (countAfter ?? 1) - 1);
  } catch (e) {
    await supabase.from('projects').delete().eq('id', project.id).eq('owner_id', user.id);
    throw e;
  }

  // 2. scene INSERT — UUID upfront so scene_data can reference it
  const sceneId = crypto.randomUUID();
  const { error: sceneError } = await supabase
    .from('scenes')
    .insert({
      id: sceneId,
      project_id: project.id,
      name: '메인 씬',
      scene_data: makeEmptySceneData(project.id, sceneId),
    });

  if (sceneError) throw new Error(sceneError.message);

  // 3. project UPDATE → default_scene_id 연결
  await supabase
    .from('projects')
    .update({ default_scene_id: sceneId })
    .eq('id', project.id);

  redirect(`/editor/${project.id}`);
}

export async function deleteProject(projectId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 소유권 확인
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .single();

  if (!project) return;

  // 스토리지 파일 정리
  const { data: storageFiles } = await supabase.storage
    .from('assets')
    .list(`assets/${projectId}`);
  if (storageFiles && storageFiles.length > 0) {
    const paths = storageFiles.map((f) => `assets/${projectId}/${f.name}`);
    await supabase.storage.from('assets').remove(paths);
  }

  // 씬 버전 → 씬 → 프로젝트 순으로 삭제 (FK 순서)
  const { data: scenes } = await supabase
    .from('scenes')
    .select('id')
    .eq('project_id', projectId);

  if (scenes && scenes.length > 0) {
    const sceneIds = scenes.map((s) => s.id);
    await supabase.from('scene_versions').delete().in('scene_id', sceneIds);
    await supabase.from('scenes').delete().in('id', sceneIds);
  }

  await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('owner_id', user.id);

  revalidatePath('/dashboard');
}

export async function togglePublish(projectId: string, publish: boolean) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await supabase
    .from('projects')
    .update({ is_published: publish })
    .eq('id', projectId)
    .eq('owner_id', user.id);

  revalidatePath('/dashboard');
}

export async function renameProject(projectId: string, name: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  await supabase
    .from('projects')
    .update({ name: name.trim() || '새 프로젝트' })
    .eq('id', projectId)
    .eq('owner_id', user.id);

  revalidatePath('/dashboard');
}

export async function setCustomDomain(projectId: string, domain: string | null) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  if (domain) {
    await assertFeatureEnabled(user.id, 'customDomain');
  }

  const { error } = await supabase
    .from('projects')
    .update({ custom_domain: domain ?? null })
    .eq('id', projectId)
    .eq('owner_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}
