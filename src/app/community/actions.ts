'use server';

import { createSupabaseServer, createServiceSupabase } from '@/lib/supabase-server';
import { assertCountLimit } from '@/lib/checkPlan';
import { remapSceneData } from '@/lib/remapScene';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

async function requireUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

/** 좋아요 토글 → { liked } */
export async function toggleLike(projectId: string): Promise<{ liked: boolean }> {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from('project_likes')
    .select('project_id')
    .eq('project_id', projectId).eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from('project_likes').delete().eq('project_id', projectId).eq('user_id', user.id);
    revalidatePath(`/community/${projectId}`);
    return { liked: false };
  }
  await supabase.from('project_likes').insert({ project_id: projectId, user_id: user.id });
  revalidatePath(`/community/${projectId}`);
  return { liked: true };
}

/** 팔로우 토글 → { following } */
export async function toggleFollow(followingId: string): Promise<{ following: boolean }> {
  const { supabase, user } = await requireUser();
  if (user.id === followingId) return { following: false };

  const { data: existing } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', user.id).eq('following_id', followingId)
    .maybeSingle();

  if (existing) {
    await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('following_id', followingId);
    return { following: false };
  }
  await supabase.from('user_follows').insert({ follower_id: user.id, following_id: followingId });
  return { following: true };
}

/** 댓글 작성 */
export async function addComment(projectId: string, body: string): Promise<void> {
  const { supabase, user } = await requireUser();
  const text = body.trim();
  if (!text) return;
  await supabase.from('project_comments').insert({
    project_id: projectId, user_id: user.id, body: text.slice(0, 2000),
  });
  revalidatePath(`/community/${projectId}`);
}

export async function deleteComment(commentId: string, projectId: string): Promise<void> {
  const { supabase, user } = await requireUser();
  await supabase.from('project_comments').delete().eq('id', commentId).eq('user_id', user.id);
  revalidatePath(`/community/${projectId}`);
}

/** 태그 수정(프로젝트 소유자만) */
export async function setProjectTags(projectId: string, tags: string[]): Promise<void> {
  const { supabase, user } = await requireUser();
  const clean = Array.from(new Set(tags.map((t) => t.trim().replace(/^#/, '')).filter(Boolean))).slice(0, 12);
  await supabase.from('projects').update({ tags: clean }).eq('id', projectId).eq('owner_id', user.id);
  revalidatePath(`/community/${projectId}`);
}

/**
 * 리믹스 — 공개된 남의(또는 내) 프로젝트를 복제해 내 계정의 새 프로젝트로.
 * 원본은 published여야 하며, 새 프로젝트에 remixed_from을 기록한다.
 * 에셋은 스토리지 복사(퍼블릭)로 독립 확보. 씬/에셋/go_to_scene 리맵.
 */
export async function remixProject(sourceProjectId: string) {
  const { supabase, user } = await requireUser();
  const service = createServiceSupabase();

  // 원본이 공개 프로젝트인지 확인(서비스로 조회 — RLS 우회, is_published 수동 체크)
  const { data: src } = await service
    .from('projects')
    .select('id, name, description, thumbnail_url, default_scene_id, is_published')
    .eq('id', sourceProjectId)
    .single();
  if (!src || !src.is_published) redirect('/community');

  // 1. 새 프로젝트(비공개) + 리믹스 출처
  const { data: newProject, error: pErr } = await supabase
    .from('projects')
    .insert({ owner_id: user.id, name: `${src.name} (리믹스)`, remixed_from: sourceProjectId })
    .select('id')
    .single();
  if (pErr || !newProject) throw new Error(pErr?.message ?? '리믹스 실패');
  const newPid = newProject.id as string;

  // 플랜 한도 검증
  const { count: countAfter } = await supabase
    .from('projects').select('*', { count: 'exact', head: true }).eq('owner_id', user.id);
  try {
    await assertCountLimit(user.id, 'maxProjects', (countAfter ?? 1) - 1);
  } catch (e) {
    await supabase.from('projects').delete().eq('id', newPid).eq('owner_id', user.id);
    throw e;
  }

  // 2. 에셋 복사(서비스로 원본 조회·스토리지 복사)
  const { data: srcAssets } = await service
    .from('assets').select('id, name, mime_type, size_bytes').eq('project_id', sourceProjectId);
  const assetMap = new Map<string, { id: string; dracoUrl: string; thumbUrl?: string }>();
  for (const a of srcAssets ?? []) {
    const newAssetId = crypto.randomUUID();
    const toGlb = `assets/${newPid}/${newAssetId}.glb`;
    const { error: copyErr } = await service.storage.from('assets')
      .copy(`assets/${sourceProjectId}/${a.id}.glb`, toGlb);
    if (copyErr) continue;
    const url = service.storage.from('assets').getPublicUrl(toGlb).data.publicUrl;
    let thumbUrl: string | undefined;
    const toThumb = `assets/${newPid}/${newAssetId}_thumb.png`;
    const { error: tErr } = await service.storage.from('assets')
      .copy(`assets/${sourceProjectId}/${a.id}_thumb.png`, toThumb);
    if (!tErr) thumbUrl = service.storage.from('assets').getPublicUrl(toThumb).data.publicUrl;
    await supabase.from('assets').insert({
      id: newAssetId, project_id: newPid, owner_id: user.id,
      name: a.name, file_url: url, draco_url: url, mime_type: a.mime_type, size_bytes: a.size_bytes,
    });
    assetMap.set(a.id, { id: newAssetId, dracoUrl: url, thumbUrl });
  }

  // 3. 씬 복사(리맵)
  const { data: srcScenes } = await service
    .from('scenes').select('id, name, scene_data').eq('project_id', sourceProjectId);
  const sceneIdMap = new Map<string, string>();
  for (const s of srcScenes ?? []) sceneIdMap.set(s.id, crypto.randomUUID());
  for (const s of srcScenes ?? []) {
    const newSceneId = sceneIdMap.get(s.id)!;
    const remapped = remapSceneData((s.scene_data ?? {}) as Record<string, unknown>, newPid, newSceneId, assetMap, sceneIdMap);
    await supabase.from('scenes').insert({ id: newSceneId, project_id: newPid, name: s.name, scene_data: remapped });
  }

  const newDefault = src.default_scene_id ? (sceneIdMap.get(src.default_scene_id) ?? null) : null;
  await supabase.from('projects').update({
    default_scene_id: newDefault, thumbnail_url: src.thumbnail_url ?? null, description: src.description ?? null,
  }).eq('id', newPid).eq('owner_id', user.id);

  redirect(`/editor/${newPid}`);
}
