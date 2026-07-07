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
- **Events E1**: `go_to_scene`(씬 이동), 리치 팝업(이미지/영상/YouTube — `RichContent`), hover_exit/area_exit 트리거, 이벤트 **인라인 수정** 기능
- **Events E2(진행 중)**: 오브젝트 표시/숨김/토글(`show/hide/toggle_object` — 뷰어 `visOverride` 런타임 오버라이드), **카메라 포커스**(`focus_object` — 대상으로 부드러운 팬) + **카메라 초기화**(`reset_camera` 액션 + 우측 상단 ⌂ 시점초기화 UI 버튼, 카메라 로직 `ViewerCanvas`의 `CameraFocus`), **대상 오브젝트 애니메이션**(`animate_object` — value `"objectId|clip"`, 뷰어 `ClipRequestContext` 런타임 클립 요청; 에디터는 대상+클립 2단 선택). 이벤트 Action 드롭다운에서 `play_animation(자기)`↔`animate_object(다른 오브젝트)` 나란히 배치.
  - **E2 완료**: 아래 '오브젝트 이동/사운드', '인터랙션 어포던스' 항목 참고.
- **뷰어 모드**: 씬별 기본 진입 모드(`defaultMode`) + "걷기 모드 사용" 토글(`disableWalk`, 둘러보기 전용)
- **🔴 visible 토글 좌표 리셋 버그** 수정(데이터 유실 치명 버그, 명령형 좌표+조건부 언마운트 → `g.visible` 플래그 토글)
- **뷰어 GLB 호버 전파 버그** 수정(재질 인스턴스 복제 — 에디터 GlbObject와 동일). **플레이 모드 호버 가이드라인 제거**(`PlayModeContext` — Outlines/box3Helper만 숨김, 커서·emissive 하이라이트는 유지).
- 계층 리스트 visible 아이콘도 lock처럼 숨김 시 상시 표시.
- 에셋 URL 만료 해결(0006 마이그레이션, public 버킷)
- **Events E2 — 오브젝트 이동 + 사운드**: `move_object`(value `"objectId|dx,dy,dz|초"` — **원래 저장 위치 기준** 오프셋으로 easeInOutQuad 이동, (0,0,0) 이벤트로 원위치 복귀) + `play_sound`(value=오디오 URL, URL별 HTMLAudioElement 재사용). 구현은 visOverride와 동일 패턴 — `ViewerClient`의 `posOverride`를 effectiveScene에 주입, 단일 rAF 루프가 이징. rapier 2.2.0은 RigidBody position prop 변경 시 setTranslation 텔레포트라 **플레이 모드에서 콜라이더도 함께 이동**(E2E 검증: `/test/move-object` 페이지 + 헤드리스 Edge — 탐색 클릭 move·플레이 area_enter move·Audio 패치 사운드 로그 모두 확인). 에디터는 대상 SelectBox+XYZRow 이동량+시간 입력, 사운드는 URL 입력·▶ 미리듣기.
- **Events E2 완료 — 인터랙션 어포던스**: 클릭/호버 이벤트가 있는 오브젝트 위에 카메라를 향한 펄스 **힌트 링**을 띄워 방문자에게 상호작용 가능함을 알림. `ViewerCanvas`의 별도 레이어 `InteractionHints`로 구현 — **오브젝트 렌더 경로(재질/GLB) 미변경**(depthTest=false + renderOrder 999, `objWorldPos` 재사용, useFrame 빌보드·펄스). **탐색 모드 뷰어/임베드에서만** 렌더(플레이 모드·에디터 미표시). 씬별 토글 `EnvSchema.showInteractionHints`(미설정=켜짐) — 에디터 Environment 패널 'Interaction' 섹션. area_enter/exit만 있는 오브젝트엔 링 없음(호버로 발견되는 트리거가 아니라서). E2E: `/test/move-object`에서 클릭·호버 오브젝트에만 링 뜨는 것 스크린샷 확인.

## 최근 완료 (2026-07-07)
- **Events E3-A — `interact` 트리거(다가가 E키)**: 플레이 모드에서 캐릭터가 interact 이벤트를 가진 오브젝트에 **근접(기본 3m)**하면 화면 하단에 **`E` 키캡만** 뜨고(이름 미표시 — 대상은 3D 하이라이트로 구분), **동시에 근접 대상 오브젝트가 하이라이트**(emissive 글로우만 — 플레이 모드는 무-외곽선 규칙 유지라 아웃라인/박스는 안 씀)돼 어디에 E를 눌러야 할지 보임. **E키(모바일=우하단 원형 E 버튼)**로 그 오브젝트의 이벤트 발동(팝업/씬이동/애니메이션 등 기존 액션 파이프라인 재사용). 하이라이트 배선: `InteractHighlightContext`(근접 대상 id)를 R3F 트리에 내려 `ViewerObject`가 자기 자신이면 emissive/아웃라인 on — 호버 하이라이트와 통합(`emissiveOn`/`outlineOn`, 아웃라인은 탐색 모드 호버 전용 — 플레이 모드는 호버·interact 모두 글로우만, 무-외곽선). NPC 대화·간판·아이템·"눌러서 열기"용. **센서 통과는 버그가 아니라 트리거 영역의 정의**임을 확인한 뒤 나온 후속 기능(플랫폼이 "게임적 상호작용"으로 한 걸음). 배선: `PlayModeController` useFrame이 플레이어↔interactable 최근접 산출(대상 변할 때만 콜백) + `KeyE` keydown 발동 → `PlayCanvas`가 interact 이벤트 있는 **루트** 오브젝트 목록 전달·id→obj 매핑 → `ViewerCanvas` 통과 → `ViewerClient`가 프롬프트 HTML·모바일 버튼·`interact` 디스패치·애널리틱스(`interact`) 담당. 에디터는 트리거 드롭다운에 `Interact (E)` + 안내문. **탐색 모드에선 발동 안 함**(캐릭터 없음 — 클릭으로 대체). 검증: tsc 클린 + 인증 세션 `/space`·`/editor` 200 + **브라우저 실동작 확인 완료(2026-07-07 — 근접·E키·하이라이트 정상)**.
  - **E3-A 추가 — 대화 말풍선 시스템(`dialogue`)**: 오브젝트 위에 뜨는 순차 문장. `ObjectNodeSchema.dialogue = { lines[], show:'always'|'approach'|'interact', advance:'auto'|'manual', autoSec?, speaker?, typing? }`. (레거시 `interactLabel`은 `effectiveDialogue`가 `lines:[label]·approach·auto`로 자동 변환.) **표시 시점** 항상/다가가면(3m)/E키로 열기, **넘기기** 자동(타이머 autoSec)/E키, **타이핑(타자기) 효과**, **화자 이름**(말풍선 상단). 상태 머신은 `useObjectDialogue` 훅(오브젝트별 idx/opened/typed) — early return 전에 호출. E키 advance는 `DialogueAdvanceContext`(nonce)로 3D 트리에 전달, **가장 가까운 대상만**(interactActive) 반응. nonce는 `ViewerClient.handleObjectEvent`가 trigger==='interact'일 때 bump(추가 배선 없음 — E는 항상 이 경로). 렌더: GLB는 `GlbViewer`가 bbox.max.y, 프리미티브/콘텐츠(텍스트·이미지)는 `ViewerObject`가 0.5·scale.y 오프셋. 근접 감지 대상(`interactables`)=interact 이벤트 OR 근접 필요 대화(항상+자동 앰비언트는 근접 불필요라 제외). E 프롬프트=interact 이벤트 OR dialogue.show==='interact'. 동시 말풍선은 근접 1개(+항상 표시 오브젝트들). 에디터: Events 섹션 상단 '대화 말풍선'(textarea 한 줄=한 문장 + 표시/넘기기 SelectBox + 간격/화자/타이핑). 검증: tsc 클린 + dev 컴파일/렌더 200 + **브라우저 실동작 확인 완료(2026-07-07 — 표시시점 3종·넘기기 2종·타이핑·화자·E 열기/넘기기 정상)**. (한글 말풍선이 세로로 나오던 버그 = drei Html shrink-to-fit + CJK 줄바꿈 → `width:max-content`+`wordBreak:keep-all`로 수정.) 제약: 루트 오브젝트만·플레이 전용·영상/빈 콘텐츠 미지원·선택지/조건부는 미구현(후속). 고도화 후보(미착수): 대사 종료 시 액션 연결, 선택지(분기), 하단 대화창 모드, 거리 LOD, 1회성 플래그.
  - **남은 E3-B(추후)**: 문(door) = 런타임 콜라이더 on/off 토글(`set_passable`/`toggle_collision`) — "E→문 열림 애니→통과 가능". hide_object 시 루트 콜라이더가 안 빠지는 것도 함께 손볼 것(PlayCanvas AutoCollider가 visible 무시). 필요할 때 착수.

- **뷰어 통합(임베드/배포 컨텍스트) 리팩터 (2026-07-07)**: 임베드가 `ViewerClient`의 축소 복제본(`EmbedClient`)이라 E2/E3/대화/interact가 다 빠져있던 문제 → **`ViewerClient`를 컨텍스트 인지형으로 파라미터화**(`variant: 'standalone'|'embed'`, `onBridge`). `EmbedClient`는 이제 `<ViewerClient variant="embed" onBridge={postMessage}/>` **얇은 래퍼**로 축소 → 임베드가 **전체 액션(open_url/popup/go_to_scene/show·hide·toggle/focus/reset_camera/animate/move/sound/play_animation)·대화 말풍선·interact·카메라 포커스 자동 지원**. 컨텍스트 분기: `show_popup`=iframe 안이면 부모 postMessage, 아니면 실제 팝업 렌더 / `emit_event`=iframe일 때만 브릿지(ViewerClient에도 이제 구현) / `go_to_scene`=경로 id 치환(위 참고). chrome=독립은 상단 풀 UI+배지, 임베드는 우상단 미니 토글+워터마크. **중요**: ShareModal이 주는 임베드 코드가 `<iframe src="{origin}/embed/{id}">`라 **third-party 사이트도 이 Next `/embed` 라우트를 씀** → 이 통합으로 실제 임베드 시나리오 해결. 검증: tsc 클린 + `/space` 200(회귀 없음)·`/embed` 정상 컴파일/실행(404는 씬 미게시). **실제 임베드 액션 E2E는 게시된 씬 + `/test/event-bridge`로 사용자 확인 필요**. 커스텀 도메인 서빙 라우팅 실존 여부 점검(→ `proxy.ts:14-24`에 있음. host→`projects.custom_domain` 조회 후 `/space/{default_scene_id}`로 rewrite. **단 경로 무시하고 기본 씬만 서빙** → 커스텀 도메인에서 다중 씬 이동은 별도 개선 필요. localhost는 이 로직 건너뜀 → 실도메인+DNS+배포 필요, 로컬 테스트 불가).
  - **embed.js → iframe 주입기로 전환 (2026-07-07)**: 기존 in-page mount(vite 번들 `EmbedApp`, 3.88MB, 호스트 origin에서 실행 → CSS/JS 충돌·3액션 제한)를 **폐기**하고, `public/embed.js`를 **~3.2KB 바닐라 iframe 주입기**로 교체(YouTube IFrame API 패턴). `<script src=".../embed.js" data-scene data-target?/data-width?/data-height?/data-radius?>` → 격리된 `/embed/{id}?parentOrigin=` iframe을 꽂음 → **통합된 `/embed`(전체 기능) 재사용, 드리프트/격리문제/번들 소멸**. `park3d:event`/`park3d:popup` postMessage를 호스트 `window`의 **CustomEvent로 재전달**(`window.addEventListener('park3d:event', e=>e.detail)`). 삭제: `embed/`(main.tsx·EmbedApp.tsx·vite.config.ts), `package.json`의 `build:embed`. `/embed`는 X-Frame-Options 없음(next.config) → cross-origin iframe 허용 확인. ShareModal 임베드 탭에 **스크립트(권장)/iframe 방식 토글** 추가. 검증: embed.js 3.2KB·CORS·문법 유효, /embed 200. **호스트 페이지 실삽입 E2E는 게시된 씬 필요(사용자)**.

- **프로젝트 복제 (2026-07-07)**: 대시보드 카드 `···` 메뉴 → "📄 복제". `duplicateProject`(dashboard/actions.ts) **완전 독립 복사** — 새 프로젝트(비공개·도메인/slug 없음, 이름 "{원본} (복사본)") + 플랜 한도 검증(초과 시 롤백) + **에셋 스토리지 파일(+_thumb.png) 새 경로로 `storage.copy` + assets DB행 생성** + **모든 씬 복사**하며 `remapSceneData`로 scene_data의 `projectId`·`sceneId`·`assets[].id/dracoUrl/thumbnailUrl`·`objects[].assetId`·`go_to_scene` 값(씬 id)을 **새 id로 리맵** → 원본 삭제해도 복사본 독립. default_scene_id·thumbnail_url·description·meta 승계. UI: 복제 중 카드 오버레이("복제 중…"). 검증: tsc + dashboard 컴파일 200. **실제 복제 동작(스토리지 copy·리맵)은 사용자 브라우저 확인 필요**.

- **정렬·회전 피벗 bbox화 (2026-07-07)**: 원점(=`position`)이 GLB의 임의 원점(대개 바닥/비대칭)이라 ①정렬이 원점 기준이라 회전 시 어긋나고 ②회전이 원점(바닥) 축이라 휘둘리던 버그. **원점 의미는 유지(마이그레이션 0)** 하고 bbox로 거동만 교정. **공용 유틸 `src/lib/objectBBox.ts`**: `localBBox`(GLB=캐시·프리미티브=단위·**그룹=자식 재귀 union**)/`worldBBox`(월드 AABB)/`localCenter`. **Phase1 정렬**: `sceneStore.alignSelected`를 원점→**월드 bbox 모서리(min/max)·중심(center)** 기준으로. **Phase2→프록시 재작성**: (보정 hack은 폐기) `SingleGizmo`를 **프록시 방식**으로 재작성 — `TransformControls`를 오브젝트가 아니라 **형상 중심에 놓인 프록시 Object3D**(`<primitive>`로 씬 루트에 마운트)에 붙임 → **기즈모 위젯이 원점(하단)이 아니라 중심에 뜨고**, 회전이 중심축, 이동/스케일도 중심 기준. 드래그 아닐 때 useFrame이 프록시←오브젝트(matrixWorld·cLocal) 동기화, 드래그 중 onChange가 프록시→오브젝트 로컬 TRS 역매핑(부모 matrixWorld 역행렬). **부수효과**: 프록시가 안 움직여 예전 재부모화 scene-graph 에러 회피 목적의 attachedKey 로직 제거. 캐릭터 프리뷰/프리미티브는 cLocal=0이라 기존과 동일. 회전 시 y바닥 클램프는 미적용(translate 전용)으로 변경(중심 회전은 원점 y가 내려갈 수 있음). 그룹은 재귀 union bbox로 개별과 동일 처리. 프리미티브는 중심=원점이라 무변화. **Phase3 바닥 클램프 bbox화**: 이동(translate) 시 원점 y≥0 대신 **bbox 밑면이 바닥(0)에 닿게** 클램프(`GizmoController` 잡는 순간 `minOriginY = position.y − worldBBox.min.y` 계산·이동 중 불변). 기존 primitive-only `getGroupMinY` 제거 → 그룹·GLB 포함 **worldBBox 기준으로 통일**. 회전/스케일은 클램프 안 함(중심 피벗 회전은 원점 y가 내려갈 수 있음). 검증: tsc + 에디터 컴파일 200. **실제 정렬·회전·바닥클램프 거동은 브라우저 확인 필요**. 남은 근사: 미로딩 GLB·회전된 자식은 AABB 근사 bbox, 중첩(부모 있는) 오브젝트 이동은 여전히 y클램프 skip(기존과 동일).

- **경계 벽(Boundary Walls) MVP (2026-07-07)**: 기존 `boundary`(크기 숫자, 충돌만)에 **시각 벽** 추가. 스키마 `EnvSchema.boundaryWall = { style:'none'|'color'|'texture', color?, textureUrl?, height?, opacity?, ceiling? }`(기존 숫자 boundary는 그대로 하위호환). 공용 컴포넌트 `src/components/three/BoundaryWalls.tsx` — 4면 벽(+선택 천장) `DoubleSide` 렌더, 텍스처는 `useTexture`+RepeatWrapping(월드 4유닛/타일), `editor` prop이면 불투명도 ×0.5로 편집 덜 가림. 뷰어(`ViewerCanvas`)는 기존 주황 `BoundaryGizmo`를 **BoundaryWalls로 교체**(none이면 안 보임 → 방문자에게 주황 가이드 안 뜸, 탐색·플레이 공통 렌더), 에디터(`EditorCanvas`)는 **주황 가이드(범위) 유지 + 벽 반투명 미리보기**. 충돌 콜라이더(PlayCanvas)는 무변경. 에디터 UI: Environment→Boundary 섹션에 스타일 드롭다운/색/**텍스처 업로드(등록, ground와 동일 패턴 — `boundary/{pid}/tex_*` 저장·미리보기·교체/제거)**/높이/불투명도/천장 토글. **직사각 지원**: `boundary`(X 반경)+`boundaryZ`(Z 반경, 미설정=정사각) → 벽·콜라이더·주황가이드·에디터 UI(가로/세로 2입력) 전부 직사각화. 검증: tsc + 에디터·뷰어 컴파일 200. **실제 벽 렌더·텍스처는 브라우저 확인 필요**. 2차 후보(미착수): 그라데이션 페이드 벽, 안쪽만 보이기(one-sided), 면별 텍스처, 스카이박스 대안, 원형/커스텀 모양.

- **자동 바닥 스냅 + Shift 15° 회전 (2026-07-07)**: (1) GLB 추가 시 **밑면을 바닥(y=0)에 자동 정렬** — `sceneStore.floorSnapObject(id)` + 모듈 `pendingFloorSnap` Set. `addAssetObject`가 추가 후 즉시 시도(bbox 캐시돼 있으면 성공), 미로딩이면 pending → `GlbObject`가 bbox 캐시하는 useEffect에서 `floorSnapObject` 재시도(objectId prop 전달). 루트 GLB만, 히스토리 없이 위치만 보정(추가 액션에 묻어감). 기존 오브젝트는 pending 아니라 무영향(로드 시 재스냅 안 됨). → "오브젝트가 바닥에 파묻혀 일일이 올리던" 문제 근본 해결. (2) **Shift 누른 채 회전 = 15° 스냅**(GizmoController, Figma식). 검증: tsc + 에디터 컴파일 200. **실동작 브라우저 확인 필요**.
- **에셋 연쇄 삭제 (2026-07-07)**: 사용 중 에셋 삭제를 차단하던 걸 → **확인 후 참조 오브젝트(+자손) 함께 삭제**로. `sceneStore.removeObjectsByAsset(assetId)` 추가, `AssetBrowser`는 `confirm`(N개 오브젝트/플레이어캐릭터 해제 안내) → DB 삭제 성공 후에만 씬 반영(원자성). 유령 참조 방지는 유지.
- **기타 UI/UX 수정 (2026-07-07)**: 대시보드 정렬 `updated_at→created_at`(공개토글 시 카드 점프 버그 수정) + **등록일 상대시간 표시**(`timeAgo`) / 임베드 **클릭→팝업** 안 뜨던 것(iframe 내부 렌더+부모 브릿지 병행) / 팝업 배경 **흰색 고정**(테마 무관, `RichContent onLight`) / 방문자 뷰어 **호버 외곽선 제거**(글로우+커서+링만) / **힌트 링 occlusion**(depthTest 켜고 bbox 상단 정확 배치) / 임베드 **모드 토글 버튼 제거**(defaultMode 고정) / 카메라 프리셋 7/1/3 **씬 크기 맞춤**(고정거리20→spread×1.4) / **에디터 ContactShadows 제거**(오브젝트 이동 시 바닥 잔상 → preserveDrawingBuffer+접지그림자). / `.next` 캐시 크래시 대응([[troubleshoot-next-worker-crash]]).

## 남은 작업 / 로드맵 (2026-07-07 갱신)

### ⚠️ 브라우저 실검증 대기 (이번 세션 산출물 — tsc·컴파일은 통과, 실동작 미확인)
- **정렬·회전·바닥클램프·기즈모(프록시 방식)** — 특히 그룹 재부모화(예전 취약점) 회귀 확인
- **경계 벽** — 색/텍스처(업로드)/직사각(가로≠세로)/천장/투명, 플레이 이동제한
- **프로젝트 복제** — 스토리지 copy·리맵, 원본 삭제 후 독립성
- **임베드 E2E** — 게시된 씬 + `/test/event-bridge` 또는 `<script>` 삽입, emit_event/팝업

### 기능 로드맵 (미착수/후속)
- **오브젝트 앰비언트 애니메이션(`motion`)** ⭐: GLB 자체 클립이 아닌 **트랜스폼 애니**(항상 실행). type=float(둥실)/spin/pulse(스케일)/orbit/**wander(영역 내 유동, 열기구식)**. 스키마 `ObjectNodeSchema.motion` + 뷰어 useFrame 런타임(move_object rAF 구조 재활용). "살아있는 씬" — 게임형 임팩트 큼. 중간 규모·리스크 낮음.
- **맵 제작 도구**: ~~(a) 추가 시 자동 바닥 스냅~~ **[완료 2026-07-07]** (b) **배열/반복 툴**(복제 N개 일정 간격 — 울타리·기둥). ※Ctrl+D 복제는 크기 정확 복사됨.
- ~~**Inspector 툴팁**~~ **[완료 2026-07-07]**: `InfoHint`(ⓘ, lucide `Info`) 공통 컴포넌트 + `Tooltip`에 `wide` 옵션(줄바꿈/최대폭) 추가. `SectionHeader`에 `hint` prop → Transform/Visibility/Physics/Events/Content/Light/Particle/Boundary/Interaction/Ground/Player/Lights 등에 안내문. (필요 시 필드 단위 툴팁·나머지 섹션 추가 가능)
- **Events E3-B(문/콜라이더 토글)**: `set_passable`/`toggle_collision` + hide_object 시 루트 콜라이더 제거. 필요 시.
- **대화 시스템 고도화**: 선택지(분기), 대사 종료 시 액션 연결, 하단 대화창 모드, 거리 LOD, 1회성 플래그.
- **경계 벽 2차**: 그라데이션 페이드/one-sided/면별 텍스처/스카이박스 대안/원형·커스텀 모양.
- **조명 L2 (c)**: 라이트 색(warm/cool) 스키마 — 나머지 L2(톤매핑·바닥스냅·무드프리셋·ContactShadows)는 완료.
- **Prefab**: 미착수. 착수 전 override/동기화 규칙 설계 필요.
- **AssetBrowser 탭**: Materials/Textures/HDR/Audio (WIP). ※ 텍스처는 지금 ground·boundary가 개별 업로드로 우회 중.

### 정리/결정 필요
- **오토세이브** 되살리기/제거 결정 (현재 수동 Ctrl+S만, `setAutoSaveAt` lint 경고 원인).

### 인프라/비즈니스
- **결제/플랜 업그레이드 (Stripe)** — 미착수.
- **커스텀 도메인 다중 씬 이동** — `proxy.ts`가 기본 씬만 서빙(경로 무시). 다중 씬은 별도 개선.
- **emit_event(Event Bridge)** — 구현 완료, 실 iframe E2E는 게시 씬으로 확인만 남음(Pro 게이팅은 코드표시 UI에만).

## 조명 L2 — L1 피드백 취합 결과 & 계획 (2026-07-06)
사용자가 L1 기본값으로 실제 씬을 보고 준 피드백 3건 + 코드 진단:
1. **GLB가 바닥에 파묻힘** — `addAssetObject`(sceneStore)가 GLB 원점을 무조건 y=0에 놓음. GLB는 원점이 발밑이 아닌 기하 중심인 경우가 많아 밑면이 바닥(`y=-0.002` 텍스처 평면) 아래로 내려감. 인스펙터 y 클램프 `Math.max(0,v)`는 **원점**만 0 이상으로 막고 **실제 밑면(bbox.min.y)**은 안 맞춤. 프리미티브는 생성 시 y=0.5+스케일1이라 정상. **[완료 — "바닥에 놓기" 버튼]** `GlbObject`가 계산한 로컬 bbox를 `glbLocalBboxCache`(url→Box3)에 저장 → 인스펙터 버튼이 오브젝트의 **회전+스케일 행렬을 로컬 bbox에 적용해 실제 min.y**를 구하고 `position.y = -min.y`로 밑면을 바닥(0)에 정렬. 루트(parentId=null) GLB만. 자동 스냅 대신 버튼(공중 배치 통제권 유지). 검증: three 수치(회전/스케일 5케이스 worldBase=0) + `/test/snap` 렌더(25°+비균일 스케일에서도 밑면이 바닥에 정확히 앉음).
2. **색이 밝게/파스텔로 뜸**(예: 저장 #226155 → 화면 #39706a) — 에디터·뷰어 Canvas 어디에도 톤매핑 미지정 → R3F 기본 **ACESFilmicToneMapping**이 채도 낮추고 중간톤 들어올림. **[완료 — Linear 채택]** `/test/tonemap` A/B 픽셀 측정(실제 조명 리그) 결과 저장색 대비 Δ: **none≈linear(Δ~10) < aces(Δ~20) < neutral(Δ~28)**. 처음엔 Neutral 추천했으나 측정상 Neutral이 오히려 색을 더 밀어냄. NoToneMapping은 exposure가 무효라, **`THREE.LinearToneMapping` 채택**(none과 동일 정확도 + 노출 조절 유효). 트레이드오프: 값>1 하드클립(부드러운 롤오프 없음) — 기본 조명은 안 넘겨 안전, 밝은 HDR/강광은 노출 슬라이더로 억제. `SceneToneMapping` 컴포넌트 + Canvas gl prop, 에디터·뷰어 동일.
3. **씬별 분위기 원함**(가벼우면) — 이미 `environment.lights`·HDR·sky·fog가 씬 단위 저장이라 대부분 가능. 가벼운 추가: **씬별 노출(toneMappingExposure) 슬라이더** + 선택적 분위기 프리셋(아침/한낮/노을/밤 env 묶음).

**L2 진행 상황**: ①(톤매핑 Linear+노출)·②(바닥 스냅 버튼)·③(분위기 프리셋 + ContactShadows) **완료**.
- **③-a 분위기 프리셋**: 에디터 Environment 패널 'Mood' 섹션 — 아침/한낮/노을/밤/스튜디오 5개 버튼(`MOOD_PRESETS`). 클릭 시 `updateEnvironment`로 **HDR 프리셋 + 라이트(강도/태양위치) + 노출** 묶음 적용(기존 검증된 경로 재사용). **브라우저 확인 완료(2026-07-07)**.
- **③-b ContactShadows**: 스키마 `contactShadows`, 에디터·뷰어 렌더, Lights 패널 토글. **기본 꺼짐(opt-in)**. **실제 GPU 브라우저에서 렌더 확인 완료(2026-07-07)** — 헤드리스 SwiftShader에선 안 그려졌던 것뿐. opt-in 유지.
- **미착수(남음)**: (c) 라이트 색(warm/cool) 스키마 — 진짜 색감 무드엔 필요(현재 조명 색 없음).

### L2 후속 수정 (2026-07-06, 사용자 피드백)
- **기본(방향광) 그림자 더 진하게**: fill 광이 그림자를 씻어내던 걸 줄임 — `ViewerCanvas`·`EditorCanvas`의 ambient 배수 0.5→**0.2**, hemisphere 0.08→**0.02**, `DefaultEnvironment` IBL 기본값 0.35→**0.25**. 측정(`/test/shadow`): 그림자/바닥 밝기 140/165 → **119/149**로 심도↑. 트레이드오프: fill이 줄어 씬 전체가 약간 어두워짐(특히 그림자 밖 어두운 구석)·PBR 재질 IBL 반사 살짝 감소. 더 진하게 원하면 fill을 더 낮추거나 per-scene 그림자 강도 슬라이더 추가 고려.
- **ContactShadows 플레이 모드 트레일 버그 수정**: 접지 그림자 켠 채 플레이하면 캐릭터 이동 경로에 검은 그림자가 칠해지던 문제 → **플레이 모드에선 ContactShadows 미렌더**(`!playMode` 게이트, `ViewerCanvas`). 접지 그림자는 정적 씬(탐색/에디터)용. 헤드리스에선 ContactShadows 자체가 안 그려져 트레일 재현·확인 불가지만, 컴포넌트를 트리에서 빼므로 구조적으로 트레일 불가능.

## 알려진 제약/한계
- `go_to_scene`: **경로의 현재 씬 id를 대상 id로 치환**해 이동 → `/space`·`/embed`·커스텀도메인(경로에 id 포함 시) 모두 대응. 경로에 id 없으면 `/space/{id}` 폴백. (뷰어 통합 리팩터 2026-07-07)
- `focus_object`/`reset_camera`: 탐색(orbit) 모드 전용 — 플레이 모드는 캐릭터 팔로우 카메라라 무시됨.
- 솔리드(비센서) 오브젝트는 area 트리거로 팝업/URL/씬이동은 되나 **애니메이션 재생 안 됨**(activeClip 센서 전용).
- `interact` 트리거: **플레이 모드 전용 + 루트 오브젝트 전용**(중첩 그룹 자식은 로컬 좌표라 근접 판정 제외). 범위 고정 3m·정면 조건 없음(최근접). 키는 E 고정. **임베드(EmbedClient)는 E키 발동은 되나 프롬프트 UI 미표시**(뷰어 전용). `Is Sensor` 통과는 버그가 아니라 트리거 영역의 정의 — 막고 싶으면 센서 끄기(기본 솔리드).
- `move_object`: **그룹 대상은 탐색 모드 전용** — 플레이 모드에선 자식 RigidBody의 props가 안 바뀌어 rapier 동기화 effect가 미발동, 자식 콜라이더가 안 따라감. 플레이에서 움직일 건 개별 오브젝트를 대상으로. 이동한 솔리드 위에 선 캐릭터는 같이 안 실려감(텔레포트라 이동 플랫폼은 아님). ~~임베드는 E2 미지원~~ → **임베드도 전체 액션 지원**(아래 뷰어 통합 참고).
- `play_sound`: 오디오 URL 직접 입력만(AssetBrowser audio 탭 WIP). area 트리거는 브라우저 자동재생 정책에 막히면 무음(조용히 무시).
- 인터랙션 힌트 링(2026-07-07 개선): **occlusion 적용** — `depthTest` 기본값(true)으로 앞 오브젝트가 뒤 오브젝트 링을 가림(엑스레이·겹침 문제 해결). 위치는 **GLB bbox 캐시(`glbLocalBboxCache`) 기반 실제 상단**(뷰어의 `GlbViewer`도 캐시 저장)으로 정확해짐, 캐시 없으면 스케일 근사. `InteractionHints`가 매 프레임 높이 갱신(GLB 늦은 로드 대응). 회전 미반영(근사). 그룹 자체엔 링 없음(자식 기준). 에디터 뷰포트엔 안 뜸(뷰어 전용).
- 톤매핑 **Linear 전역 적용**: 저장 색을 정확히 렌더하지만 값>1 밝은 영역은 하드클립(부드러운 롤오프 없음). 밝은 HDR/강광 씬은 노출 슬라이더로 낮출 것. 기존 published 씬도 룩이 바뀜(더 진한 색).
- **ContactShadows 실렌더 미검증**: 헤드리스에서 안 그려져 opt-in 기본 꺼짐으로 뒀다. 실제 브라우저에서 켜 확인 후, 정상이면 기본값·프리셋 포함 여부 재검토.
- **바닥 스냅**: 루트 GLB만(그룹/프리미티브/content 제외). `glbLocalBboxCache`에 값이 있어야(=한 번 렌더된 GLB) 버튼 활성화 — 미로딩 시 비활성.
- **테스트 페이지**: `/test/tonemap`(톤매핑 A/B 픽셀), `/test/snap`(바닥 스냅 렌더), `/test/contact`(ContactShadows on/off) 추가 — 기존 `/test/*` 규칙과 동일.
- 오토세이브: `ViewportToolbar`에 60초 자동저장 로직이 주석 처리된 채 방치(수동 Ctrl+S만 동작). `setAutoSaveAt` lint 경고 원인.
- 코드베이스 전반에 React Compiler eslint 규칙(immutability/set-state-in-effect/modify-local) 에러가 다수 존재 — 기존 코드, dev/build엔 영향 없음.

## Supabase 마이그레이션
`supabase/migrations/` — 0001_init ~ 0006_assets_public 까지. 새 환경에선 순서대로 실행 필요.
