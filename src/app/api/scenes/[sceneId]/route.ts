import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { normalizeSceneData } from '@/types/scene';

// embed.js 등 외부 도메인에서 호출하므로 CORS 전면 허용 (공개 씬 데이터만 노출)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface Params {
  params: Promise<{ sceneId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { sceneId } = await params;
  const service = createServiceSupabase();

  const { data: scene } = await service
    .from('scenes')
    .select('id, scene_data, project_id')
    .eq('id', sceneId)
    .single();

  if (!scene) {
    return NextResponse.json({ error: 'Scene not found' }, { status: 404, headers: CORS_HEADERS });
  }

  const { data: project } = await service
    .from('projects')
    .select('id, is_published')
    .eq('id', scene.project_id)
    .single();

  // 공개(is_published)된 씬만 외부에 노출 — 비공개 씬은 항상 404
  if (!project?.is_published) {
    return NextResponse.json({ error: 'Scene not found' }, { status: 404, headers: CORS_HEADERS });
  }

  const sceneData = normalizeSceneData(
    (scene.scene_data as Record<string, unknown>) ?? {},
    project.id,
    scene.id,
  );

  return NextResponse.json(
    { sceneId: scene.id, scene_data: sceneData },
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS_HEADERS });
}
