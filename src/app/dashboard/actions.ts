'use server';

import { createSupabaseServer } from '@/lib/supabase-server';
import { assertCountLimit, assertFeatureEnabled } from '@/lib/checkPlan';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { makeEmptySceneData } from '@/types/scene';
import { remapSceneData } from '@/lib/remapScene';

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

export async function duplicateProject(projectId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 원본 소유권 확인
  const { data: src } = await supabase
    .from('projects')
    .select('id, name, description, meta, thumbnail_url, default_scene_id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .single();
  if (!src) return;

  // 1. 새 프로젝트 생성 (비공개·도메인 없음으로 시작)
  const { data: newProject, error: pErr } = await supabase
    .from('projects')
    .insert({ owner_id: user.id, name: `${src.name} (복사본)` })
    .select('id')
    .single();
  if (pErr || !newProject) throw new Error(pErr?.message ?? '복제 실패');
  const newPid = newProject.id as string;

  // 플랜 한도 검증 (초과 시 롤백)
  const { count: countAfter } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', user.id);
  try {
    await assertCountLimit(user.id, 'maxProjects', (countAfter ?? 1) - 1);
  } catch (e) {
    await supabase.from('projects').delete().eq('id', newPid).eq('owner_id', user.id);
    throw e;
  }

  // 2. 에셋 복사 — 스토리지 파일(+썸네일) 새 경로로 복사 + DB 행 생성 → oldId→new 맵
  const { data: srcAssets } = await supabase
    .from('assets')
    .select('id, name, mime_type, size_bytes')
    .eq('project_id', projectId);

  const assetMap = new Map<string, { id: string; dracoUrl: string; thumbUrl?: string }>();
  for (const a of srcAssets ?? []) {
    const newAssetId = crypto.randomUUID();
    const toGlb = `assets/${newPid}/${newAssetId}.glb`;
    const { error: copyErr } = await supabase.storage.from('assets')
      .copy(`assets/${projectId}/${a.id}.glb`, toGlb);
    if (copyErr) continue; // 원본 파일이 없으면 스킵
    const url = supabase.storage.from('assets').getPublicUrl(toGlb).data.publicUrl;

    let thumbUrl: string | undefined;
    const toThumb = `assets/${newPid}/${newAssetId}_thumb.png`;
    const { error: tErr } = await supabase.storage.from('assets')
      .copy(`assets/${projectId}/${a.id}_thumb.png`, toThumb);
    if (!tErr) thumbUrl = supabase.storage.from('assets').getPublicUrl(toThumb).data.publicUrl;

    await supabase.from('assets').insert({
      id: newAssetId, project_id: newPid, owner_id: user.id,
      name: a.name, file_url: url, draco_url: url,
      mime_type: a.mime_type, size_bytes: a.size_bytes,
    });
    assetMap.set(a.id, { id: newAssetId, dracoUrl: url, thumbUrl });
  }

  // 3. 씬 복사 — 먼저 old→new 씬 id 맵 생성(go_to_scene 리맵용), 그 다음 scene_data 리맵 후 INSERT
  const { data: srcScenes } = await supabase
    .from('scenes')
    .select('id, name, scene_data')
    .eq('project_id', projectId);

  const sceneIdMap = new Map<string, string>();
  for (const s of srcScenes ?? []) sceneIdMap.set(s.id, crypto.randomUUID());

  for (const s of srcScenes ?? []) {
    const newSceneId = sceneIdMap.get(s.id)!;
    const remapped = remapSceneData(
      (s.scene_data ?? {}) as Record<string, unknown>,
      newPid, newSceneId, assetMap, sceneIdMap,
    );
    await supabase.from('scenes').insert({
      id: newSceneId, project_id: newPid, name: s.name, scene_data: remapped,
    });
  }

  // 4. default_scene_id 연결 + 메타 복사
  const newDefault = src.default_scene_id ? (sceneIdMap.get(src.default_scene_id) ?? null) : null;
  await supabase.from('projects').update({
    default_scene_id: newDefault,
    thumbnail_url: src.thumbnail_url ?? null,
    description: src.description ?? null,
    meta: src.meta ?? {},
  }).eq('id', newPid).eq('owner_id', user.id);

  revalidatePath('/dashboard');
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
