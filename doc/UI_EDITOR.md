# UI_EDITOR: 에디터 UI 및 컴포넌트 명세

> **에디터는 데스크탑 전용이다 (최소 1280px 너비).** 모바일/태블릿 접속 시 "에디터는 PC에서 이용해 주세요" 안내 화면을 표시하고 에디터 레이아웃을 렌더링하지 않는다. 뷰어(`/space/:sceneId`)는 별도로 모바일을 지원한다.

> **디자인 기준**: `doc/ChatGPT Image 2026년 7월 1일 오전 09_47_49.png` 이미지를 기준 디자인으로 한다.
> 라이트 모드(이미지 기준) + 다크 모드 토글을 지원한다. 기본값은 다크 모드.

---

## 1. 전체 레이아웃

에디터는 CSS Grid 기반 3패널 구조를 사용한다. 전체 화면(`100vw × 100vh`)을 채운다.
**기존 하단 AssetBrowser 띠(180px)를 제거하고 왼쪽 패널 하단으로 통합.**

```
┌─────────────────────────────────────────────────────────────┐
│  [←] [앱명]  [프로젝트명] — [씬명 ▼]     [Preview] [Publish] │  48px 고정
├──────────────────┬──────────────────────────┬───────────────┤
│  Objects         │  [툴바 아이콘 + 단축키]  │  Inspector    │
│  [검색창]        │                          │               │
│  ├ Scene         │   EditorCanvas           │  [오브젝트명] │
│  ├ Light         │   (Viewport)             │  Transform    │
│  └ Wall          │                          │  Material     │
│    ├ Roof        │                          │  Physics      │
│    └ Door        │                          │  Events       │
│──────────────────│  [Pos / Rot / Scale 바]  │               │
│  Assets          │                          │               │
│  [탭: Models…]   │                          │               │
│  [썸네일 그리드] │                          │               │
└──────────────────┴──────────────────────────┴───────────────┘
```

**CSS Grid 설정 (`EditorLayout.tsx`):**
```css
display: grid;
grid-template-columns: 240px 1fr 280px;
grid-template-rows: 48px 1fr;   /* 하단 행 제거 */
width: 100vw;
height: 100vh;
```

**왼쪽 패널 내부 분할 (flex column):**
- Objects 영역: `flex: 1 1 60%`, 최소 높이 200px, 세로 스크롤
- Assets 영역: `flex: 0 0 40%`, 최소 높이 160px, 세로 스크롤
- 두 영역 사이 드래그 핸들로 비율 조절 가능 (선택 구현)

---

## 2. ViewportToolbar (`panels/ViewportToolbar.tsx`)

### 상단 헤더 바 구조

```
[←] Park3D   |   My Project — Main Scene ▼        [Preview] [Publish] [🌙/☀]
```

- `[←]`: 대시보드 복귀 링크
- `프로젝트명 — 씬명 ▼`: 클릭 시 씬 목록 드롭다운 (씬 전환 + 새 씬 추가)
- `isModified: true`일 때 씬명 옆 `•` 미저장 표시
- `[🌙/☀]`: 다크/라이트 모드 토글 버튼 (우측 끝)

### 뷰포트 툴바 (Canvas 상단 오버레이)

```
[↔이동] [↻회전] [⤢스케일]  |  [World▼]  [스냅□ 1▼]  |  [그리드] [와이어] [환경🌤]
```

- 모든 버튼은 **아이콘 + hover 시 툴팁** (단축키 포함) 표시
  - 예: 이동 버튼 hover → `"이동 (W)"`
- 활성 버튼: 배경 강조 (다크: violet-700, 라이트: violet-100)

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
| `Delete` / `Backspace` | 선택 오브젝트 삭제 (그룹이면 자손 포함 전체 삭제) |
| `Ctrl+D` | 선택 오브젝트 복제 |
| `W` / `E` / `R` | Transform 모드 전환 |
| `Ctrl+G` | 선택 오브젝트들을 그룹으로 묶음 (centroid 기준 그룹 생성) |
| `Ctrl+Shift+G` | 선택 그룹 해제 (자식을 월드 좌표로 복원) |

---

## 3. HierarchyPanel (`panels/HierarchyPanel.tsx`)

### 렌더링 규칙
- `objects` 배열을 `parentId` 기준으로 **재귀 트리**로 렌더링 (`renderTree(parentId, depth)`)
- `parentId: null`인 오브젝트가 루트 레벨
- 자식 오브젝트는 들여쓰기 `paddingLeft: 8 + depth * 16px`
- 레이어 탭 없음 — 그룹 시스템이 계층 구조를 대체

### 그룹 항목 동작
- `isGroup: true` 오브젝트: `📁` 아이콘 + `▶/▼` 펼치기/접기 토글
- 접힌 상태: 자식이 리스트에서 숨겨짐 (렌더링 안 됨)
- 검색 중: 모든 그룹 자동 펼침
- 이름 더블클릭: 그룹은 편집 불가 (일반 오브젝트만 더블클릭 이름 편집)

### 선택 방식
- **단일 클릭**: `selectObject(id)`, anchorIndex 갱신
- **Shift+클릭**: `anchorIndexRef` 기준으로 `flatList` 범위 선택 → `selectObjects(ids[])`
  - `flatList`: 현재 펼쳐진 트리를 선형화한 목록 (범위 계산 기준)
- **캔버스 Shift+클릭**: `toggleSelectObject(id)` — 개별 토글

### 각 항목 요소
- **이름 텍스트**: 클릭 시 `selectObject(id)` 호출
- **눈 아이콘**: `visible` 토글 (hover 시 표시)
- **자물쇠 아이콘**: `locked` 토글 (hover 시 표시)

### 시각적 상태
| 상태 | 표시 |
|---|---|
| 선택됨 (`selectedIds` 포함 또는 `selectedId`) | 보라색 배경 (violet-600/30) |
| `locked: true` | 이름 텍스트 회색 (zinc-500) |
| `visible: false` | opacity 0.4 |
| hover | zinc-800 배경 |

### 컨텍스트 메뉴 (우클릭)
- 이름 변경 (일반 오브젝트만)
- 그룹 해제 (`Ctrl+Shift+G`, 그룹 오브젝트만)
- 복제 (`Ctrl+D`)
- 삭제 (`Delete`, 구분선 아래 빨간색)

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

### [Particle 섹션]
`object.particle`이 존재할 때 표시. Material 섹션 대신 렌더링됨.

| 필드 | 타입 | 동작 |
|---|---|---|
| Preset | 드롭다운 | `fire` / `dust` / `light` / `snow` — 선택 시 기본값 자동 적용 |
| Color | 컬러피커 | 파티클 색상 |
| Count | 슬라이더 | 파티클 수 (1~2000) |
| Speed | 슬라이더 | 방출 속도 |
| Spread | 슬라이더 | 퍼짐 각도 |
| Size | 슬라이더 | 파티클 크기 |

### [그룹 전용 Inspector]
`object.isGroup: true`이면 일반 Inspector 대신 표시.
- 이름 편집, Transform 섹션, Visible/Locked 토글
- "그룹 해제: Ctrl+Shift+G" 힌트 표시

### [Visibility 섹션]
| 필드 | 타입 |
|---|---|
| Visible | 토글 스위치 |
| Locked | 토글 스위치 |

---

## 5. AssetBrowser (`panels/AssetBrowser.tsx`)

> **위치 변경**: 하단 가로 띠(180px) → **왼쪽 패널 하단** (Objects 아래)으로 이동.
> 세로 그리드 레이아웃으로 전환. 수평 스크롤 제거.

### 탭 구성
| 탭 | 내용 | 구현 상태 |
|---|---|---|
| All Assets | 전체 에셋 목록 | ✅ 현재 구현 |
| Models | 업로드된 .glb 파일 | ✅ 현재 구현 |
| Materials | 재질 프리셋 (색상/PBR) | 🔜 Phase B |
| Textures | 이미지 텍스처 파일 | 🔜 Phase B |
| HDR | 환경맵 (.hdr/.exr) | 🔜 Phase C (환경 패널 연동) |
| Audio | 배경음/효과음 | ⏳ Phase 5 (장기) |

- 미구현 탭: 클릭 시 "준비 중입니다" 안내 표시 (빈 탭 X)

### 도형/콘텐츠/파티클 추가 위치
- 기존 AssetBrowser 탭(도형/콘텐츠/파티클)은 **왼쪽 패널 상단 Objects 영역 하단 버튼 그룹**으로 이동
- 또는 `[+ 추가]` 버튼 클릭 → 미니 드롭다운으로 도형/콘텐츠/파티클/에셋 선택

### 레이아웃
- **세로 그리드**: 2열 고정, 타일 크기 64×64px
- 각 타일: 파일명 + 썸네일 (없으면 기본 아이콘)
- 패널 높이에 맞춰 세로 스크롤

### 동작 규칙
| 동작 | 결과 |
|---|---|
| 타일 클릭 | 씬 중앙 (0, 0, 0)에 ObjectNode 생성 후 자동 선택 |
| 타일 → EditorCanvas 드래그앤드롭 | 마우스 레이캐스팅 좌표에 ObjectNode 생성 |
| 영역 내 `.glb` 파일 드롭 | Supabase Storage 업로드 시작 |
| 파일 선택 버튼 클릭 | 파일 다이얼로그 → `.glb` 선택 → 업로드 |

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

`selectedIds.length > 1`이면 `MultiGizmo`, 그 외에는 `SingleGizmo`를 렌더링.

### SingleGizmo
- `selectedObjectId`가 존재하고 `locked: false`일 때 마운트
- Three.js `TransformControls`를 해당 오브젝트 mesh에 attach
- `mode`: translate / rotate / scale
- `space`: World / Local

### MultiGizmo
- `selectedIds`가 2개 이상일 때 마운트
- 선택 오브젝트들의 위치 평균(centroid)에 가상 피벗 `<group>` 배치
- `useState`를 ref callback으로 사용: `<group ref={setPivotEl} />` — 마운트 시점에 re-render 트리거
- `TransformControls`를 피벗 group에 attach
- **translate 전용**: scale/rotate는 단일 오브젝트에만 허용
- `onMouseDown`: 피벗 위치 + 모든 선택 오브젝트 위치 스냅샷
- `onChange`: 피벗 delta를 모든 선택 오브젝트의 Three.js ref에 즉시 반영 (히스토리 미기록)
- `onMouseUp`: 최종 위치를 스토어에 일괄 `updateObject` 호출

### 이벤트 처리 (공통)
| 이벤트 | 동작 |
|---|---|
| 드래그 시작 (`mouseDown`) | `OrbitControls.enabled = false` |
| 드래그 중 (`objectChange`) | `updateTransform` — 히스토리 미기록 |
| 드래그 종료 (`mouseUp`) | `OrbitControls.enabled = true`, 스토어에 최종 위치 반영 |

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

---

## 9. 뷰포트 상태바 (`canvas/ViewportStatusBar.tsx`) 🔜 Phase A

Canvas 하단에 절대 위치로 오버레이. 선택된 오브젝트의 Transform 수치를 실시간 표시.

```
Position: 3.46, 0.00, -3.30  |  Rotation: 0°, 45°, 0°  |  Scale: 1.30, 1.30, 1.30  |  Perspective
```

- 오브젝트 미선택 시: 빈 상태 또는 카메라 위치만 표시
- 숫자는 소수점 2자리 고정
- `Perspective` / `Orthographic` 현재 카메라 타입 표시 (우측 끝)
- 스타일: 반투명 배경, 작은 모노스페이스 폰트 (다크: zinc-900/80, 라이트: white/80)

---

## 10. 테마 시스템 🔜 Phase C

### 목표
- 라이트 모드(기준 디자인 이미지) + 다크 모드 토글 지원
- 기본값: 다크 모드
- 설정은 `localStorage`에 저장

### 구현 방식
CSS 변수(`--color-bg`, `--color-panel`, `--color-border`, `--color-text` 등)를 루트에 정의하고,
모든 컴포넌트의 하드코딩된 `bg-zinc-950` 등 Tailwind 클래스를 CSS 변수 기반으로 교체.

```css
/* 다크 모드 (기본) */
[data-theme="dark"] {
  --color-bg: #09090b;          /* zinc-950 */
  --color-panel: #18181b;       /* zinc-900 */
  --color-border: #27272a;      /* zinc-800 */
  --color-text: #d4d4d8;        /* zinc-300 */
  --color-text-muted: #71717a;  /* zinc-500 */
  --color-accent: #7c3aed;      /* violet-700 */
}

/* 라이트 모드 */
[data-theme="light"] {
  --color-bg: #f4f4f5;          /* zinc-100 */
  --color-panel: #ffffff;
  --color-border: #e4e4e7;      /* zinc-200 */
  --color-text: #18181b;        /* zinc-900 */
  --color-text-muted: #71717a;  /* zinc-500 */
  --color-accent: #7c3aed;      /* violet-700 */
}
```

### 적용 범위
에디터 전체(`EditorClient`) + 대시보드 + 계정 페이지.
뷰어(`/space/:sceneId`)는 테마 적용 제외 — 씬 배경색이 기준.

### 리스크
모든 컴포넌트의 Tailwind 색상 클래스를 전수 교체해야 함 (수십 개 파일).
Phase C 진입 전 충분한 일정 확보 필요.
