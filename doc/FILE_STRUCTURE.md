# FILE_STRUCTURE: 프로젝트 디렉토리 및 파일 구조

AI가 파일을 생성할 때 반드시 이 구조를 따라야 한다. 임의의 위치에 파일을 생성하는 것을 금지한다.

## 최상위 구조

```
site_game/
├── src/
│   ├── app/                    # Next.js App Router 라우트
│   ├── components/             # React 컴포넌트
│   ├── store/                  # Zustand 스토어
│   ├── types/                  # TypeScript 타입 정의
│   ├── lib/                    # 유틸리티 및 외부 클라이언트
│   ├── hooks/                  # 커스텀 React 훅
│   └── middleware.ts           # Next.js 미들웨어 (커스텀 도메인 + 인증 보호)
├── embed/                      # 임베드 번들 (Next.js와 별개의 Vite 프로젝트)
│   ├── main.tsx                # 진입점: #park3d-root에 뷰어 마운트
│   ├── vite.config.ts          # 빌드 결과물: public/embed.js
│   └── package.json
├── public/
│   ├── draco/                  # DracoDecoder WASM 파일
│   └── embed.js                # 임베드 번들 빌드 결과물 (CDN 배포)
├── doc/                        # 프로젝트 문서
└── supabase/
    ├── migrations/             # DB 마이그레이션 SQL
    └── functions/              # Edge Functions
```

---

## src/app/ (Next.js App Router)

```
app/
├── layout.tsx                          # 루트 레이아웃 (전역 폰트, 메타태그)
├── page.tsx                            # 루트: 세션 확인 후 /dashboard 또는 /login 리다이렉트
├── (auth)/
│   └── login/
│       └── page.tsx                    # 로그인 페이지 (Supabase Auth)
├── dashboard/
│   └── page.tsx                        # 프로젝트 목록 대시보드 (인증 필요)
├── editor/
│   └── [projectId]/
│       └── [sceneId]/
│           └── page.tsx                # 에디터 메인 페이지 (인증 필요)
├── space/
│   └── [sceneId]/
│       └── page.tsx                    # 런타임 뷰어 (공개, 에디터 코드 없음)
└── api/
    └── scenes/
        └── [sceneId]/
            └── route.ts                # GET /api/scenes/:sceneId (공개 API)
```

---

## src/components/ (React 컴포넌트)

```
components/
├── dashboard/                          # 대시보드 전용 컴포넌트
│   ├── ProjectCard.tsx                 # 프로젝트 카드 UI
│   ├── CreateProjectModal.tsx          # 신규 프로젝트 생성 모달
│   └── SceneManagerDrawer.tsx          # 씬 목록 드로어
│
├── editor/                             # 에디터 전용 — 뷰어에서 절대 import 금지
│   ├── EditorLayout.tsx                # 4패널 CSS Grid 컨테이너
│   ├── panels/
│   │   ├── HierarchyPanel.tsx          # 좌측: 오브젝트 트리
│   │   ├── InspectorPanel/             # 우측: 속성 편집기 (섹션별 분리)
│   │   │   ├── index.tsx               # 섹션 조합 및 레이아웃만 담당
│   │   │   ├── TransformSection.tsx    # Position / Rotation / Scale
│   │   │   ├── PhysicsSection.tsx      # Enabled / ColliderType / isSensor
│   │   │   ├── EventsSection.tsx       # 이벤트 목록 + 추가/삭제
│   │   │   └── VisibilitySection.tsx   # Visible / Locked / Layer
│   │   ├── AssetBrowser.tsx            # 하단: 에셋 브라우저 + 업로드
│   │   ├── EnvironmentPanel.tsx        # 환경 설정 (하늘/안개/조명)
│   │   └── ViewportToolbar.tsx         # 상단: Transform 모드 / 씬 드롭다운 / 저장
│   └── canvas/
│       ├── EditorCanvas.tsx            # R3F Canvas (Physics 없음)
│       ├── EditorGrid.tsx              # GridHelper 래퍼
│       ├── GizmoController.tsx         # TransformControls 관리
│       └── EditorObjectInstance.tsx    # 에디터 내 단순 mesh 렌더링
│
├── viewer/                             # 뷰어 전용 — 에디터에서 import 금지
│   ├── ViewerCanvas.tsx                # R3F Canvas (<Physics> 래퍼 포함)
│   ├── SceneObject.tsx                 # physics 값에 따라 Rapier 자동 적용
│   ├── PlayerController.tsx            # 캐릭터 RigidBody + 이동 + 점프
│   ├── FollowCamera.tsx                # 쿼터뷰 팔로우 카메라
│   ├── VirtualJoystick.tsx             # 모바일 조이스틱 + 점프 버튼 (HTML)
│   └── EventHandler.tsx               # click / hover_enter / area_enter 처리
│
└── ui/                                 # 에디터·뷰어 공용 UI
    ├── PopupModal.tsx                  # show_popup 액션용 HTML 팝업 모달
    ├── LoadingScreen.tsx               # 에셋 로딩 진행 표시
    ├── OutlineEffect.tsx               # hover 시 메쉬 외곽선 이펙트
    ├── PlanGate.tsx                    # 플랜 기반 기능 노출 JSX 래퍼 (PLAN_SPEC.md 참조)
    └── UpgradeBanner.tsx               # 플랜 업그레이드 유도 배너 (PlanGate 기본 fallback)
```

---

## src/store/ (Zustand 스토어)

```
store/
├── editorStore.ts      # 씬 데이터 + 히스토리 SSOT (STORE_SPEC.md 참조)
├── uiStore.ts          # 팝업 · 로딩 등 전역 UI 상태
├── viewerStore.ts      # 뷰어 플레이어 위치 + 트리거 이력
└── userStore.ts        # 로그인 사용자 정보 + planTier (PLAN_SPEC.md 참조)
```

---

## src/types/ (TypeScript 타입)

```
types/
└── schema.ts           # 모든 인터페이스 정의 (DATA_SCHEMA.md 기준)
```

---

## src/lib/ (유틸리티)

```
lib/
├── supabase.ts         # Supabase 클라이언트 초기화 (싱글턴)
├── assetLoader.ts      # useGLTF 프리로드 헬퍼 (중복 URL 제거 후 일괄 preload)
├── sceneSerializer.ts  # editorStore 상태 → ProjectSceneSchema JSON 직렬화
├── planGates.ts        # 플랜별 기능·수량 제한 단일 정의 (PLAN_SPEC.md 참조)
└── checkPlan.ts        # 서버 사이드 플랜 검증 (API Route 전용)
```

---

## src/hooks/ (커스텀 훅)

```
hooks/
├── useKeyboard.ts      # WASD + Space + Ctrl+Z/Y 키 입력 상태 관리
├── useGroundCheck.ts   # Rapier raycast 기반 캐릭터 접지 여부 감지
└── usePlan.ts          # 현재 유저 플랜 조회 훅: can() / limit() (PLAN_SPEC.md 참조)
```

---

## supabase/ (백엔드)

```
supabase/
├── migrations/
│   └── 0001_init.sql               # 초기 테이블 생성 (API_SPEC.md 참조)
└── functions/
    └── process-asset/
        └── index.ts                # 업로드 후 Draco 압축 Edge Function
```

---

## public/

```
public/
└── draco/
    ├── draco_decoder.wasm
    └── draco_decoder.js
```

---

---

## src/middleware.ts 동작 규칙

```
요청 수신
  ↓
호스트가 PLATFORM_DOMAIN(env var)으로 끝나는가?
  ├─ YES → /dashboard, /editor/* : 세션 없으면 /login 리다이렉트
  │         나머지 경로 : 그대로 통과
  └─ NO  → Supabase projects 테이블에서 custom_domain 조회
            매핑 있음 → /space/:default_scene_id 로 rewrite
            매핑 없음 → 404
```

---

---

## 파일 크기 규칙

| 규칙 | 기준 |
|---|---|
| 단일 파일 최대 크기 | **200줄** 초과 시 분리 신호 |
| 분리 기준 | 파일이 두 가지 이상의 역할을 하면 분리 |
| 디렉토리 도입 기준 | 같은 관심사의 파일이 3개 이상이면 디렉토리로 묶음 |
| index.tsx 역할 | 조합(import + 배치)만 담당, 비즈니스 로직 금지 |

**분리 예시:**
```
❌ InspectorPanel.tsx (Transform + Physics + Events + Visibility = 400줄)
✅ InspectorPanel/index.tsx + TransformSection + PhysicsSection + EventsSection + VisibilitySection
```

---

## 파일 생성 금지 규칙

- `components/editor/` 내 파일을 `app/space/` 또는 `components/viewer/`에서 import 금지
- `store/` 외부에 상태 관리 로직 작성 금지
- `types/schema.ts` 외부에 스키마 인터페이스 중복 정의 금지
- `app/space/[sceneId]/page.tsx`에 에디터 관련 import 금지 (번들 격리)
- 컴포넌트 파일 내에 Supabase 쿼리 직접 작성 금지 — 반드시 `lib/supabase.ts` 경유
- `embed/` 내 코드에서 `components/editor/` import 절대 금지
