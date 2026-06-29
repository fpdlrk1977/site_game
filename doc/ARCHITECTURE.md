# ARCHITECTURE: 시스템 구조 및 데이터 흐름

---

## 1. 전체 5-레이어 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Auth & Dashboard  (Next.js App Router)                │
│  /login  /dashboard  /editor/:projectId/:sceneId                │
│  Supabase Auth (이메일/Google OAuth) + RLS 보호                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ CRUD (Supabase SDK)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Editor  (React + R3F + Zustand)                       │
│  에디터 코드는 Layer 3~5 번들에 절대 포함되지 않는다             │
│  editorStore (SSOT) ──── R3F EditorCanvas ──── TransformControls│
└───────────────────────────┬─────────────────────────────────────┘
                            │ upsert ProjectSceneSchema JSON
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Supabase  (PostgreSQL + Storage + Edge Functions)     │
│  projects / scenes / assets tables (RLS)                        │
│  assets-raw (private) → process-asset Edge Fn → assets-draco   │
└──────┬──────────────────────────────────────────────────────────┘
       │ GET /api/scenes/:sceneId  (공개, 인증 불필요)
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4: Runtime Viewer  (Next.js /space/:sceneId)             │
│  R3F Canvas + @react-three/rapier 물리                          │
│  PlayerController / SceneObject / EventHandler                  │
│  에디터 코드 완전 배제 — scene_data JSON만 받아 렌더링           │
└──────┬──────────────────────────────────────────────────────────┘
       │ postMessage / CustomEvent
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 5: Embed Mode  (독립 Vite 번들 embed.js)                 │
│  기존 사이트의 #park3d-root에 마운트                            │
│  Event Bridge: park3d:* 이벤트 → 호스트 페이지 버튼 액션 연결   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 미들웨어 라우팅 흐름

```
HTTP 요청
    │
    ▼
src/middleware.ts
    │
    ├─ 호스트가 PLATFORM_DOMAIN인가?
    │     ├─ YES: /dashboard, /editor/* → 세션 없으면 /login
    │     └─ YES: 나머지 → 통과
    │
    └─ NO (커스텀 도메인):
          Supabase projects 조회 (custom_domain 매핑)
          ├─ 매핑 있음 → /space/:default_scene_id 로 rewrite
          └─ 매핑 없음 → 404
```

---

## 3. 에디터 상태 관리 (Zustand + Command Pattern)

```
사용자 조작
    │
    ▼
editorStore (SSOT)
    ├── updateTransform()   ← 기즈모 드래그 중 60fps, 히스토리 미기록
    ├── saveToHistory()     ← mouseup 시점 단 1회 호출
    ├── undo() / redo()     ← Delta 스택 pop/push (메모리 효율)
    └── loadScene()         ← Supabase fetch 후 스토어 교체
          │
          ▼ (one-way data flow)
    R3F EditorCanvas
    └── EditorObjectInstance (primitive, 물리 없음)
```

**Delta 방식 히스토리:** 오브젝트 전체를 복사하지 않고 변경된 필드(prev/next)만 저장하여 메모리 효율을 유지한다. `past` 최대 50개.

---

## 4. 씬 JSON → 뷰어 렌더링 파이프라인

```
GET /api/scenes/:sceneId
    │
    ▼
ProjectSceneSchema JSON
    ├── assets[]        ← dracoUrl 포함 → useGLTF.preload() 일괄 실행
    ├── environment     → sky / fog / 조명 적용
    └── objects[]
          │
          ▼ (SceneObject.tsx)
          physics.enabled?
          ├─ false          → <primitive> (장식용, 충돌 없음)
          ├─ true, isSensor:false → <RigidBody type="fixed"> + collider (플레이어 차단)
          └─ true, isSensor:true  → sensor collider (area_enter 감지, 통과 가능)
```

---

## 5. assetId 해석 경로

ObjectNodeSchema의 `assetId`는 UUID다. 뷰어가 별도 DB 조회 없이 파일 URL을 알 수 있도록, **씬 저장 시점에 `dracoUrl`을 scene_data 내 `assets[]`에 직접 포함**한다.

```
에디터: assetId + dracoUrl → scene_data.assets[] 에 AssetRefSchema로 저장
뷰어:   objects[n].assetId → scene_data.assets 에서 id 매칭 → dracoUrl → useGLTF()
```

이 방식으로 뷰어는 `assets` 테이블을 직접 조회할 필요가 없다.

---

## 6. 임베드 모드 Event Bridge

```
3D 월드 내 오브젝트 클릭 (trigger: click, action: emit_event)
    │
    ▼
emitBridgeEvent('add_to_cart', { productId: '...' })
    │
    ├─ 임베드 모드:  window.parent.postMessage({ type: 'park3d:add_to_cart', payload }, '*')
    └─ 모든 모드:    window.dispatchEvent(new CustomEvent('park3d:add_to_cart', { detail: payload }))
                          │
                          ▼
                   호스트 페이지:
                   window.addEventListener('park3d:add_to_cart', (e) => {
                     myShop.addToCart(e.detail.productId);
                   })
```

---

## 7. 번들 격리 규칙

| 번들 | 포함 | 배제 |
|---|---|---|
| Next.js 앱 | editor, dashboard, viewer | - |
| `/space/:sceneId` 페이지 | viewer only | editor (tree-shaking) |
| `embed.js` (Vite) | viewer only | editor, Next.js runtime |

에디터 코드가 뷰어 번들에 섞이면 첫 로드 용량이 수 MB 증가한다. 임포트 격리 규칙을 반드시 준수할 것.
