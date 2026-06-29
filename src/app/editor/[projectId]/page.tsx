import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase-server';
import { normalizeSceneData } from '@/types/scene';
import { EditorClient } from './EditorClient';

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function EditorPage({ params }: Props) {
  const { projectId } = await params;
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 프로젝트 + 디폴트 씬 조인
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, default_scene_id')
    .eq('id', projectId)
    .eq('owner_id', user.id)
    .single();

  if (!project?.default_scene_id) redirect('/dashboard');

  const { data: scene } = await supabase
    .from('scenes')
    .select('id, scene_data')
    .eq('id', project.default_scene_id)
    .single();

  if (!scene) redirect('/dashboard');

  const initialScene = normalizeSceneData(
    (scene.scene_data as Record<string, unknown>) ?? {},
    projectId,
    scene.id,
  );

  return (
    <EditorClient
      projectName={project.name}
      initialScene={initialScene}
    />
  );
}
