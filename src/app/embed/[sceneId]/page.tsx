import { notFound } from 'next/navigation';
import { createServiceSupabase } from '@/lib/supabase-server';
import { normalizeSceneData } from '@/types/scene';
import { EmbedClient } from './EmbedClient';

interface Props {
  params: Promise<{ sceneId: string }>;
}

export default async function EmbedPage({ params }: Props) {
  const { sceneId } = await params;
  const service = createServiceSupabase();

  const { data: scene } = await service
    .from('scenes')
    .select('id, scene_data, project_id')
    .eq('id', sceneId)
    .single();

  if (!scene) notFound();

  const { data: project } = await service
    .from('projects')
    .select('id, name, is_published')
    .eq('id', scene.project_id)
    .single();

  if (!project || !project.is_published) notFound();

  const sceneData = normalizeSceneData(
    (scene.scene_data as Record<string, unknown>) ?? {},
    project.id,
    scene.id,
  );

  return <EmbedClient scene={sceneData} />;
}
