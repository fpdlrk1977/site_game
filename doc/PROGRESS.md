# PROGRESS — 작업 진행 상황 & 핸드오프 노트

> 이 문서는 `AGENTS.md`에서 `@doc/PROGRESS.md`로 자동 로드된다.
> 다른 컴퓨터/새 세션에서 작업을 이어갈 때 여기를 읽으면 현재 맥락을 파악할 수 있다.
> **작업 중 중요한 변경/결정이 생기면 이 파일을 갱신할 것.**

## 프로젝트 한 줄 요약
코드 없이 GUI 에디터로 3D 공간/웹사이트를 만들고 배포하는 노코드 SaaS 플랫폼.
Project > Scene > Asset(.glb) > Object(인스턴스) > (Prefab, 미구현).

## 기술 스택
- **에디터/뷰어**: Next.js 16(App Router) + React 19 + React Three Fiber + Three.js(0.185)
- **상태**: Zustand (`src/store/sceneStore.ts`) — Command 패턴 Undo/Redo
- **물리**: Rapier (`@react-three/rapier`) — 플레이 모드 캐릭터
- **백엔드**: Supabase (Postgres + Storage + Auth)
- **씬 데이터**: 단일 JSON 스키마 `ProjectSceneSchema`(`src/types/scene.ts`)를 `scenes.scene_data`(jsonb)에 저장. 에디터·뷰어·임베드가 이 스키마 공유.

## 로컬 실행
```bash
npm install
npm run dev   # http://localhost:3000 (루트는 /login 리다이렉트)
```
- **`.env.local` 필수** (Supabase URL/키) — `.gitignore`에 있어 git에 없음. 다른 컴퓨터에선 직접 복사해야 함.

---

## 핵심 아키텍처 결정 (변경 주의)
- **Next.js 16**: 미들웨어 파일은 `src/proxy.ts`, 함수명 `proxy`(not middleware). 모든 라우트에서 세션 갱신.
- **@supabase/ssr**: `getUser()` 사용(`getSession()`은 보안 취약).
- **뷰어 RLS 우회**: `createServiceSupabase()` + 수동 소유자 체크. `is_published` 씬만 외부 노출.
- **에디터 오브젝트 좌표는 명령형**: `EditorObjectInstance`가 position/rotation/scale을 `useLayoutEffect`로 Three 객체에 직접 set. (gizmo가 드래그 중 직접 조작하기 위함) → **visible은 언마운트가 아니라 `g.visible` 플래그로 토글**(언마운트 시 좌표 리셋 버그 방지). 뷰어(`ViewerObject`)는 position을 prop으로 준다.
- **기즈모(GizmoController)**: 재부모화 시 ref 교체로 TransformControls가 분리 객체를 물어 "scene graph" 에러 → ref 등록 `useLayoutEffect` + `attachedKey` state로 전환 프레임 렌더 스킵.
- **저장 낙관적 잠금**: `scenes.version`(행 리비전)으로 멀티탭 덮어쓰기 방지. `src/lib/saveScene.ts`의 `persistCurrentScene()`. ViewportToolbar·AssetBrowser 모두 사용.
- **플레이 모드**: 항상 바닥 콜라이더(`CuboidCollider 500`) + 기본 캡슐 캐릭터 존재 → 낙사 없음. 캐릭터 컨트롤러는 센서를 `EXCLUDE_SENSORS`로 제외.
- **area 애니메이션 재생**: 센서 오브젝트는 `PhysicsObject`의 Rapier `onIntersectionEnter/Exit` → `activeClip`. 솔리드는 area play_animation 미지원(제약).
- **커스텀 드롭다운**: `useDropdown` + `SelectBox` + `useListNav` 조합(portal 기반).
- **조명 기본값**: HDR 미설정 시 `DefaultEnvironment`(RoomEnvironment IBL) 자동 주입. directionalLight에 shadow bias/frustum 설정됨. ambient는 저장값 ×0.5로 렌더(그림자 대비).

## 데이터 스키마 핵심 (`src/types/scene.ts`)
- `EventSchema.trigger`: click / hover_enter / hover_exit / area_enter / area_exit
- `EventSchema.action`: open_url / show_popup / emit_event / play_animation / go_to_scene
- `EnvSchema.defaultMode`: 'explore' | 'play' — 뷰어 진입 모드
- `EnvSchema.disableWalk`: true면 둘러보기 전용(캐릭터·플레이 없음)
- `ObjectNodeSchema.prefabId`: 스키마엔 정의됐으나 **미구현**

---

## 최근 완료 (2026-07-06)
- 계층 리스트 **드래그 정렬 + 그룹 안팎 재부모화**(월드 좌표 보존) + 그룹 피벗 recenter + 기즈모 안정화
- GLB 호버 하이라이트 전파 버그(재질 공유) 수정
- **조명 L1**: 기본 환경광(IBL)·그림자 bias/frustum·GLB castShadow·fill 재조정
- **Events**: `go_to_scene`(씬 이동), 리치 팝업(이미지/영상/YouTube — `RichContent`), hover_exit/area_exit 트리거, 이벤트 **인라인 수정** 기능
- **뷰어 모드**: 씬별 기본 진입 모드 + "걷기 모드 사용" 토글(둘러보기 전용)
- **🔴 visible 토글 좌표 리셋 버그** 수정(데이터 유실 치명 버그)
- 에셋 URL 만료 해결(0006 마이그레이션, public 버킷)

## 남은 작업 / 로드맵
- **조명 L2**: ContactShadows(접지감) → 톤매핑/노출 · 씬별 조명 컨트롤 (사용자 L1 피드백 취합 후)
- **Events E2**: 오브젝트 간 액션(A 클릭→B 숨김/이동/애니메이션), 사운드, 카메라 액션, 인터랙션 어포던스. 솔리드 area 애니메이션.
- **Prefab**: 미착수. 착수 전 **override/동기화 규칙 설계** 필요(원본 수정 시 인스턴스 반영, 개별 오버라이드 허용 여부 등).
- 결제/플랜 업그레이드(Stripe), AssetBrowser materials/textures/hdr/audio 탭(WIP).

## 알려진 제약/한계
- `go_to_scene`: 독립 URL(`/space/{id}`) 기준 이동 — 커스텀도메인/임베드 컨텍스트 미대응.
- 솔리드(비센서) 오브젝트는 area 트리거로 팝업/URL/씬이동은 되나 **애니메이션 재생 안 됨**(activeClip 센서 전용).
- 오토세이브: `ViewportToolbar`에 60초 자동저장 로직이 주석 처리된 채 방치(수동 Ctrl+S만 동작). `setAutoSaveAt` lint 경고 원인.
- 코드베이스 전반에 React Compiler eslint 규칙(immutability/set-state-in-effect/modify-local) 에러가 다수 존재 — 기존 코드, dev/build엔 영향 없음.

## Supabase 마이그레이션
`supabase/migrations/` — 0001_init ~ 0006_assets_public 까지. 새 환경에선 순서대로 실행 필요.
