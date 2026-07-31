import { createBrowserSupabase } from '@/lib/supabase';
import { useSceneStore } from '@/store/sceneStore';
import { SCENE_VERSION, type ProjectSceneSchema } from '@/types/scene';

export type SaveResult =
  | { status: 'ok'; version: number; sceneData: ProjectSceneSchema }
  | { status: 'conflict' }
  | { status: 'error'; message: string }
  | { status: 'no-scene' };

/**
 * 현재 스토어 상태를 뷰어가 받는 ProjectSceneSchema로 직렬화한다(DB 저장 X).
 * 저장(persistCurrentScene)과 인에디터 플레이(편집 중 상태 그대로 뷰어 구동)가 공유.
 */
export function buildSceneData(): ProjectSceneSchema {
  const s = useSceneStore.getState();
  return {
    projectId: s.projectId ?? '',
    sceneId: s.sceneId ?? '',
    version: SCENE_VERSION,
    environment: s.environment,
  };
}

/**
 * 현재 스토어의 씬 상태를 scenes 테이블에 저장한다 (낙관적 잠금).
 *
 * scenes.version 컬럼을 행 리비전 카운터로 사용해:
 *   UPDATE ... SET version = expected + 1 WHERE id = ? AND version = expected
 * 로 갱신한다. 다른 탭/기기가 그 사이에 저장해 version이 올라가 있으면 매칭 행이
 * 0개가 되어 'conflict'를 반환한다 → 호출부에서 조용한 덮어쓰기 대신 경고를 띄운다.
 *
 * 성공 시 markSaved(newVersion)으로 스토어의 savedVersion을 갱신하므로
 * 같은 탭에서 연속 저장이 가능하다. (scene_versions 스냅샷/썸네일 등 부가 작업은
 * 호출부 책임 — 이 함수는 scenes 행 자체의 원자적 저장만 담당한다.)
 */
export async function persistCurrentScene(): Promise<SaveResult> {
  const s = useSceneStore.getState();
  if (!s.sceneId) return { status: 'no-scene' };

  const sceneData = buildSceneData();

  const expected = s.savedVersion;
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from('scenes')
    .update({ scene_data: sceneData, version: expected + 1 })
    .eq('id', s.sceneId)
    .eq('version', expected)
    .select('version');

  if (error) return { status: 'error', message: error.message };
  if (!data || data.length === 0) return { status: 'conflict' };

  const newVersion = (data[0].version as number) ?? expected + 1;
  useSceneStore.getState().markSaved(newVersion);
  return { status: 'ok', version: newVersion, sceneData };
}
