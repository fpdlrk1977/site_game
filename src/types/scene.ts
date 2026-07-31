// 씬 데이터 스키마 — `scenes.scene_data`(jsonb)에 저장되고 에디터·뷰어·임베드가 공유한다.
//
// ★ 2026-07-31 전면 축소: 700줄 → 이 크기.
//   구 오브젝트 시스템(2d)을 걷어내며 **오브젝트·에셋·재질·프리팹·이벤트·변수·HUD·애니 클립·
//   물리·조명·하늘·안개·바닥·경계·플레이어·후처리 스키마를 전부 삭제**했다.
//
// ★ **브릭은 여기 없다.** 격자 브릭은 `brick_chunks` 테이블에 청크 단위 바이너리로 따로 산다
//   (씬 하나가 수십만 브릭이 될 수 있어 jsonb 한 행에 담을 수 없다).
//   그래서 `scene_data`는 이제 **씬을 여는 방법**(시작 뷰·노출)만 담는다.

/** 3D 좌표 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** 게시 뷰어가 처음 열릴 때의 카메라 — 에디터에서 "현재 시점으로 저장"한 값 */
export interface StartView {
  position: Vector3;
  target: Vector3;
  /** 저장 당시 화각. 없으면 뷰어 기본값 */
  fov?: number;
}

export interface EnvSchema {
  /** 게시 시작 뷰(미설정 = 기본 시점) */
  startView?: StartView;
  /** 톤매핑 노출 — 저장 색 대비 밝기. 기본 1 */
  toneMappingExposure?: number;
}

export const DEFAULT_ENVIRONMENT: EnvSchema = {};

export interface ProjectSceneSchema {
  projectId: string;
  sceneId: string;
  version: number;
  environment: EnvSchema;
}

export const SCENE_VERSION = 1;

export function makeEmptySceneData(projectId: string, sceneId: string): ProjectSceneSchema {
  return { projectId, sceneId, version: SCENE_VERSION, environment: { ...DEFAULT_ENVIRONMENT } };
}

/**
 * DB에서 읽은 raw jsonb를 스키마로 정규화한다.
 *
 * ⚠️ 옛 씬엔 objects·assets·prefabs 같은 필드가 그대로 남아 있다 — **읽지 않고 버린다.**
 *   (하위호환은 폐기했다. 다시 저장하는 순간 그 필드들도 사라진다.)
 *   projectId/sceneId는 **인자를 신뢰한다** — 씬 복제 시 raw 안의 값은 원본을 가리키기 때문.
 */
export function normalizeSceneData(
  raw: Record<string, unknown>,
  projectId: string,
  sceneId: string,
): ProjectSceneSchema {
  const env = (raw.environment as EnvSchema | undefined) ?? {};
  return {
    projectId,
    sceneId,
    version: typeof raw.version === 'number' ? raw.version : SCENE_VERSION,
    environment: {
      startView: env.startView,
      toneMappingExposure: typeof env.toneMappingExposure === 'number' ? env.toneMappingExposure : undefined,
    },
  };
}
