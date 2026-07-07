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
- **Events E3-A — `interact` 트리거(다가가 E키)**: 플레이 모드에서 캐릭터가 interact 이벤트를 가진 오브젝트에 **근접(기본 3m)**하면 화면 하단에 **`E` 키캡만** 뜨고(이름 미표시 — 대상은 3D 하이라이트로 구분), **동시에 근접 대상 오브젝트가 하이라이트**(emissive 글로우만 — 플레이 모드는 무-외곽선 규칙 유지라 아웃라인/박스는 안 씀)돼 어디에 E를 눌러야 할지 보임. **E키(모바일=우하단 원형 E 버튼)**로 그 오브젝트의 이벤트 발동(팝업/씬이동/애니메이션 등 기존 액션 파이프라인 재사용). 하이라이트 배선: `InteractHighlightContext`(근접 대상 id)를 R3F 트리에 내려 `ViewerObject`가 자기 자신이면 emissive/아웃라인 on — 호버 하이라이트와 통합(`emissiveOn`/`outlineOn`, 아웃라인은 탐색 모드 호버 전용 — 플레이 모드는 호버·interact 모두 글로우만, 무-외곽선). NPC 대화·간판·아이템·"눌러서 열기"용. **센서 통과는 버그가 아니라 트리거 영역의 정의**임을 확인한 뒤 나온 후속 기능(플랫폼이 "게임적 상호작용"으로 한 걸음). 배선: `PlayModeController` useFrame이 플레이어↔interactable 최근접 산출(대상 변할 때만 콜백) + `KeyE` keydown 발동 → `PlayCanvas`가 interact 이벤트 있는 **루트** 오브젝트 목록 전달·id→obj 매핑 → `ViewerCanvas` 통과 → `ViewerClient`가 프롬프트 HTML·모바일 버튼·`interact` 디스패치·애널리틱스(`interact`) 담당. 에디터는 트리거 드롭다운에 `Interact (E)` + 안내문. **탐색 모드에선 발동 안 함**(캐릭터 없음 — 클릭으로 대체). 검증: tsc 클린 + 인증 세션에서 `/space`·`/editor` 200·R3F 구동 확인. **실제 근접·E키 동작은 사용자가 브라우저에서 확인 필요**(헤드리스로 캐릭터 보행 미검증).
  - **E3-A 추가 — 근접 말풍선(`interactLabel`)**: 오브젝트별 텍스트를 설정하면(에디터 Events 섹션 상단 '근접 말풍선' 입력) 플레이 모드에서 캐릭터가 근접 시 **오브젝트 바로 위에 말풍선**(drei `Html`, 흰 배경+아래 꼬리, `distanceFactor`로 월드 앵커) 표시. `ObjectNodeSchema.interactLabel`. 근접 감지(`interactables`)는 이제 **interact 이벤트 OR interactLabel** 중 하나만 있어도 대상 → 말풍선만 있는 오브젝트(간판/인사말, E 없이)도 지원. E 프롬프트/버튼은 interact 이벤트가 있을 때만(`interactTargetHasE` 게이트). 렌더: GLB는 `GlbViewer`가 bbox.max.y 기준(정확), 프리미티브/콘텐츠는 `ViewerObject`가 0.5·scale.y 오프셋(근사). 동시 표시는 최근접 1개뿐(interactActive 단일). 제약: 루트 오브젝트만·플레이 모드 전용·영상/빈 콘텐츠는 말풍선 미지원.
  - **남은 E3-B(추후)**: 문(door) = 런타임 콜라이더 on/off 토글(`set_passable`/`toggle_collision`) — "E→문 열림 애니→통과 가능". hide_object 시 루트 콜라이더가 안 빠지는 것도 함께 손볼 것(PlayCanvas AutoCollider가 visible 무시). 필요할 때 착수.

## 남은 작업 / 로드맵
- **Events E3-B(문/콜라이더 토글)**: 위 '최근 완료' 참고 — A(interact) 완료, B(콜라이더 토글)는 필요 시.
- **Events E2**: 완료(이동/사운드/어포던스까지). 후속 아이디어: area 트리거용 어포던스(호버 불가라 현재 링 제외됨), 상호작용 힌트 아이콘 커스터마이즈.
- **조명 L2**: 아래 'L1 피드백 취합 결과 & L2 계획' 참고 — 피드백 수집 완료(2026-07-06), 착수 대기.
- **Prefab**: 미착수. 착수 전 **override/동기화 규칙 설계** 필요(원본 수정 시 인스턴스 반영, 개별 오버라이드 허용 여부 등).
- **오토세이브** 되살리기/제거 결정. 결제/플랜 업그레이드(Stripe), AssetBrowser materials/textures/hdr/audio 탭(WIP).

## 조명 L2 — L1 피드백 취합 결과 & 계획 (2026-07-06)
사용자가 L1 기본값으로 실제 씬을 보고 준 피드백 3건 + 코드 진단:
1. **GLB가 바닥에 파묻힘** — `addAssetObject`(sceneStore)가 GLB 원점을 무조건 y=0에 놓음. GLB는 원점이 발밑이 아닌 기하 중심인 경우가 많아 밑면이 바닥(`y=-0.002` 텍스처 평면) 아래로 내려감. 인스펙터 y 클램프 `Math.max(0,v)`는 **원점**만 0 이상으로 막고 **실제 밑면(bbox.min.y)**은 안 맞춤. 프리미티브는 생성 시 y=0.5+스케일1이라 정상. **[완료 — "바닥에 놓기" 버튼]** `GlbObject`가 계산한 로컬 bbox를 `glbLocalBboxCache`(url→Box3)에 저장 → 인스펙터 버튼이 오브젝트의 **회전+스케일 행렬을 로컬 bbox에 적용해 실제 min.y**를 구하고 `position.y = -min.y`로 밑면을 바닥(0)에 정렬. 루트(parentId=null) GLB만. 자동 스냅 대신 버튼(공중 배치 통제권 유지). 검증: three 수치(회전/스케일 5케이스 worldBase=0) + `/test/snap` 렌더(25°+비균일 스케일에서도 밑면이 바닥에 정확히 앉음).
2. **색이 밝게/파스텔로 뜸**(예: 저장 #226155 → 화면 #39706a) — 에디터·뷰어 Canvas 어디에도 톤매핑 미지정 → R3F 기본 **ACESFilmicToneMapping**이 채도 낮추고 중간톤 들어올림. **[완료 — Linear 채택]** `/test/tonemap` A/B 픽셀 측정(실제 조명 리그) 결과 저장색 대비 Δ: **none≈linear(Δ~10) < aces(Δ~20) < neutral(Δ~28)**. 처음엔 Neutral 추천했으나 측정상 Neutral이 오히려 색을 더 밀어냄. NoToneMapping은 exposure가 무효라, **`THREE.LinearToneMapping` 채택**(none과 동일 정확도 + 노출 조절 유효). 트레이드오프: 값>1 하드클립(부드러운 롤오프 없음) — 기본 조명은 안 넘겨 안전, 밝은 HDR/강광은 노출 슬라이더로 억제. `SceneToneMapping` 컴포넌트 + Canvas gl prop, 에디터·뷰어 동일.
3. **씬별 분위기 원함**(가벼우면) — 이미 `environment.lights`·HDR·sky·fog가 씬 단위 저장이라 대부분 가능. 가벼운 추가: **씬별 노출(toneMappingExposure) 슬라이더** + 선택적 분위기 프리셋(아침/한낮/노을/밤 env 묶음).

**L2 진행 상황**: ①(톤매핑 Linear+노출)·②(바닥 스냅 버튼)·③(분위기 프리셋 + ContactShadows) **완료**.
- **③-a 분위기 프리셋**: 에디터 Environment 패널 'Mood' 섹션 — 아침/한낮/노을/밤/스튜디오 5개 버튼(`MOOD_PRESETS`). 클릭 시 `updateEnvironment`로 **HDR 프리셋 + 라이트(강도/태양위치) + 노출** 묶음 적용(기존 검증된 경로 재사용). 헤드리스(에디터 인증 필요)로 라이브 테스트 못 함 — 값은 사용자가 미세조정.
- **③-b ContactShadows**: 스키마 `contactShadows`, 에디터·뷰어 렌더, Lights 패널 토글. **기본 꺼짐(opt-in)** — 헤드리스 SwiftShader에선 렌더 안 됨(on/off 픽셀 동일, 콘솔 에러 없음 → 소프트웨어 GL 한계로 추정, 실제 GPU 브라우저에선 동작 예상). 검증 못 한 걸 전역 기본 켜짐으로 두지 않으려 opt-in. **사용자가 실제 브라우저에서 켜서 확인 필요**.
- **미착수(남음)**: (c) 라이트 색(warm/cool) 스키마 — 진짜 색감 무드엔 필요(현재 조명 색 없음). ContactShadows 실제 렌더 확인.

### L2 후속 수정 (2026-07-06, 사용자 피드백)
- **기본(방향광) 그림자 더 진하게**: fill 광이 그림자를 씻어내던 걸 줄임 — `ViewerCanvas`·`EditorCanvas`의 ambient 배수 0.5→**0.2**, hemisphere 0.08→**0.02**, `DefaultEnvironment` IBL 기본값 0.35→**0.25**. 측정(`/test/shadow`): 그림자/바닥 밝기 140/165 → **119/149**로 심도↑. 트레이드오프: fill이 줄어 씬 전체가 약간 어두워짐(특히 그림자 밖 어두운 구석)·PBR 재질 IBL 반사 살짝 감소. 더 진하게 원하면 fill을 더 낮추거나 per-scene 그림자 강도 슬라이더 추가 고려.
- **ContactShadows 플레이 모드 트레일 버그 수정**: 접지 그림자 켠 채 플레이하면 캐릭터 이동 경로에 검은 그림자가 칠해지던 문제 → **플레이 모드에선 ContactShadows 미렌더**(`!playMode` 게이트, `ViewerCanvas`). 접지 그림자는 정적 씬(탐색/에디터)용. 헤드리스에선 ContactShadows 자체가 안 그려져 트레일 재현·확인 불가지만, 컴포넌트를 트리에서 빼므로 구조적으로 트레일 불가능.

## 알려진 제약/한계
- `go_to_scene`: 독립 URL(`/space/{id}`) 기준 이동 — 커스텀도메인/임베드 컨텍스트 미대응.
- `focus_object`/`reset_camera`: 탐색(orbit) 모드 전용 — 플레이 모드는 캐릭터 팔로우 카메라라 무시됨.
- 솔리드(비센서) 오브젝트는 area 트리거로 팝업/URL/씬이동은 되나 **애니메이션 재생 안 됨**(activeClip 센서 전용).
- `interact` 트리거: **플레이 모드 전용 + 루트 오브젝트 전용**(중첩 그룹 자식은 로컬 좌표라 근접 판정 제외). 범위 고정 3m·정면 조건 없음(최근접). 키는 E 고정. **임베드(EmbedClient)는 E키 발동은 되나 프롬프트 UI 미표시**(뷰어 전용). `Is Sensor` 통과는 버그가 아니라 트리거 영역의 정의 — 막고 싶으면 센서 끄기(기본 솔리드).
- `move_object`: **그룹 대상은 탐색 모드 전용** — 플레이 모드에선 자식 RigidBody의 props가 안 바뀌어 rapier 동기화 effect가 미발동, 자식 콜라이더가 안 따라감. 플레이에서 움직일 건 개별 오브젝트를 대상으로. 이동한 솔리드 위에 선 캐릭터는 같이 안 실려감(텔레포트라 이동 플랫폼은 아님). 임베드(EmbedClient)는 E2 액션 전반 미지원(기존과 동일).
- `play_sound`: 오디오 URL 직접 입력만(AssetBrowser audio 탭 WIP). area 트리거는 브라우저 자동재생 정책에 막히면 무음(조용히 무시).
- 인터랙션 힌트 링: 위치가 오브젝트 스케일 기반 **근사**(정확한 bbox 미측정) — 매우 높은 GLB는 링이 모델 상단이 아닌 중간에 뜰 수 있음(depthTest=false라 가려지진 않음). 그룹 자체엔 링 없음(자식 오브젝트 기준). 에디터 뷰포트엔 안 뜸(뷰어 전용) — 미리보려면 published 뷰어/‑/space 에서 확인.
- 톤매핑 **Linear 전역 적용**: 저장 색을 정확히 렌더하지만 값>1 밝은 영역은 하드클립(부드러운 롤오프 없음). 밝은 HDR/강광 씬은 노출 슬라이더로 낮출 것. 기존 published 씬도 룩이 바뀜(더 진한 색).
- **ContactShadows 실렌더 미검증**: 헤드리스에서 안 그려져 opt-in 기본 꺼짐으로 뒀다. 실제 브라우저에서 켜 확인 후, 정상이면 기본값·프리셋 포함 여부 재검토.
- **바닥 스냅**: 루트 GLB만(그룹/프리미티브/content 제외). `glbLocalBboxCache`에 값이 있어야(=한 번 렌더된 GLB) 버튼 활성화 — 미로딩 시 비활성.
- **테스트 페이지**: `/test/tonemap`(톤매핑 A/B 픽셀), `/test/snap`(바닥 스냅 렌더), `/test/contact`(ContactShadows on/off) 추가 — 기존 `/test/*` 규칙과 동일.
- 오토세이브: `ViewportToolbar`에 60초 자동저장 로직이 주석 처리된 채 방치(수동 Ctrl+S만 동작). `setAutoSaveAt` lint 경고 원인.
- 코드베이스 전반에 React Compiler eslint 규칙(immutability/set-state-in-effect/modify-local) 에러가 다수 존재 — 기존 코드, dev/build엔 영향 없음.

## Supabase 마이그레이션
`supabase/migrations/` — 0001_init ~ 0006_assets_public 까지. 새 환경에선 순서대로 실행 필요.
