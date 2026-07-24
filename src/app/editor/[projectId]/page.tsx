import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase-server';
import { normalizeSceneData } from '@/types/scene';
import type { PlanTier } from '@/store/userStore';
import { EditorClient } from './EditorClient';
import { UserInitializer } from '@/components/ui/UserInitializer';
import { BfcacheGuard } from '@/components/ui/BfcacheGuard';

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function EditorPage({ params }: Props) {
  const { projectId } = await params;
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: planData } = await supabase
    .from('users_plan')
    .select('plan_tier')
    .eq('user_id', user.id)
    .single();
  const planTier = (planData?.plan_tier ?? 'free') as PlanTier;

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
    .select('id, scene_data, version')
    .eq('id', project.default_scene_id)
    .single();

  if (!scene) redirect('/dashboard');

  const initialScene = normalizeSceneData(
    (scene.scene_data as Record<string, unknown>) ?? {},
    projectId,
    scene.id,
  );

  return (
    <>
      <UserInitializer userId={user.id} email={user.email ?? ''} planTier={planTier} />
      <BfcacheGuard />
      <EditorClient
        projectName={project.name}
        initialScene={initialScene}
        initialVersion={typeof scene.version === 'number' ? scene.version : 1}
      />
    </>
  );
}
