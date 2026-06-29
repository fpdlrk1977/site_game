import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createServiceSupabase } from '@/lib/supabase';
import { normalizeSceneData } from '@/types/scene';
import { ViewerClient } from './ViewerClient';

interface Props {
  params: Promise<{ sceneId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sceneId } = await params;
  const service = createServiceSupabase();

  const { data: scene } = await service
    .from('scenes')
    .select('project_id, projects(name, thumbnail_url)')
    .eq('id', sceneId)
    .single();

  const proj = scene?.projects;
  const project = Array.isArray(proj) ? proj[0] : (proj as { name?: string; thumbnail_url?: string } | null | undefined) ?? null;
  const title = `${project?.name ?? '3D 공간'} — Park3D`;

  const description = `${project?.name ?? '3D 공간'} — Park3D로 만든 인터랙티브 3D 공간입니다.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: project?.thumbnail_url
        ? [{ url: project.thumbnail_url, width: 1200, height: 630, alt: project.name ?? '3D 공간' }]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: project?.thumbnail_url ? [project.thumbnail_url] : [],
    },
  };
}

export default async function SpacePage({ params }: Props) {
  const { sceneId } = await params;

  // 서비스 클라이언트로 씬+프로젝트 조회 (RLS 우회, 수동으로 권한 체크)
  const service = createServiceSupabase();

  const { data: scene } = await service
    .from('scenes')
    .select('id, scene_data, project_id')
    .eq('id', sceneId)
    .single();

  if (!scene) notFound();

  const { data: project } = await service
    .from('projects')
    .select('id, name, is_published, owner_id')
    .eq('id', scene.project_id)
    .single();

  if (!project) notFound();

  // 현재 유저 확인 (비로그인도 허용 — 공개 씬 접근 가능)
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const isOwner = !!user && user.id === project.owner_id;

  // 비공개 씬은 소유자만 접근
  if (!project.is_published && !isOwner) notFound();

  const sceneData = normalizeSceneData(
    (scene.scene_data as Record<string, unknown>) ?? {},
    project.id,
    scene.id,
  );

  // 소유자 플랜 조회 (배지 표시 여부)
  const { data: ownerPlan } = await service
    .from('users_plan')
    .select('plan_tier')
    .eq('user_id', project.owner_id)
    .single();

  const planTier = (ownerPlan?.plan_tier ?? 'free') as 'free' | 'pro' | 'business';
  const hideBadge = planTier === 'pro' || planTier === 'business';

  return (
    <ViewerClient
      scene={sceneData}
      projectName={project.name}
      isOwner={isOwner}
      projectId={project.id}
      hideBadge={hideBadge}
    />
  );
}
