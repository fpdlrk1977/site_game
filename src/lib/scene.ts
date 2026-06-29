import { makeEmptySceneData } from '@/types/scene';

// Re-export for dashboard actions.ts (creates scene_data for INSERT)
export function createEmptyScene(projectId: string, sceneId: string) {
  return makeEmptySceneData(projectId, sceneId);
}
