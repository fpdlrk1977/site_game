// scene_data 안의 프로젝트/씬 id·에셋 참조·go_to_scene 값을 복사본(복제/리믹스) 것으로 리맵.
// 프로젝트 복제(dashboard)와 커뮤니티 리믹스가 공유한다.
export function remapSceneData(
  raw: Record<string, unknown>,
  newProjectId: string,
  newSceneId: string,
  assetMap: Map<string, { id: string; dracoUrl: string; thumbUrl?: string }>,
  sceneIdMap: Map<string, string>,
): Record<string, unknown> {
  const data = JSON.parse(JSON.stringify(raw ?? {}));
  data.projectId = newProjectId;
  data.sceneId = newSceneId;

  if (Array.isArray(data.assets)) {
    data.assets = data.assets.map((a: Record<string, unknown>) => {
      const m = typeof a?.id === 'string' ? assetMap.get(a.id) : undefined;
      if (!m) return a;
      return { ...a, id: m.id, dracoUrl: m.dracoUrl, ...(m.thumbUrl ? { thumbnailUrl: m.thumbUrl } : {}) };
    });
  }

  if (Array.isArray(data.objects)) {
    for (const o of data.objects as Record<string, unknown>[]) {
      if (typeof o?.assetId === 'string' && assetMap.has(o.assetId)) o.assetId = assetMap.get(o.assetId)!.id;
      if (Array.isArray(o?.events)) {
        for (const ev of o.events as Record<string, unknown>[]) {
          if (ev?.action === 'go_to_scene' && typeof ev.value === 'string' && sceneIdMap.has(ev.value)) {
            ev.value = sceneIdMap.get(ev.value);
          }
        }
      }
    }
  }
  return data;
}
