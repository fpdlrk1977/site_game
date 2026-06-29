# UI_EDITOR: 에디터 UI 및 컴포넌트 명세

> **에디터는 데스크탑 전용이다 (최소 1280px 너비).** 모바일/태블릿 접속 시 "에디터는 PC에서 이용해 주세요" 안내 화면을 표시하고 에디터 레이아웃을 렌더링하지 않는다. 뷰어(`/space/:sceneId`)는 별도로 모바일을 지원한다.

---

## 1. 전체 레이아웃

에디터는 CSS Grid 기반 4패널 구조를 사용한다. 전체 화면(`100vw × 100vh`)을 채운다.

```
┌─────────────────────────────────────────────────────────┐
│                    ViewportToolbar                       │  48px 고정
├────────────────┬───────────────────────┬────────────────┤
│                │                       │                │
│  Hierarchy     │     EditorCanvas      │   Inspector    │
│   Panel        │     (Viewport)        │    Panel       │
│   240px 고정   │     flex-grow: 1      │   280px 고정   │
│                │                       │                │
├────────────────┴───────────────────────┴────────────────┤
│                    AssetBrowser                          │  180px 고정
└─────────────────────────────────────────────────────────┘
```

**CSS Grid 설정 (`EditorLayout.tsx`):**
```css
display: grid;
grid-template-columns: 240px 1fr 280px;
grid-template-rows: 48px 1fr 180px;
width: 100vw;
height: 100vh;
```

---

## 2. ViewportToolbar (`panels/ViewportToolbar.tsx`)

### 씬 전환 드롭다운 (추가)

```
[W] [E] [R]  World▼  |  ← Scene 1 ▼ →  |  [Ctrl+S 저장*]  [미리보기]
```

- 씬 드롭다운 클릭 → 현재 프로젝트의 씬 목록 + `[+ 새 씬]` 표시
- 씬 선택 시 변경사항 있으면 저장 확인 → `editorStore.loadScene(newSceneData)`로 교체
- 저장 버튼 옆 `*` 표시: `isModified: true`일 때 표시

---

## 2-A. ViewportToolbar (`panels/ViewportToolbar.tsx`) — 원래 명세

에디터 상단 고정 툴바. 좌측 정렬 버튼 그룹과 우측 액션 버튼으로 구성.

### 좌측: Transform 모드 버튼 (토글 그룹)
- **Translate** (단축키 `W`): TransformControls mode = 'translate'
- **Rotate** (단축키 `E`): TransformControls mode = 'rotate'
- **Scale** (단축키 `R`): TransformControls mode = 'scale'

### 좌측: 공간 기준 버튼 (토글)
- **World / Local** 토글: TransformControls space 속성 전환

### 우측: 액션 버튼
- **저장** (`Ctrl+S`): `editorStore.isModified`가 true일 때 활성화. 클릭 시 Supabase upsert
- **미리보기**: 현재 sceneId로 `/space/:sceneId`를 새 탭에서 열기

### 전역 단축키 (에디터 전체에서 동작)
| 단축키 | 동작 |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | 선택 오브젝트 삭제 |
| `Ctrl+D` | 선택 오브젝트 복제 |
| `W` / `E` / `R` | Transform 모드 전환 |

---

## 3. HierarchyPanel (`panels/HierarchyPanel.tsx`)

### 렌더링 규칙
- `editorStore.objects` 배열을 `parentId` 기준으로 트리 구조로 렌더링
- `parentId: null`인 오브젝트가 루트 레벨
- 자식 오브젝트는 들여쓰기(16px/depth) 표시

### 각 항목 요소
- **이름 텍스트**: 클릭 시 `selectObject(id)` 호출
- **눈 아이콘**: `visible` 토글
- **자물쇠 아이콘**: `locked` 토글

### 시각적 상태
| 상태 | 표시 |
|---|---|
| 선택됨 | 파란색 배경 |
| `locked: true` | 이름 텍스트 회색 |
| `visible: false` | 이름 텍스트 반투명(opacity 0.4) |
| hover | 연한 배경 강조 |

### 컨텍스트 메뉴 (우클릭)
- 복제 (`Ctrl+D`)
- 삭제 (`Delete`)
- 그룹화 (빈 부모 노드 생성 후 `parentId` 연결)

### 드래그앤드롭
- 항목을 다른 항목 위로 드래그 → `parentId` 변경 (계층 재구성)
- 항목을 루트 영역으로 드래그 → `parentId: null`로 변경

---

## 4. InspectorPanel (`panels/InspectorPanel.tsx`)

`selectedObjectId === null`이면 "오브젝트를 선택하세요" 안내 메시지 표시.
선택 시 아래 4개 섹션을 순서대로 표시한다.

### [Transform 섹션]
| 필드 | 타입 | 동작 |
|---|---|---|
| Position X/Y/Z | 숫자 인풋 | 기즈모와 양방향 실시간 바인딩 |
| Rotation X/Y/Z | 숫자 인풋 (Euler Degree) | 기즈모와 양방향 실시간 바인딩 |
| Scale X/Y/Z | 숫자 인풋 | Lock Proportions 체크박스로 비율 고정 |

- 인풋 값 변경 시 즉시 `updateTransform` 호출
- 인풋 포커스 해제(blur) 시 `saveToHistory` 호출

### [Physics 섹션]
| 필드 | 타입 | 동작 |
|---|---|---|
| Enabled | 토글 스위치 | `physics.enabled` |
| Collider Type | 드롭다운 | box / sphere / capsule / hull / trimesh |
| Is Sensor | 체크박스 | true: area_enter 감지 전용, 플레이어 통과 |
| Mass | 슬라이더 0~10 | 0 = static |
| Friction | 슬라이더 0~1 | |
| Restitution | 슬라이더 0~1 | 탄성 |

- `enabled: false`이면 나머지 Physics 필드 비활성화(disabled) 처리

### [Events 섹션]
- 이벤트 목록: `events[]` 배열 렌더링
- 각 이벤트 행:
  - **Trigger** 드롭다운: `click` / `hover_enter` / `area_enter`
  - **Action** 드롭다운: `open_url` / `show_popup` / `emit_event` / `play_animation`*(Phase 4)*
  - **Value** 텍스트 인풋:
    - `open_url`: 이동할 URL 문자열
    - `show_popup`: 표시할 마크다운 문자열
    - `emit_event`: 발행할 이벤트 이름 (예: `add_to_cart`)
    - `play_animation` *(Phase 4 deferred)*: .glb 파일에 내장된 AnimationClip 이름
  - `emit_event` 선택 시 **Payload** 키-값 편집기 추가 표시
  - `play_animation` 선택 시 "Phase 4 기능입니다" 안내 문구 표시 (저장은 되지만 뷰어에서 미실행)
  - **삭제** 버튼 (X)
- **이벤트 추가** 버튼: 빈 EventSchema를 `events[]`에 push

> **`play_animation` Phase 4 구현 계획 (메모)**
> - `ObjectNodeSchema`에 `animationClip: string | null` 필드 추가 예정
> - 뷰어의 `SceneObject.tsx`에서 `useAnimations()` 훅으로 AnimationMixer 바인딩
> - Phase 3에서는 EventHandler가 `play_animation` 액션을 수신해도 콘솔 경고만 출력하고 무시

### [Visibility 섹션]
| 필드 | 타입 |
|---|---|
| Visible | 토글 스위치 |
| Locked | 토글 스위치 |
| Layer | 텍스트 인풋 |

---

## 5. AssetBrowser (`panels/AssetBrowser.tsx`)

### 레이아웃
- 수평 스크롤 가능한 그리드 타일 (타일 크기: 80×80px)
- 각 타일: `.glb` 파일명 + 썸네일 이미지 (없으면 기본 큐브 아이콘)

### 동작 규칙
| 동작 | 결과 |
|---|---|
| 타일 클릭 | 씬 중앙 (0, 0, 0)에 ObjectNode 생성 후 자동 선택 |
| 타일 → EditorCanvas 드래그앤드롭 | 마우스 레이캐스팅 좌표에 ObjectNode 생성 |
| 영역 내 `.glb` 파일 드롭 | Supabase Storage 업로드 시작 |
| 파일 선택 버튼 클릭 | 파일 다이얼로그 열기 → `.glb` 선택 → 업로드 |

### 업로드 중 상태
- 해당 타일 위치에 진행 스피너 표시
- 업로드 완료 후 `draco_url` 갱신되면 타일 정상 표시

---

## 6. EditorCanvas (`canvas/EditorCanvas.tsx`)

- R3F `<Canvas>` 컴포넌트. **`<Physics>` 컨텍스트 없음** — 에디터에선 물리 시뮬레이션 비활성
- `<OrbitControls>` 기본 활성, GizmoController 드래그 중 `enabled={false}`
- `editorStore.objects`를 순회하여 `<EditorObjectInstance>` 렌더링
- 빈 공간 클릭(배경 클릭) 시 `selectObject(null)` 호출
- `<EditorGrid>`: Y=0 평면에 GridHelper 렌더링

---

## 7. GizmoController (`canvas/GizmoController.tsx`)

- `selectedObjectId`가 존재하고 해당 오브젝트의 `locked: false`일 때만 마운트
- Three.js `TransformControls`를 R3F `<primitive>`로 래핑
- `mode`: ViewportToolbar의 활성 모드(translate/rotate/scale)와 동기화
- `space`: ViewportToolbar의 World/Local 설정과 동기화

### 이벤트 처리
| 이벤트 | 동작 |
|---|---|
| 드래그 시작 (`mouseDown`) | `OrbitControls.enabled = false` |
| 드래그 중 (`objectChange`) | `updateTransform(id, newTransform)` — 히스토리 미기록 |
| 드래그 종료 (`mouseUp`) | `OrbitControls.enabled = true`, `saveToHistory(delta)` 호출 |

---

## 8. 환경 설정 패널 (`panels/EnvironmentPanel.tsx`)

에디터 좌측 Hierarchy 패널 하단 또는 ViewportToolbar의 `[환경]` 버튼 클릭 시 표시되는 별도 패널.
`editorStore.environment` (`EnvSchema`)를 편집한다.

### 진입 방법
- ViewportToolbar 우측에 `[🌤 환경]` 버튼 추가
- 클릭 시 Inspector 패널 자리를 EnvironmentPanel로 교체 (토글 방식)
- 오브젝트 선택 시 다시 Inspector로 자동 복귀

### [하늘(Sky) 섹션]
| 필드 | 타입 | 동작 |
|---|---|---|
| 타입 | 드롭다운 | `color` (단색) / `hdr` (HDR 이미지) |
| 색상 / HDR URL | 컬러피커 or 텍스트 인풋 | 타입에 따라 조건부 표시 |

- `type: 'color'` → 컬러피커로 배경색 선택, R3F `<color attach="background">` 적용
- `type: 'hdr'` → URL 인풋, `<Environment files={url}>` 적용

### [안개(Fog) 섹션]
| 필드 | 타입 |
|---|---|
| Enabled | 토글 스위치 |
| Color | 컬러피커 |
| Near | 숫자 인풋 (안개 시작 거리) |
| Far | 숫자 인풋 (안개 완전 불투명 거리) |

- `enabled: false`이면 나머지 필드 비활성화
- Three.js `<fogExp2>` 또는 `<fog>` attach로 적용

### [조명(Lights) 섹션]
| 필드 | 타입 |
|---|---|
| Ambient Intensity | 슬라이더 0~3 |
| Directional Position X/Y/Z | 숫자 인풋 |
| Directional Intensity | 슬라이더 0~3 |

- 변경 즉시 씬에 반영 (`updateEnvironment` 호출)
- 에디터에서 변경한 환경 설정도 씬 저장 시 `ProjectSceneSchema.environment`에 포함됨
