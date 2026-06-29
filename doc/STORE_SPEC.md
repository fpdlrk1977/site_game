# STORE_SPEC: Zustand 스토어 전체 명세

AI가 스토어에 접근하거나 액션을 추가할 때 반드시 이 shape를 따라야 한다.
스토어를 임의로 변경하거나 인터페이스를 외부에 중복 정의하는 것을 금지한다.

---

## 1. editorStore (`src/store/editorStore.ts`)

에디터의 유일한 진실 공급원(SSOT). 씬 데이터와 히스토리를 관리한다.

### State Shape

```typescript
import { ObjectNodeSchema, EnvSchema, ProjectSceneSchema, PhysicsSchema, EventSchema } from '@/types/schema';

interface Delta {
  objectId: string;
  prev: Partial<ObjectNodeSchema>;
  next: Partial<ObjectNodeSchema>;
}

interface SceneListItem {
  id: string;
  name: string;
}

interface EditorState {
  // 씬 메타
  projectId: string | null;
  sceneId: string | null;
  sceneName: string;            // ViewportToolbar 드롭다운에 표시할 현재 씬 이름
  isModified: boolean;          // 저장되지 않은 변경사항 여부

  // 현재 프로젝트의 씬 목록 (ViewportToolbar 드롭다운 데이터 소스)
  sceneList: SceneListItem[];

  // 씬 데이터
  objects: ObjectNodeSchema[];
  environment: EnvSchema;
  assets: AssetRefSchema[];     // 씬에 등록된 에셋 (dracoUrl 포함)

  // 선택 상태
  selectedObjectId: string | null;
  hoveredObjectId: string | null;

  // 히스토리 (Command Pattern - Delta 방식)
  past: Delta[];                // undo 스택 (최대 50개)
  future: Delta[];              // redo 스택
}
```

### Actions

```typescript
interface EditorActions {
  // 오브젝트 CRUD
  addObject: (node: ObjectNodeSchema) => void;
  removeObject: (id: string) => void;
  duplicateObject: (id: string) => void;

  // Transform 업데이트
  // 기즈모 드래그 중 매 프레임 호출 — 히스토리 기록 안 함
  updateTransform: (
    id: string,
    partial: Partial<Pick<ObjectNodeSchema, 'position' | 'rotation' | 'scale'>>
  ) => void;

  // Physics 업데이트
  updatePhysics: (id: string, partial: Partial<PhysicsSchema>) => void;

  // 이벤트 업데이트
  updateEvents: (id: string, events: EventSchema[]) => void;

  // 선택
  selectObject: (id: string | null) => void;
  setHoveredObject: (id: string | null) => void;

  // 히스토리 (드래그 종료 mouseup 시점에만 호출)
  saveToHistory: (delta: Delta) => void;
  undo: () => void;
  redo: () => void;

  // 씬 로드 / 초기화
  loadScene: (scene: ProjectSceneSchema, sceneName: string) => void;
  clearScene: () => void;
  markSaved: () => void;        // 저장 완료 후 isModified = false

  // 씬 목록 (에디터 진입 시 또는 씬 생성/삭제 후 갱신)
  setSceneList: (scenes: SceneListItem[]) => void;

  // 에셋 등록 (AssetBrowser에서 업로드 완료 시 호출)
  registerAsset: (asset: AssetRefSchema) => void;

  // 환경 설정
  updateEnvironment: (partial: Partial<EnvSchema>) => void;
}
```

### 구현 규칙

| 규칙 | 내용 |
|---|---|
| `updateTransform` | 히스토리 미기록. 기즈모 드래그 중 60fps로 호출되어도 무방 |
| `saveToHistory` | 드래그 종료(mouseup) 시점에만 호출 |
| `past` 최대 크기 | 50개. 초과 시 가장 오래된 Delta 제거 |
| `undo` | `past`에서 pop → `prev`로 복원 → `future`에 push |
| `redo` | `future`에서 pop → `next`로 복원 → `past`에 push |
| `addObject` / `removeObject` | 자동으로 `saveToHistory` 호출하여 실행 취소 지원 |

---

## 2. uiStore (`src/store/uiStore.ts`)

팝업, 로딩 등 순수 UI 상태 관리. 씬 데이터를 포함하지 않는다.

### State Shape

```typescript
interface UIState {
  // 팝업 (show_popup 액션용)
  popup: {
    isOpen: boolean;
    content: string;    // 마크다운 스트링
  };

  // 전역 로딩
  isLoading: boolean;
  loadingMessage: string;

  // 전역 에러 토스트 (씬 로드 실패 / 저장 실패 / 업로드 실패 등)
  error: string | null;  // null이면 표시 안 함, 문자열이면 토스트 표시
}
```

### Actions

```typescript
interface UIActions {
  openPopup: (content: string) => void;
  closePopup: () => void;
  setLoading: (isLoading: boolean, message?: string) => void;
  setError: (message: string | null) => void;  // null로 호출하면 에러 토스트 닫힘
}
```

---

## 3. viewerStore (`src/store/viewerStore.ts`)

뷰어 런타임 전용 상태. 에디터에서 import 금지.

### State Shape

```typescript
interface ViewerState {
  playerPosition: { x: number; y: number; z: number };

  // 이미 트리거된 area_enter 이벤트 ID 목록 (재트리거 방지)
  triggeredEventIds: string[];
}
```

### Actions

```typescript
interface ViewerActions {
  setPlayerPosition: (pos: { x: number; y: number; z: number }) => void;
  markEventTriggered: (eventId: string) => void;
  resetSession: () => void;   // 씬 재시작 시 triggeredEventIds 초기화
}
```

---

## 스토어 간 의존성 규칙

```
editorStore ──► uiStore (팝업/로딩 표시 시 호출 가능)
viewerStore ──► uiStore (팝업 표시 시 호출 가능)
editorStore ✕ viewerStore (상호 참조 금지)
```

- `editorStore`와 `viewerStore`는 서로 참조하지 않는다.
- 두 스토어 모두 `uiStore`의 `openPopup`, `setLoading`은 호출할 수 있다.
