import { create } from 'zustand';
import { DEFAULT_ENVIRONMENT, type EnvSchema, type ProjectSceneSchema } from '@/types/scene';

// 씬 스토어 — **씬 메타(어떤 씬을 열었나) + 환경 + 저장 상태 + 카메라 요청.**
//
// ★ 2026-07-31 전면 축소: 2,551줄 → 이 크기.
//   구 오브젝트 시스템(2d)을 걷어내며 오브젝트 CRUD·선택·다중선택·그룹/재부모화·프리팹·클로너·
//   모터/액추에이터·애니 클립·게임 변수·HUD·씬 이벤트·에셋·재질/색 에셋·클립보드·정렬·배열·
//   Undo/Redo 히스토리를 **전부 삭제**했다.
//
// ★ **브릭은 여기 없다** — `brickStore`가 따로 들고 있고(월드·도구), 데이터는 `brick_chunks`에 청크로 저장된다.
//   그래서 이 스토어의 `isModified`는 **환경(시작 뷰·노출) 변경**만 뜻한다.
//   브릭 저장은 `BrickScene`의 자동 저장이 담당한다(별도 경로).
//
// ⚠️ Undo/Redo는 지금 **없다.** 예전 히스토리는 오브젝트 스냅샷 기반이라 브릭엔 한 줄도 못 쓴다.
//   브릭 Undo는 "놓기/지우기 명령"을 되돌리는 별도 설계가 필요하다(다음 작업).

interface CameraViewRequest {
  view: 'top' | 'front' | 'right';
  /** 같은 시점을 연달아 눌러도 effect가 다시 돌게 하는 nonce */
  n: number;
}

interface SceneState {
  projectId: string | null;
  sceneId: string | null;
  environment: EnvSchema;

  /** 씬 로드 카운터 — loadScene마다 증가. 에디터가 '로드 직후 1회 카메라 리셋'을 이 값 변화로 감지 */
  sceneLoadTick: number;
  isModified: boolean;
  /** 낙관적 잠금용 행 리비전 — 저장 시 이 값과 DB가 일치해야 통과 */
  savedVersion: number;

  /** ▶ 플레이(뷰어 오버레이) 중인지 — 에디터 캔버스 렌더 루프를 멈추는 데 쓴다 */
  editorPlaying: boolean;

  focusAllRequest: number | null;
  cameraViewRequest: CameraViewRequest | null;
  startViewSaveRequest: number | null;

  loadScene: (data: ProjectSceneSchema, savedVersion?: number) => void;
  updateEnvironment: (patch: Partial<EnvSchema>) => void;
  /** 예전 히스토리 커밋 지점 — 지금은 "변경됨" 표시만 한다(Undo 미구현) */
  pushHistory: () => void;
  markSaved: (savedVersion?: number) => void;
  markModified: () => void;
  setEditorPlaying: (playing: boolean) => void;

  requestFocusAll: () => void;
  requestCameraView: (view: CameraViewRequest['view']) => void;
  requestSaveStartView: () => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  projectId: null,
  sceneId: null,
  environment: { ...DEFAULT_ENVIRONMENT },

  sceneLoadTick: 0,
  isModified: false,
  savedVersion: 1,
  editorPlaying: false,

  focusAllRequest: null,
  cameraViewRequest: null,
  startViewSaveRequest: null,

  loadScene: (data, savedVersion = 1) =>
    set((s) => ({
      projectId: data.projectId,
      sceneId: data.sceneId,
      environment: data.environment ?? { ...DEFAULT_ENVIRONMENT },
      isModified: false,
      savedVersion,
      sceneLoadTick: s.sceneLoadTick + 1,
    })),

  updateEnvironment: (patch) => set((s) => ({ environment: { ...s.environment, ...patch }, isModified: true })),

  pushHistory: () => set({ isModified: true }),
  markSaved: (savedVersion) => set((s) => ({ isModified: false, savedVersion: savedVersion ?? s.savedVersion })),
  markModified: () => set({ isModified: true }),
  setEditorPlaying: (playing) => set({ editorPlaying: playing }),

  requestFocusAll: () => set({ focusAllRequest: Date.now() }),
  requestCameraView: (view) => set((s) => ({ cameraViewRequest: { view, n: (s.cameraViewRequest?.n ?? 0) + 1 } })),
  requestSaveStartView: () => set({ startViewSaveRequest: Date.now() }),
}));
