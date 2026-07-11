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

## 진행 중 (2026-07-09) — 그룹/변환/undo 크리티컬 버그 4종 (사용자 보고 "이대로는 못 씀")

계획 순서: ①spin wobble → ②그룹 자식 클릭 → ③ungroup 행렬화 → ④undo 경합.

- **버그 1 완료 — spin 회전 wobble(눕힌 바퀴가 삐뚤빼뚤)**: `motion.ts`의 spin이 **오일러 성분을 직접 더함**(`ry = baseRot[1] + t·spd`)이라 baseRot≠0(눕힌/기운 물체)이면 오일러 재조합으로 **세차운동(wobble)**. → **쿼터니언 합성**(`baseQuat ∘ 축회전(angle)`, post-multiply=로컬 축)으로 교체, out.rot는 setFromQuaternion으로 유지(시각 `g.rotation`·콜라이더 `setFromEuler` 양쪽 API 무변경). **결정적 테스트로 재현·수정 확인**: 눕힌 바퀴(Z 90°) spin 회전축 이탈(drift) **1.99 → 0.00**, 똑바로 선 물체도 정상. 시각·플레이 콜라이더 동시 해결. 참고: 모션을 *그룹*에 걸면 원점 기준이라 자식이 공전할 수 있음(제자리 회전은 각 자식에 모션) — 별개 UX.
- **버그 4 완료 — 그룹 자식 뷰포트 클릭 선택**: `handleClick`이 항상 `findRootAncestorId`(최상위 그룹)만 선택 → 트리에서만 자식 선택 가능하던 불편. **모듈 스코프 더블클릭 감지 `selectByClick`** 신설(같은 오브젝트 350ms 내 재클릭=자식 리프 직접 선택, Figma/Illustrator식 그룹 진입). 3개 핸들러(라이트·그룹·메인=프리미티브/콘텐츠/GLB 콜백)가 공유 → 모든 렌더 경로 커버. tsc 클린·컴파일 정상. **브라우저 실동작 확인 필요**(그룹 자식 더블클릭 선택·기즈모/인스펙터 자식 반영).
- **버그 2 완료 — 재그룹(중첩)→이동→그룹해제→위치 급변**: 근본 원인 = `ungroupSelected`가 **그룹의 로컬 TRS를 월드로 착각** → 그룹이 중첩(재그룹화)되면 조상 변환이 누락돼 자식 위치가 크게 틀어짐(회전+비균일스케일은 부차적, 위치는 원래 맞았음). **결정적 테스트로 확정**: 중첩(Go>Gi>C)에서 OLD 자식위치 (1.61,1.01,0.20) vs 참값 (5.20,3.01,-0.04) — 3유닛+ 오차. → **행렬 기반 재작성**: `computeWorldMatrix`(전체 부모체인)로 자식 참 월드행렬 구하고, **새 부모=그룹의 부모**(중첩이면 조부모로 승격) 역행렬 곱 후 decompose. 위치 정확 보존(NEW err ~1e-16). 한계: 회전+비균일스케일 그룹의 전단(shear)은 TRS로 표현 불가라 형상만 근사(위치는 항상 정확 — 어차피 Three 객체는 전단 불가). 2/2 테스트 통과·tsc 클린.
- **버그 3 완료 — 다중이동+Ctrl+Z 일부만 복원·좌표틀어짐·유령 오브젝트**: 근본 원인 = 기즈모가 `updateObject`의 **`_prevSnapshot` 지연커밋 패턴**에 의존(N회 updateObject + 1회 pushHistory) → **직전에 커밋 안 된 편집이 남긴 stale `_prevSnapshot`**이 있으면 undo 기준이 과거로 오염(일부 오브젝트가 과거값·유령 오브젝트 재등장). **재동기화(useLayoutEffect deps)는 정상**임을 확인 후 상태관리 문제로 특정. → 스토어에 **원자적 `commitTransforms(updates[])`** 신설(자체 baseline으로 `withHistory` 1회 커밋 + `_prevSnapshot:null`로 잔재 제거). `MultiGizmo`/`SingleGizmo` onMouseUp을 이걸로 교체(N회 updateObject+pushHistory 폐기). **스토어 테스트 8/8 통과**: 다중이동 undo 일관복원·오염방어(undo가 커밋 직전으로 복원, 과거로 안 튐)·유령 없음(오브젝트 수 유지)·그룹 포함 이동 undo. tsc 클린·컴파일 정상.
- **4종 전부 코드+결정적 테스트 완료. 브라우저 실동작 최종 확인만 남음**(특히 버그 4 더블클릭, 버그 2 중첩그룹 해제, 버그 3 대규모 다중선택 undo). 신규 lib/액션: `motion.ts`(쿼터니언 spin)·`sceneStore.commitTransforms`·`EditorObjectInstance.selectByClick`·`sceneStore.ungroupSelected`(행렬화).

## 진행 중 (2026-07-09) — 인앱 3D 모델링 (일반인 온보딩 장벽 해소)
> **스코프 5단계 전부 완료 — ✅ 브라우저 실동작 확인 완료(2026-07-10, 사용자). 각뿔대/둥근박스/Merge/Boolean/Loft 정상.**

### 배경/합의
- **문제 인식(사용자)**: 일반인은 GLB를 어디서 구하는지 모르고 Blender를 못 씀 → import-only만으론 진입장벽. 간단하게라도 객체를 만들고·조합하고·움직일 수 있어야 함(예: 바퀴 만들고 몸체 만들고 색 입혀 조립해 굴리기).
- **경쟁 조사 결론(2026-07-09)**: Spline은 이미 물리·Walk/Fly 게임컨트롤·19종+ 이벤트·인툴 모델링(프리미티브+불리언)·AI 3D생성 보유 → **기능 체크박스 경쟁으론 불리**. 우리 빈칸 = **다중 씬 사이트 + 커스텀 도메인 배포 + Event Bridge(임베드 호스트 페이지 연동)**. 인툴 모델링은 "Blender 재구현"이 아니라 **간단 조립 도구** 수준으로 진입장벽만 낮추는 게 목표.
- **확정 스코프(순서)**: ①**프리미티브 확장**(둥근 박스·각뿔대) → **Merge**(여러 오브젝트→진짜 하나, GLB로 구워 기존 에셋 파이프라인 재사용) → **Boolean**(합치기/빼기·구멍 뚫기, bake 방식) → ②**Loft**(다단면) → ③**서브디비전 제외**. (유선형 자유곡면=서브디비전 박스모델링은 스코프 밖 — Loft까지가 현실적 상한.)
- **핵심 판단**: "조립+움직임"은 이미 프리미티브+그룹+Prefab+motion(spin)으로 대부분 가능. 진짜 부족한 건 "새 형태 만들기". 콜라이더: 둥근 박스=box→cuboid 근사, 각뿔대=hull/trimesh 근사(변경 불필요).

### Phase 1 완료 — 프리미티브 확장 (둥근 박스 + 각뿔대)
- **스키마(`scene.ts`)**: `PrimitiveShape`에 `'frustum'` 추가 + `PrimitiveGeom { cornerRadius?, cornerSegments?, topScale? }` + `ObjectNodeSchema.geom?`(옵셔널=하위호환).
- **공용 팩토리 `src/lib/primitiveGeometry.ts`(신규)**: `createPrimitiveGeometry(shape, geom)` 단일 소스 — 기존 5곳 인라인 `<boxGeometry>` 등을 대체. 둥근 박스=`RoundedBoxGeometry`(three/examples), **각뿔대=4각 CylinderGeometry(radiusTop=0.5√2·topScale)를 45° 회전**해 축정렬 사각 단면(법선·UV 정확). `primitiveGeomKey`(인스턴싱/메모 키).
- **배선**: `EditorObjectInstance`·`ViewerObject`(둘 다 `geometry={primGeom}` prop + useMemo/dispose, ViewerObject는 early-return 前 hook·isPrimitive 가드) · `InstancedPrimitives`(배칭 키에 geom 포함 + 대표 오브젝트로 지오메트리 생성). 콜라이더(`PhysicsObject`/`PlayCanvas`)는 무변경(frustum→hull/trimesh, 둥근박스→cuboid 자연 근사).
- **UI**: 추가 메뉴(`ViewportFloatingToolbar` SHAPES + `CommandPalette`)에 '각뿔대' 추가 + Inspector **Geometry 섹션**(box=모서리 둥글기·둥근면 부드러움, frustum=윗면 크기). 둥근 박스는 별도 타입 아니라 **box의 cornerRadius 파라미터**(0=기존 각진 박스).
- **bbox**: 프리미티브는 단위 박스([-0.5,0.5]³) — frustum(topScale≤1)·둥근 박스 모두 범위 내라 바닥스냅/정렬 그대로 정확.
- **검증**: **tsc 클린** + **지오메트리 수치 테스트 11/11 통과**(각뿔대 아랫면 반폭 0.5·윗면 0.25@topScale0.5·apex@0·box@1, 둥근 박스 단위 박스 유지, 키 구분 — `tsx` 임시 스크립트) + **에디터/뷰어 라우트 200·컴파일 정상**. **에디터 실클릭(각뿔대 추가·둥근 박스 슬라이더·인스턴싱) 브라우저 확인 필요**.
### Phase 2 완료 — Merge (여러 프리미티브 → 진짜 하나의 객체)
- **핵심 결정**: 병합 결과를 새 스키마 필드 없이 **GLB로 구워(bake) 기존 에셋 파이프라인에 태운다** → '하나의 에셋 오브젝트'가 됨. Prefab(개별 요소 살아있는 묶음)과 달리 **되돌릴 수 없는 진짜 병합**(Blender Join).
- **업로드 공용화 `src/lib/uploadAsset.ts`(신규)**: `uploadGlbBlob(body, name, projectId, type)` — Storage 업로드 + assets DB insert + 썸네일 → AssetRefSchema. `AssetBrowser.uploadGlb`의 중복 로직을 이 함수로 추출(AssetBrowser도 이걸 호출하도록 리팩터, 회귀 없음 확인).
- **병합 로직 `src/lib/mergeObjects.ts`(신규)**: `buildMergedGlb(objects, rootIds)` — 루트들의 서브트리에서 **프리미티브만** 수집(GLB/콘텐츠/라이트/파티클 제외) → 각 월드행렬로 `createPrimitiveGeometry`+`MeshStandardMaterial` 메쉬 생성 → 전체 월드 bbox 중심 기준 로컬로 옮겨 `GLTFExporter.parseAsync({binary})` → `{ blob, center, count }`. 대상 없으면 null.
- **스토어 `mergeIntoAsset(rootIds, asset, position, name)`**: 대상 루트+자손 제거 + 에셋 추가(중복 방지) + 에셋 오브젝트 1개를 center에 배치(단일 undo).
- **UI**: Inspector **다중선택 패널에 '합치기' 섹션**(⛶ 하나로 합치기) — async(GLB 굽기+업로드) busy 상태·토스트·persist. 안내: 병합 후 개별 편집 불가·Ctrl+Z 취소 가능·GLB/콘텐츠/라이트 제외.
- **검증**: **tsc 클린** + **병합 GLB 빌드 테스트 7/7 통과**(count·유효 GLB 'glTF' 매직·중심 계산·프리미티브 필터·GLB만이면 null — `tsx`+FileReader 폴리필. Node엔 FileReader 없지만 **브라우저엔 항상 있어 실앱 정상**) + 에디터/뷰어 200. **에디터 실클릭(2+ 선택→합치기→에셋화·바닥배치·원본 제거) 브라우저 확인 필요**.
- **알려진 제약**: 프리미티브만(GLB 병합 후속) · undo 시 원본은 복원되나 업로드된 에셋 파일/DB행·assets 목록 항목은 남음(파일은 이미 커밋됨 — 일관성 위해 유지) · 텍스처 UV 없음(단색/PBR만).
- **다음**: Boolean(합치기/빼기·구멍 뚫기, `three-bvh-csg`로 bake→같은 파이프라인) → Loft.

### Phase 3 완료 — Boolean (합집합/차집합/교집합·구멍 뚫기)
- **의존성**: `three-bvh-csg@0.0.16` 설치(최신 0.0.18은 three-mesh-bvh≥0.9.7 peer라 drei의 three-mesh-bvh@0.8.3과 충돌 → **0.0.16이 0.8.3과 호환**, 기존 것에 dedupe·충돌 없음). `npm install three-bvh-csg@0.0.16`.
- **로직 `src/lib/booleanObjects.ts`(신규)**: `buildBooleanGlb(objects, baseId, toolId, op)` — 프리미티브 2개를 `Brush`로 만들어(월드행렬 반영, base 월드 bbox 중심으로 정렬) `Evaluator`(useGroups=false)로 ADDITION/SUBTRACTION/INTERSECTION 계산 → base 머티리얼 적용 → GLTFExporter로 GLB. 대상이 프리미티브 아니면 null.
- **UI**: Inspector 다중선택 패널에 **정확히 2개 선택 시** 'Boolean' 섹션(합집합/빼기/교집합) — Merge와 동일하게 `mergeIntoAsset`으로 원본 2개→에셋 1개 대체. **빼기=먼저 선택(base) − 나중 선택(tool)**(안내에 이름 표기). 예: 몸체에서 실린더 빼 바퀴 자리 구멍.
- **검증**: **tsc 클린** + **CSG 테스트 10/10 통과**(union/subtract/intersect 각각 유효 GLB 'glTF' 매직·크기>0 + 프리미티브 아니면 null — `tsx`+FileReader 폴리필) + 에디터 200·컴파일 정상. **에디터 실클릭(2개 선택→빼기→구멍 뚫린 결과) 브라우저 확인 필요**.
- **알려진 제약**: 프리미티브 2개만(GLB·다중 대상 후속) · 연쇄 Boolean은 결과 에셋을 다시 프리미티브와 못 뺌(에셋이 됨 — 후속은 GLB Boolean 지원 시) · 되돌릴 수 없음(Ctrl+Z 취소).

### Phase 4 완료 — Loft (다단면·각뿔대의 N단면 일반화)
- **로직**: `primitiveGeometry.ts`에 `makeLoft(sections[])` — **각뿔대(2단면)를 N단면으로 일반화**. `LatheGeometry`(4각+45° 회전)의 프로파일 **양끝을 축(반경 0)에 붙여 상·하 캡을 자동 생성** → 법선·캡·UV 안전. 각 단면 배율(0~1)로 층마다 폭 조절 → 병·꽃병·로켓·탑처럼 굴곡진 형태. 새 `PrimitiveShape 'loft'` + `PrimitiveGeom.sections?: number[]`.
- **배선**: 팩토리/키(`primitiveGeomKey`·InstancedPrimitives makeKey)·3개 렌더 경로 memo 의존성에 sections 반영. SHAPE_NAMES('로프트')·기본 geom(`{sections:[1,0.7,0.4]}`)·추가 메뉴(툴바+커맨드팔레트). Inspector Geometry 섹션에 **단면 슬라이더 목록 + 추가/제거(2~8층)**.
- **콜라이더/bbox**: loft→trimesh/hull 근사(변경 불필요), sections≤1이라 단위 박스 bbox 유지.
- **검증**: **tsc 클린** + **로프트 지오메트리 테스트 5/5 통과**(높이 1·최대 반폭 0.5·가운데 단면이 끝보다 좁음[다단면 증명]·법선 유한·미지정 폴백 — `tsx`) + 에디터 200·컴파일 정상. **에디터 실클릭(로프트 추가·단면 추가/조절) 브라우저 확인 필요**.

### 🎯 인앱 모델링 스코프 전체 완료 (①프리미티브확장 → Merge → Boolean → ②Loft, ③서브디비전 제외)
- **신규 라이브러리/의존성**: `three-bvh-csg@0.0.16`(Boolean). 신규 lib 4개: `primitiveGeometry.ts`·`mergeObjects.ts`·`booleanObjects.ts`·`uploadAsset.ts`.
- **자동차 예시 달성 경로**: 둥근 박스(몸체) + 각뿔대/실린더(바퀴) → 색·재질 → 그룹/프리팹 → motion(spin) 굴리기, 또는 Boolean 빼기로 바퀴 자리 구멍, Merge로 하나의 객체화. "만들고·조합하고·움직이는" 흐름이 코드로 완성됨.
- **미착수(스코프 밖/후속)**: 유선형 자유곡면(서브디비전 박스모델링) · GLB 대상 Merge/Boolean · 텍스처 UV · loft 원형 단면 옵션 · 대칭(mirror) 편집.

## 최근 완료 (2026-07-11) — 기능 갭 A그룹 4종 (Visibility 옵션·실측 Size·Frame 비율·Grid 평면)

사용자 기획서(11개 기능) 대조 후 "A그룹(저비용·고효과)" 우선 구현.
- **#9 per-object Visibility 렌더 옵션**(프리미티브): `ObjectNodeSchema.render?{flatShading,doubleSided,castShadow,receiveShadow}` 추가. `PrimitiveMaterial`에 `flatShading`(key에 포함해 런타임 전환 시 재마운트)·`side` prop → 에디터(`EditorObjectInstance`)·뷰어(`ViewerObject`) 프리미티브 mesh 배선(castShadow/receiveShadow도). Inspector Visibility 섹션에 토글 4종(프리미티브 전용). 미설정=스무스·앞면·그림자 생성+수신(기존 동작).
- **#6 실측 Size(m) 필드**: Transform 섹션에 `크기(m)` XYZRow — `localBBox × scale`로 표시, 입력 시 `scale = size/localSize` 역산. box/구체는 size=scale, 돌출/로프트는 실측 반영(localBBox 캐시 활용). (놓쳤던 `⤓ 바닥에 놓기` 글리프도 `ArrowDownToLine`로 교체.)
- **#1 Frame 고정 화면 비율**: `EnvSchema.frameAspect?`(width/height, 미설정=자유). **게시 뷰어**(`ViewerClient`)가 설정 시 캔버스를 그 비율로 레터박스(`maxWidth: 100vh*ar`, `maxHeight: 100vw/ar`로 가운데 정렬+배경 여백). 에디터 Environment 패널에 Frame 섹션(자유/16:9/4:3/1:1/9:16/3:4). 에디터 캔버스는 미변경(오버레이/좌표계 안전).
- **#4a Grid 평면 전환**: 스토어 전환 상태 `gridPlane('xz'|'xy'|'yz')`+`cycleGridPlane`(씬 저장 X). `EditorCanvas` drei `<Grid>`에 회전 적용(바닥/벽). 툴바에 격자 순환 버튼(`Grid3x3` + XZ/XY/YZ 라벨).
- 검증: tsc 클린 + editor 200. **실동작 브라우저 확인 필요**(셰이딩/양면/그림자 토글, Size 입력 역산, 게시 뷰어 레터박스, 격자 평면 전환).
- **B그룹 진행 중** — 아래 참고. 남음: #3 Effects+FogExp2+SSAO(N8AO 설치 필요) · #7 Subdivision(패키지 설치 필요) · #2b 에디터 실시간 물리 프리뷰. 대형(C): #5 글로벌 재질/색 에셋 · #8b 레이어 재질/AI.

### B그룹 (2026-07-11, 무설치분) — #8a MeshPhysicalMaterial · #4b 오브젝트 스냅
- **#8a MeshPhysicalMaterial**: `MaterialOverride`에 `clearcoat`/`sheen`/`transmission`/`ior` 추가. `PrimitiveMaterial`이 셋 중 하나라도 >0이면 **`meshPhysicalMaterial`로 전환**(key로 std↔physical 재마운트), 전부 0이면 기존 `meshStandardMaterial`. 에디터·뷰어 프리미티브 배선. Inspector Material 섹션에 '물리 재질(고급)' 슬라이더(clearcoat/sheen/transmission + transmission>0일 때 IOR). transmission은 유리처럼 투명(transparent+thickness).
- **#4b 오브젝트 스냅(자석)**: 스토어 토글 `objectSnap`(그리드 스냅과 독립, 기본 OFF) + 툴바 스냅 드롭다운에 토글. `SingleGizmo` translate에서 **루트 오브젝트** 이동 시, 드래그 시작 시 스냅샷한 다른 루트들의 월드 bbox와 비교해 **각 축의 min/center/max를 임계 0.2m 내 최근접에 흡착**(`localBBox×matrixWorld`로 가이드박스 오염 없는 정밀 bbox 사용). 토글 OFF면 완전 무영향(격리). 중첩/캐릭터 프리뷰 제외. 가이드 라인 시각화는 미포함(MVP).
- 검증: tsc 클린 + editor 200 + ✓ Compiled. **실동작 브라우저 확인 필요**(물리 재질 clearcoat/sheen/유리, 오브젝트 스냅 흡착).
  - **#8a 투과 보강(2026-07-11)**: 표준 `meshPhysicalMaterial transmission`이 뒤가 안 비치던 원인 = **metalness**(유리는 비금속). three r185 렌더리스트 소스 확인 결과 `transparent` 플래그는 무관(transmission이 먼저 transmissive 리스트로 분류)이었음 → 내가 넣었던 `transparent` 제거 + **transmission>0이면 metalness 0 강제**. drei `MeshTransmissionMaterial`(무거움)로 잠깐 갔다가, 성능 위해 내장 physical로 되돌림.

### B그룹 (2026-07-11, 설치분) — #3 Effects/FogExp2/SSAO · #7 Subdivision
- **#3 개별 포스트이펙트 + SSAO + FogExp2**: `@react-three/postprocessing`가 이미 N8AO/SSAO/DoF/BrightnessContrast/HueSaturation 제공 → **무설치**. 스키마 `EnvSchema.effects{ssao,bloom,vignette,brightness,contrast,saturation,dof}` + `fog.mode('linear'|'exp')`/`fog.density`. `PostProcessingEffects` 재작성 — 개별 효과 하나라도 활성이면 프리셋 대신 그 조합(활성 효과만 배열로 EffectComposer에 전달, N8AO=SSAO), 아니면 기존 프리셋. `ViewerCanvas` fog가 mode='exp'면 `<fogExp2 density>`. 에디터: Post Processing 섹션에 '개별 효과(고급)' 슬라이더 7종, Fog 섹션에 방식(linear/exp)+density. (에디터/뷰어 둘 다 effects 전달.)
- **#7 Subdivision Modifier**: **`three-subdivide` 설치**(`LoopSubdivision`). `PrimitiveGeom.subdivisions?(0~3)` + `createPrimitiveGeometry`가 base 지오메트리 생성 후 level>0이면 `LoopSubdivision.modify(base, level, {split, uvSmooth:false})`로 세분화(각진 박스→둥근 유기 곡면). `primitiveGeomKey`·primGeom useMemo deps에 subdivisions 포함. Inspector에 'Subdivision' 섹션(모든 프리미티브, 레벨 0~3 슬라이더).
- 검증: tsc 클린 + editor 200 + ✓ Compiled(three-subdivide 로드 정상). **실동작 브라우저 확인 필요**(SSAO 구석음영·개별효과·지수안개, subdivision 레벨↑ 곡면화).
- **B그룹 남음**: #2b 에디터 실시간 물리 프리뷰 — **선택/보류**(에디터에서 Rapier 구동은 편집 중 오브젝트가 떨어져 기즈모/좌표와 충돌 → 리스크. 이미 플레이 모드가 있어 우선순위 낮음).

### C그룹 Phase 1 (2026-07-11) — #5 글로벌 재질 에셋 (공존형)
"재질을 라이브러리에 한 번 만들어 여러 오브젝트가 id로 공유, 원본 수정 시 일괄 반영"(피그마 색 스타일 개념). 기존 인라인 재질과 **공존** — materialId 있으면 참조, 없으면 기존 인라인(하위호환 100%).
- **스키마**: `MaterialAsset{id,name,material}`·`ColorAsset{id,name,color}` + `ProjectSceneSchema.materialAssets?/colorAssets?` + `ObjectNodeSchema.materialId?`.
- **리졸버** `src/lib/effectiveMaterial.ts`: `effectiveMaterial(object, materialAssets)` — materialId 참조 유효하면 에셋 재질, 아니면 인라인(에셋 삭제 시 인라인 폴백).
- **스토어**: `materialAssets`/`colorAssets` state(loadScene·persist·normalizeSceneData·**undo 스냅샷**에 포함) + 액션 `addMaterialAsset`(id 반환)·`updateMaterialAsset`(원본 편집=전 인스턴스 반영, _prevSnapshot 패턴)·`renameMaterialAsset`·`removeMaterialAsset`(참조 오브젝트는 인라인으로 detach 후 삭제 — 유령참조 방지)·`assignMaterialAsset`·`detachMaterial` + color add/remove.
- **렌더 배선**: 에디터 `EditorObjectInstance`가 `effectiveMaterial`로 색/거칠기/금속/발광/텍스처/물리속성 읽음. 뷰어는 `ViewerClient.effectiveScene`에서 materialId→에셋 재질을 object.material에 미리 주입(ViewerObject 무변경).
- **UI**: Inspector Material — 참조 중이면 **배너(에셋 이름)+"연결 끊기(detach)"**(슬라이더 숨김), 인라인이면 기존 편집+**"이 재질을 에셋으로 저장(공유)"** 버튼. AssetBrowser Materials 탭 상단에 **저장된 재질 라이브러리**(색 스와치 편집=공유 반영·이름 변경·"적용"(선택 프리미티브에 연결)·삭제).
- 검증: tsc 클린 + editor 200 + ✓ Compiled. **실동작 브라우저 확인 필요**(에셋 저장→여러 오브젝트 적용→라이브러리서 색 변경 시 일괄 반영→연결 끊기).

### C그룹 Phase 2 (2026-07-11) — 색 팔레트 · 라이브러리 전 속성 편집 · 복제
- **색 팔레트(ColorAsset)**: AssetBrowser Materials 탭 하단에 색 스와치 그리드 + "현재 색 저장"(선택 프리미티브 색) + 클릭 적용(선택 프리미티브 material.color, 참조 재질 제외) + 삭제. 스토어 `addColorAsset`/`removeColorAsset`.
- **라이브러리 재질 전 속성 편집**: Materials 탭 저장된 재질에 펼침(`SlidersHorizontal`) 토글 → 거칠기/금속성/코팅광택/투과 range 슬라이더 + 자체발광 색 → `updateMaterialAsset`(공유 반영). 기존엔 색만 편집 가능했음.
- **프로젝트 복제 리맵**: `remapSceneData`가 scene_data를 통째 JSON 딥클론하므로 **materialAssets·object.materialId가 이미 보존**됨(내부 UUID·씬 스코프라 충돌 없음) → **별도 작업 불필요**로 확인됨(PROGRESS 이전 우려 정정).
- 검증: tsc 클린 + editor 200 + ✓ Compiled. **실동작 브라우저 확인 필요**(색 저장/적용, 라이브러리 슬라이더로 공유 재질 속성 편집→일괄 반영).
- **#5 재질/색 에셋 전체 완료**(Phase 1+2). 남은 대형: #8b 레이어 재질/AI 텍스처(별개 스프린트).

## 최근 완료 (2026-07-10) — 에디터 UX 3종 (아이콘 lucide화 · 배치 모드 · 툴바 드롭다운)

사용자 요청 3건. 컨펌 후 진행(단순 반투명 고스트 · 한 번 배치 후 종료 · 이모지 전부 lucide).

- **아이콘 전면 lucide화**: 이모지·텍스트 글리프(▾▸ ↺ ⌂ ✕ ▶ ■ ✓ ✏ 📦🧍🎵 🔥❄️ 🌅🌙 ⬛⬤ 등)·이미지 아이콘을 전부 `lucide-react`로 교체. 대상: `ViewportFloatingToolbar`(도형·펜·복셀), `AssetBrowser`(카드·탭·오디오·재질·HDR·콘텐츠·파티클·라이트), `HierarchyPanel`(트리 아이콘·표시/잠금·컨텍스트메뉴), `InspectorPanel`(SectionHeader 화살표/아이콘·무드·그라운드·파티클/라이트 SelectBox·합치기·정렬·프리팹·클로너·GLB내보내기·이벤트 미리보기/수정/삭제), `CommandPalette`(전 명령 아이콘), `SceneSwitcher`·`VersionHistoryModal`·`PenToolModal`·`VoxelToolModal`·`EditorOnboarding`·`EditorClient`·`EditorGnb`·`Toaster`·`ThemeToggle`, 대시보드(`ProjectCard`·`ShareModal`·`CustomDomainModal`·`page`·`NewProject*`). 카테고리/무드 라벨 이모지까지 전부 아이콘화(사용자 결정). **유지**: 키보드 단축키 표기(⌃⇧G·⌃D)와 범례 화살표(↑↓↵)는 아이콘 아니라 텍스트 표기라 그대로. **주의**: `CheckCircle2`(deprecated alias)가 Turbopack HMR에서 module-factory 에러 → 정식 `CircleCheck`로 교체. 검증: tsc 클린 + editor·dashboard 200 + 렌더 에러 없음.
- **오브젝트/에셋 배치 모드**: add 버튼(도형·GLB·콘텐츠·파티클·라이트) 클릭 시 즉시 중앙 생성하지 않고 **뷰포트에서 클릭한 위치에 생성**. 스토어 `pendingPlacement` state + `beginPlacement`/`commitPlacement`/`cancelPlacement`. add* 5종에 `placeAt?:{x,z}` 옵션 파라미터(단일 히스토리 유지, y는 타입별 기본/바닥스냅 유지). `EditorCanvas`: 바닥(y=0) 평면 레이캐스트로 **단순 반투명 박스+바닥 링 고스트가 마우스 따라다님**(`PlacementGhost`, useFrame), 좌클릭=생성(**한 번 배치 후 종료**), **ESC 취소**, 상단 안내 배너 + crosshair 커서. 배치 클릭이 OrbitControls 좌드래그·선택박스·onPointerMissed 해제와 안 겹치게 게이트(`justPlacedRef`·orbit 일시 비활성). 호출부: 툴바 도형 + AssetBrowser 4탭. 검증: tsc 클린 + editor 200.
- **툴바 드롭다운화**(`ViewportFloatingToolbar`): 펼쳐져 있던 **스냅**(켜기 토글 + 0.25/0.5/1/2)과 **카메라 북마크**(1~5, 저장/이동)를 각각 **아이콘+ChevronDown 드롭다운**으로 접음(정렬 드롭다운과 동일 `openMenu` 패턴·바깥클릭 닫기). 북마크는 Shift+클릭 대신 슬롯별 이동/저장 버튼 명시. 도형 아이콘도 lucide(Box/Circle/Cylinder/Cone/Hexagon/Square)·펜=PenTool·복셀=Boxes. 검증: tsc 클린.

### 후속 3종 (2026-07-10) — 트리 잠금 캐스케이드 · 라이트 아이콘 · 도형 드롭다운
- **그룹 잠금 시 하위 요소도 잠금**: `sceneStore.setObjectLocked`가 대상이 그룹이면 자손 전체를 재귀 수집해 함께 locked 토글(선택 해제도 자손 포함). 단일 undo(_prevSnapshot) 유지.
- **트리 라이트 아이콘 종류별**: `HierarchyPanel.getIcon`에 라이트 분기 추가(point=Lightbulb / spot=Flashlight / directional=Sun). 기존엔 라이트가 분기 없어 Circle로 떴음.
- **툴바 도형 추가 드롭다운**: 박스~평면 6개 버튼 나열 → `Shapes` 아이콘+ChevronDown 드롭다운 1개로(각 항목 아이콘+라벨, 클릭 시 `beginPlacement`+닫기). 펜/복셀은 기존 버튼 유지. `Menu`에 'shapes' 추가.
- 검증: tsc 클린 + editor 200.

### 후속 (2026-07-11) — 도형추가 스플릿 버튼 · 프리미티브 bbox 정확화 · 박스선택 오선택 수정
- **도형추가 스플릿 버튼**: `ViewportFloatingToolbar` 도형 드롭다운을 `[아이콘][▾]`로 분리 — 아이콘=마지막 선택 도형(기본 박스) **즉시 배치**, 화살표=목록 열기. 목록 선택 시 `selectedShape` 갱신+즉시 배치. 화살표는 다른 드롭다운과 통일해 **우측**.
- **선택/호버 가이드 + 콜라이더 오버레이 실측 bbox화**(`EditorObjectInstance`): 고정 `1.05³`/`1.02` 단위 박스 → `primGeom` 실측 bbox 기준(여백 ×1.04/×1.02). 돌출/로프트/평면처럼 얇은 형상 가이드 과대 표시 수정. box/구체는 bbox=1이라 무변화.
- **`localBBox` 프리미티브 실측화 (bbox 캐시)**: `objectBBox.localBBox`가 프리미티브를 단위 큐브로 반환하던 것 → **`primLocalBboxCache`**(신규, GLB `glbLocalBboxCache`와 동일 패턴, `primitiveGeomKey` 키)를 `EditorObjectInstance`가 렌더 시 채우고 localBBox가 읽음. 드래그 미리보기·정렬·바닥스냅이 실제 크기 반영. **캐시는 에디터에서만 채워짐 → 뷰어/플레이는 단위 큐브 폴백(무변화)**, box/구체도 무변화.
- **🔴 박스 선택 오선택 수정 (카메라 뒤 꼭짓점 폭주)**: 확대(줌인) 시 드래그 영역 밖 오브젝트가 같이 선택되던 버그. **원인**: 줌인으로 카메라 **뒤로 넘어간 오브젝트**의 bbox 꼭짓점을 `project()`하면 원근분할 부호 반전으로 스크린 좌표가 ±수만 px로 폭주 → 스크린 AABB가 화면 전체를 덮어 아무 드래그나 다 걸림(사용자 콘솔 로그로 `screenAABB x[-52996~31029]` 확인). **수정**(`EditorCanvas` handlePointerUp + SelectionOverlay): 8꼭짓점을 투영 전에 **카메라 앞 여부(`dot(p−camPos, camDir)>0.05`) 판정** → 모두 앞이면 기존 AABB '닿기 선택'(피그마식 유지), 하나라도 뒤면 AABB 불신 → **중심점이 카메라 앞+드래그 영역 안일 때만** 선택. 미리보기도 동일 게이트. 겸사겸사 드래그 사각형·선택·미리보기의 좌표 소스를 **캔버스 엘리먼트 rect로 통일**(`dragCanvasRectRef`, 드래그 시작 시 1회 캐시 — DPR/배율 대비 정확성). 검증: tsc 클린 + editor 200 + **사용자 콘솔 로그로 원인 확정**.

### 후속 4종 (2026-07-11) — 툴바 정리 + 잠금 UX
- **잠긴 그룹 하위 자물쇠 disabled**: `HierarchyPanel`이 각 행의 조상 체인을 확인(`lockedByAncestor`)해, 잠긴 조상이 있으면 그 행의 자물쇠 토글을 **disabled**(개별 해제 불가, "상위 그룹에서 잠금 해제" 안내). 그룹 잠금 캐스케이드(자손 locked=true)와 짝을 이룸.
- **툴바 Undo/Redo·카메라 북마크 버튼 주석 처리**(`ViewportFloatingToolbar`): 두 블록을 `{/* ... */}`로 감싸 숨김(중첩 라벨 주석 제거 후 래핑). 관련 import·store 값은 복원 편의로 유지(미사용 경고만, noUnusedLocals off라 빌드 무해). 단축키 Ctrl+Z/Y는 유지.
- **도형 추가 = 스플릿 버튼**: `[아이콘][▾]` (아이콘 좌·화살표 우, 다른 드롭다운과 통일). **아이콘=마지막 선택 도형(기본 박스) 즉시 배치**(`beginPlacement`), **화살표=목록 열기**. 목록에서 도형 고르면 `selectedShape` 갱신 + 즉시 배치. `Shapes` 아이콘 import 제거.
- **선택/호버 가이드 외곽선을 실제 bbox 기준으로**(`EditorObjectInstance`): 기존 고정 `1.05³` 단위 박스라 **돌출/로프트/평면 등 한 축이 얇은 형상에서 가이드가 실제보다 크게** 떴음(`normalizeUnit`이 최대 변만 1로 맞춰 나머지 축<1). → `primGeom.boundingBox`로 `guideBox`(size·center) 계산해 여백 ×1.04로 감싸게 수정. box/구체는 bbox=1이라 무변화. **브라우저 확인 완료(펜툴 돌출 가이드 정상)**. (물리 켠 오브젝트의 `ColliderOverlay` 고정 박스는 별개 이슈로 미수정 — 돌출 런타임 콜라이더는 trimesh.)
- 검증: tsc 클린 + editor 200 + ✓ Compiled.

## 최근 완료 (2026-07-10) — 경계 벽 2차 + move_object 그룹 플레이 모드

### 경계 벽 2차 (원형 제외 — 그라데이션·one-sided·면별 텍스처·스카이박스)
`BoundaryWalls.tsx` 재작성 + 스키마 확장. **하위호환**: 기존 color/texture 벽은 그대로.
- **스키마(`scene.ts` `boundaryWall`)**: `style`에 `'skybox'` 추가 + `gradient?`·`oneSided?`·`faceTextures?{front/back/left/right}`·`skyboxUrl?`.
- **그라데이션**: 위→아래 알파 페이드. **셰이더 수정 없이** planeGeometry 정점에 vertexColors 알파(위 정점 a=0, 아래 a=1, quad 보간) — three 0.185 vertex-alpha 지원 이용(안전). 지평선처럼 벽 윗부분이 사라짐.
- **one-sided**: 중심을 향한 면만 보이게 `FrontSide`(밖에선 투명). **에디터는 편집 편의로 항상 양면(DoubleSide)**, 뷰어에서만 적용. 천장은 항상 양면(아래서 보이게).
- **면별 텍스처**: texture 스타일에서 앞/뒤/왼/오 각 면에 개별 이미지(미지정 면은 기본 textureUrl 폴백). 벽별 벽화/창문 등.
- **스카이박스**: 4면 벽 대신 360° equirect 파노라마를 큰 구(BackSide, `meshBasicMaterial toneMapped=false`)로 씬을 감쌈. 반경=max(경계)×2.2+20.
- **렌더 안전화**: 기존 drei `useTexture`(Suspense)를 **비-Suspense `TextureLoader`**로 교체(PrimitiveMaterial 패턴) — 인라인 mesh에 Suspense 경계 불필요.
- **에디터 UI**(Environment→Boundary): 스타일에 '스카이박스' 추가 + 면별 텍스처 2×2 슬롯(업로드/교체/제거) + 스카이박스 업로드 + 그라데이션·안쪽만 토글. 공용 업로더 `uploadBoundaryImage` + 단일 파일입력 target 라우팅(`bwUploadTarget`).
- **검증**: tsc 클린 + dev 컴파일(editor 200). **실동작 브라우저 확인 필요**(그라데이션 페이드·one-sided 밖에서 투명·면별 이미지·스카이박스 파노라마). 남음: 원형/커스텀 모양(콜라이더도 원형 대응 필요).

### move_object 그룹 플레이 모드
그룹을 move_object로 옮기면 시각만 미끄러지고 콜라이더는 원자리에 남던(유령 콜라이더) 문제 해결. **먼저 '이미 되어있나' 꼼꼼히 확인 → 미구현 확정 후 착수.**
- **원인**: `GroupWithCollision`은 자식 콜라이더가 부모 `<group>` 이동을 안 따라감(fixed 바디는 부모 월드행렬을 매 프레임 재샘플 안 함).
- **해결**: `ViewerClient`가 `movedIds`(=posOverride 대상 id 집합) 생성 → `ViewerCanvas`→`PlayCanvas` 배선(passableIds와 동일 패턴). PlayCanvas가 옮겨지는(모션 없는) 그룹을 **`MovedGroupCollider`**(신규)로 라우팅 = `kinematicPosition` + `colliders="hull"` 강체를 매 프레임 `setNextKinematicTranslation(object.position)`으로 구동(effectiveScene이 posOverride로 위치 갱신). 그룹 라우팅 필터(`groupObjects`/`movingGroups`)에서 movedGroups 제외(이중 렌더/시각전용 누락 방지).
- **단일 오브젝트**는 기존대로 정상(fixed 바디 position prop → setTranslation) — 무변경.
- **검증**: tsc 클린 + dev 컴파일. **실동작 브라우저 확인 필요**(플레이 모드에서 그룹 move_object 시 캐릭터가 옮겨진 그룹에 실제로 막히는지, [[project_e2e_play_mode_testing]] 방식 권장). 제약: hull 근사·라이딩 미구현.

## 최근 완료 (2026-07-10) — AssetBrowser Materials·HDR 탭 (WIP 해제)

마지막 두 WIP 탭 구현 → **AssetBrowser 4개 탭(Materials/Textures/HDR/Audio) 전부 완료.** 둘 다 `AssetBrowser.tsx` 단독 변경(스키마·렌더 경로 무변경 — 기존 필드 재사용).

- **Materials 탭**: 재질 프리셋 8종(기본·무광·유광·플라스틱·금속·크롬·고무·네온발광) 그리드. 클릭 → **선택한 프리미티브(들)의 `MaterialOverride` 질감(roughness/metalness/emissive)만 교체, 색·텍스처는 유지**. 대상 필터는 텍스처 탭과 동일(`o.primitiveShape && !o.content`, GLB 제외). 네온(`emissive:'SELF'`)은 오브젝트 현재 색으로 자체 발광(emissive≠검정이면 렌더가 자동 glow). `applyMaterialToSelection` + `pushHistory` 1회 undo + 토스트. 프리셋 값은 EditorObjectInstance 기본값(rough 0.5·metal 0.1·emissive #000)에 맞춤 → '기본' 프리셋이 곧 리셋.
- **HDR 탭**: 환경 프리셋 타일 11개(끄기 + Sunset/Dawn/Night/Forest/Park/City/Factory/Indoor/Lobby/Studio, 무드 그라데이션 스와치+이모지). 클릭 → `environment.hdrPreset` 설정(`applyHdr`), 현재 선택 타일 하이라이트(ring+✓). Environment 패널의 기존 HDR 드롭다운과 **동일 값**을 브라우저블 그리드로 노출(중복 아님, 발견성↑). 'none'=단색/하늘 배경 복귀.
- 정리: `TABS`에서 materials/hdr의 `wip` 플래그 제거, 미사용 `currentTab`·wip placeholder 블록 삭제.
- **검증**: tsc 클린 + dev 컴파일(editor 200, 인증 세션, `✓ Compiled`). **실동작 브라우저 확인 필요**(재질 프리셋이 선택 프리미티브에 적용·색 유지·네온 발광, HDR 타일 클릭 시 배경/반사 전환·활성 표시).

## 최근 완료 (2026-07-10) — 조명 L2 (c) 라이트 색(warm/cool)

L2의 마지막 미착수 항목. 환경 조명(태양·환경광)에 색이 없어(흰색 고정) 노을/밤 같은 색감 무드가 안 나오던 것 → **씬 전역 태양·환경광 색조** 추가. **L2 전 항목 완료.**

- **스키마(`scene.ts`)**: `EnvSchema.lights`에 `directionalColor?`(태양)·`ambientColor?`(환경광) 추가. **둘 다 optional — 미설정 = 흰색('#ffffff'), 기존 씬 100% 하위호환**(기존 published 씬 룩 무변).
- **렌더**: `ViewerCanvas`·`EditorCanvas`의 `directionalLight`/`ambientLight`에 `color={... ?? '#ffffff'}` 배선(뷰어·에디터 동일 룩). `hemisphereLight`는 fill용이라 무변.
- **에디터 UI**: Environment→Lights 섹션 Sun Position 아래 **Sun Color / Ambient Color** 2컬럼 컬러픽커(fog color와 동일 패턴 — swatch+hex, `onBlur`=pushHistory 1회 undo).
- **무드 프리셋 색조화**: `MOOD_PRESETS`에 색 주입 — 노을=따뜻한 주황(`#ff9d5c`), 밤=차가운 블루(`#9db4e8`+ambient `#4a5a80`), 아침=옅은 웜, 한낮/스튜디오/기본=흰색(리셋 시 색 해제). "진짜 색감 무드" 완성.
- **검증**: tsc 클린 + dev 컴파일(editor·space 200, 인증 세션). **실동작 브라우저 확인 필요**(무드 프리셋 색감·컬러픽커·리셋).

## 최근 완료 (2026-07-10) — 제작 도구 확장 (Export / Cloner / 펜 툴)

인앱 모델링 스코프 완료 후 사용자 신뢰 하에 우선순위대로 4종 추가 구현. **신규 lib 2개**(`exportGlb.ts`·`cloner.ts`), 신규 패널(`PenToolModal.tsx`).

- **①.glb Export**: `src/lib/exportGlb.ts` `exportObjectsToGlb(objects3d, fileName)` — 라이브 Three 객체를 그룹으로 복제 → `GLTFExporter`(binary) → 브라우저 다운로드. 스토어 `requestExport`/`exportRequest`(요청-틱 패턴)로 `EditorCanvas` useEffect 핸들러가 현재 선택/전체를 굽는다. 만든 씬을 .glb로 반출.
- **②Radial cloner / ③Live parametric cloner (`src/lib/cloner.ts`)**: `DEFAULT_CLONER`·`clonerPlacement(cfg, i)`(linear/radial)·`regenerateCloner(objects, clonerGroupId, cfg)`(clonerClone 자식 제거→소스를 placement(0)로→i=1..count-1 클론 재생성, 그룹은 idMap 서브트리 복제). 스토어 `makeCloner(config?)`·`updateCloner`(파라미터 바꾸면 라이브 재생성)·`arraySelected(count, offset, radial?)`. **Array(1회 복제) vs 라이브 클로너(파라미터 유지·재생성) 구분** — 버튼 라벨 '한 번 복제'/'라이브 클로너'. `ObjectNodeSchema.clonerConfig`/`clonerClone` 태그.
- **④Extrude/Lathe 펜 툴 (`PenToolModal.tsx` + `primitiveGeometry.ts`)**: 2D로 그려 3D 생성. **돌출(Extrude)**=단면 폐곡선을 두께로 밀어 기둥, **회전체(Lathe)**=축 오른쪽 반쪽 프로파일을 360° 회전(도자기/컵). 스토어 `addProfileObject(shape, profile, extrudeDepth, closed)` → `PrimitiveShape 'extrude'|'lathe'` + `PrimitiveGeom.profile/profileClosed/extrudeDepth`. 팩토리 `makeExtrude`/`makeLathe`. 기능: 첫 점 클릭으로 닫기(포토샵식)·격자 스냅(중앙축 기준)·Catmull-Rom 스무딩·다중 점 드래그 이동·Ctrl+Z 점 취소·Delete 선택점 삭제. 툴바 ✏ + 커맨드팔레트 '펜 툴'로 오픈(`setPenToolOpen`).
  - **펜 툴 팝업 UX (2026-07-10)**: **헤더 드래그로 이동 + 뒤 overlay 제거**(씬 보며 작업 — 에디터 작업 팝업만 해당, 확인/공유 모달은 overlay 유지). 드래그 중에만 뜨는 투명 캡처 레이어로 마우스 추적, ✕/Esc로만 닫힘(바깥 클릭 닫기 없음). **돌출↔회전체 탭 전환 시 전체 지우기**(`switchMode` — 두 모드 그리기 방식이 달라 이전 점 이어그리기 방지).
- **검증**: tsc 클린. **브라우저 실동작 확인 완료(사용자 — 펜 툴 그리기·닫기·탭전환·스냅·다중드래그·팝업 드래그 이동 정상)**. Export/Cloner 실동작은 사용자 확인 완료 표기.

## 최근 완료 (2026-07-10) — 카메라 초기 뷰 + Inspector 수치 실시간 반영

- **초기 진입 시 자동 전체 맞춤 (에디터 + 탐색 뷰어)**: 넓은 공간을 저장 후 대시보드로 재진입하면 초기 뷰가 너무 가깝던 문제 → **들어오자마자 Shift+F(전체 맞춤) 뷰로 시작**. Shift+F(=`requestFocusAll`, 전체 맞춤)는 무변경.
  - **에디터**(`EditorCanvas`의 신규 in-Canvas `InitialFit`): `useFrame` 1회, `orbitRef` 준비될 때까지 대기 후 fit. **`sceneStore.sceneLoadTick`(loadScene마다 증가)에 묶어 '로드 시점'에만** 실행 → 새 빈 씬에서 첫 오브젝트 추가 시 카메라 튐 방지, 씬 전환 시 재-fit, 편집·저장 중엔 재-fit 안 함. **주의**: 처음엔 EditorCanvas '바깥' useEffect로 넣었더니 `orbitRef`가 `<Canvas>` 내부(R3F 별도 렌더러)에서 붙어 마운트 시 null → 안 걸림. **fit은 반드시 Canvas 내부 컴포넌트에서** 할 것.
  - **탐색 뷰어**(`ViewerCanvas`의 신규 `InitialFit`): 동일하게 `useFrame` 1회 one-shot(탐색 모드만). 기준은 에디터와 동일(루트 오브젝트 position bbox 중심 + 3/4 각도).
  - 한계: **position 기반 프레이밍**(Shift+F와 동일) — 원점에 큰 GLB 하나만 있는 씬은 다소 가까울 수 있음(focus-all을 실제 bbox 크기 기준으로 바꾸면 둘 다 개선, 후속).
- **Inspector 트랜스폼 수치 실시간 반영 (기즈모 드래그 중)**: 기존엔 기즈모가 드래그 중 Three 객체 ref만 조작하고 마우스업에 `commitTransforms` 1회만 커밋 → Inspector 수치가 놓을 때만 갱신되던 것 → **드래그 중 실시간 갱신**. **성능 격리가 핵심**: 매 프레임 `objects[]`를 갱신하면 전체 캔버스가 리렌더되므로(알려진 이슈), **메인 스토어와 분리된 라이브 채널**을 둠.
  - **`src/store/liveTransformStore.ts`(신규)**: `live: {id, position, rotation(deg), scale} | null` + `setLive`. 기즈모는 **구독 없이** `getState().setLive(...)`로 게시(기즈모 리렌더 X), Inspector의 Transform 입력부만 구독(그 서브트리만 리렌더). transient(저장 무관).
  - **`GizmoController`(SingleGizmo)**: `onChange`에서 매 프레임 게시(회전 deg 변환·y바닥 클램프 반영), `onMouseUp`에서 `setLive(null)` + 기존 `commitTransforms` 확정.
  - **`InspectorPanel`의 `LiveTransformRows`(신규 내부 컴포넌트)**: 라이브 채널 구독(`live.id===obj.id`면 라이브 값, 아니면 `obj` 값). `NumInput`이 focus 아닐 때 prop 변화를 반영하므로 그대로 동작. 다중 선택 패널엔 트랜스폼 수치가 없어 SingleGizmo만 대상(완전).
  - **재사용 규칙**: `liveTransformStore`가 표준 채널 — 앞으로 새 '직접 조작' 도구는 `setLive` 게시만 하면 관련 수치 표시부가 자동 실시간 반영. (사용자 지시: 수치 입력부는 이 패턴 적용)
  - 제약: 캐릭터 스폰 포인트 기즈모는 라이브 미게시(별도 `env` 값) → 스폰 좌표는 여전히 마우스업에 갱신(필요 시 동일 패턴 확장).
- **검증**: tsc 클린 + dev 컴파일 정상. **초기 진입 뷰(에디터/탐색)·실시간 Inspector 모두 브라우저 실동작 확인 완료(사용자).**

## 최근 완료 (2026-07-10) — 텍스처 매핑 (프리미티브 표면 이미지) + Textures 에셋

사용자 아이디어 목록 대조 결과 미구현이던 "텍스처 업로드 & 이미지 매핑" 구현(복셀은 미착수로 남김). 프리미티브 표면에 이미지(포스터/사진/로고)를 입힌다.

- **스키마(`scene.ts`)**: `MaterialOverride`에 `textureUrl?`·`textureRepeat?: {x,y}` 추가. `AssetRefSchema.type`에 `'texture'` 추가.
- **공용 렌더 `src/components/three/PrimitiveMaterial.tsx`(신규)**: 색상+선택적 `map`. `TextureLoader` **비동기 로드(비-Suspense)** → 인라인 mesh에 Suspense 경계 없이 안전. `wrapS/wrapT=RepeatWrapping`+`repeat(x,y)`, `SRGBColorSpace`. **텍스처 있으면 베이스 색을 흰색으로**(재질 색에 안 물들고 이미지 원본대로). key로 텍스처 유무 전환 시 재질 remount(셰이더 재컴파일 이슈 회피). 에디터(`EditorObjectInstance`)·뷰어(`ViewerObject`) 둘 다 이걸로 교체.
- **인스턴싱 제외**: 텍스처 있는 프리미티브는 단일 재질 배칭 불가라 `getInstancedIds`·`InstancedPrimitives` 두 곳에서 제외 → 개별 렌더(텍스처 유지).
- **에셋 DB 등록 승격 `uploadImageTexture(file, projectId)`(`uploadAsset.ts`)**: GLB·오디오와 동일 패턴 — Storage(`textures/{pid}/`) + `assets` DB행(type `'texture'`, 썸네일=이미지 자체). 기존 ground/boundary처럼 "URL만 쓰고 버리는" 방식이 아니라 **라이브러리에서 재사용 가능 + 삭제로 정리 대상 추적**.
- **AssetBrowser Textures 탭**(WIP 해제): 썸네일 그리드(`TextureCard`) + 업로드 + **클릭→선택한 프리미티브(들)에 적용**(`applyTextureToSelection`) + 삭제. `modelAssets` 필터에서 texture 제외.
- **Inspector Material 텍스처 UI**: "Texture (이미지)" 라벨 옆 **Toggle 스위치**(켜면 영역 표시, 텍스처 있으면 자동 ON, 끄면 해제) + **`TexturePicker`(신규 `src/components/ui/TexturePicker.tsx`)** — SelectBox 형태(트리거+`useDropdown`)이되 드롭다운이 **3열 썸네일 그리드 + 맨 아래 넓은 업로드 버튼**. 적용 시 미리보기 + 타일 반복(가로/세로) 컨트롤. 공용 `SelectBox`는 텍스트 전용/앱 전역 사용이라 텍스처 전용으로 분리(위치·닫기 로직은 useDropdown 공유).
  - 텍스처 넣는 경로 3가지: ①Material 스위치→픽커 ②픽커 하단 업로드 ③Textures 탭 선택→적용. 업로드는 전부 `uploadImageTexture`로 assets>texture 등록.
- **검증**: tsc 클린 + dev 컴파일 정상. **브라우저 실동작 확인 완료(사용자 — 매핑·타일반복·Textures 탭·스위치·썸네일 픽커 정상).**
- **알려진 제약**: 프리미티브만(GLB 자체 재질·텍스트 콘텐츠 제외) · 면별 텍스처 아님(도형 전체 UV) · 라이브러리에서 텍스처 삭제해도 적용된 오브젝트의 `material.textureUrl`은 자동 정리 안 됨(로드 실패 시 색상으로 graceful 폴백, 참조 GC는 후속) · 에셋은 씬 단위(scene_data.assets[], 다른 씬과 공유 X — 모델·오디오와 동일).

## 최근 완료 (2026-07-10) — 복셀(Voxel) 방식 (마인크래프트식 큐브 쌓기)

사용자 아이디어 목록 중 마지막 미구현이던 복셀 구현. 펜 툴/Merge와 **동일 파이프라인**(모달 → GLB로 bake → 에셋 등록 → 배치)이라 뷰어/임베드/물리/인스턴싱 코드 무변경으로 렌더된다. **인앱 모델링(프리미티브·펜·클로너·익스포트·텍스처·복셀) 스코프 전부 완료.**

- **스토어**: `voxelToolOpen`/`setVoxelToolOpen`(penToolOpen 미러).
- **bake 로직 `src/lib/voxelModel.ts`(신규)**: `buildVoxelGlb(voxels)` — 각 복셀=1×1×1 BoxGeometry, **정점 색(vertex color)으로 단일 메쉬에 병합**(`mergeGeometries`)해 드로우콜/파일 최소화. sRGB→linear 변환(정점색은 선형). X/Z 중심 정렬 + 바닥(min.y) 0에 앉힘 → GLTFExporter binary. `MeshStandardMaterial{vertexColors:true}`.
- **에디터 `src/app/editor/[projectId]/panels/VoxelToolModal.tsx`(신규)**: 펜 툴과 동일한 **드래그 이동 + no-overlay** 작업 팝업.
  - **2D 그리드 페인터**(SVG) — **좌클릭 칠하기 / 우클릭 지우기**(드래그 지원, `paintMode` ref로 드래그 중 일관), 컨텍스트메뉴 차단.
  - **색상**: 컬러픽커 + **프리셋 SelectBox**(각 옵션에 색 스와치 아이콘). **그리드 크기 SelectBox**(8/16/24/32, 픽셀 고정 340이라 칸수↑=칸작아짐, 줄이면 범위 밖 복셀 제거).
  - **높이(Y) 레이어** ±로 쌓기. **쌓기 도우미**: 바로 아래층=보라 점선 외곽선, 더 아래층=옅은 발자국, **「아래 복사」**(아래층을 현재층에 복사=기둥·벽), 3D에 **현재 편집 층 반투명 판**.
  - **실시간 3D 미리보기**(R3F Canvas + OrbitControls, **무한 그리드**, 그리드 중심 고정) — 쌓이는 모습 즉시 확인.
  - **전체 지우기 = 완전 초기화**(복셀 + 높이 0). 그리드 선은 배경 대비 `currentColor`(전경색) 기반.
  - **만들기** → `buildVoxelGlb` → `uploadGlbBlob`(model) → `addAsset`+`addAssetObject`(바닥 스냅 배치) → persist.
- **진입점**: 툴바 🧊(펜툴 ✏ 옆) + 커맨드팔레트 '복셀 (큐브 쌓아 만들기)'.
- **검증**: tsc 클린 + dev 컴파일 정상. **브라우저 실동작 확인 완료(사용자 — 칠/지우기·색·크기·쌓기 도우미·미리보기 정상).**
- **알려진 제약/후속**: 편집이 **레이어별 2D 페인팅**(3D 면 클릭 배치 아님) · 내부 면 컬링 없음(vertex color 단일 메쉬라 실사용 크기엔 무난) · 색만(텍스처 스킨은 후속) · 그리드 크기 변경 시 3D 카메라는 마운트 시점 값 유지(재프레이밍은 orbit으로).

## ✅ 브라우저 실동작 확인 완료 (2026-07-10, 사용자 일괄 검증)

아래 항목 전부 브라우저 실동작 확인됨 — 개별 항목 본문의 "브라우저 확인 필요" 표기는 이 확인으로 해소:
- **Prefab MVP** (만들기·배치·override·Apply·Revert·삭제)
- **인앱 모델링** (각뿔대·둥근 박스·Merge·Boolean·Loft)
- **경계 벽**(Boundary Walls) · **프로젝트 복제** · **임베드 E2E**
- (앞서 확인된) 그룹/변환/undo 버그 4종 · 그룹 스코프 · 기즈모 피벗 통일 · 모션 spin wobble(피벗 보정)

## 최근 완료 (2026-07-09) — Prefab MVP (원본↔인스턴스 동기화)

- **설계 합의**: (사용자 결정) **씬 단위 저장**(scene_data.prefabs[], DB 마이그레이션 없음·후속에 프로젝트 단위 승격 가능) + **필드그룹 단위 override**(material/events/motion/physics/transform/… 그룹별 override·revert).
- **핵심 아키텍처 — "인스턴스는 진짜 오브젝트로 굽는다(bake)"**: 인스턴스는 실제 `ObjectNodeSchema` 오브젝트들로 `objects[]`에 존재하고 프리팹 링크 태그(`prefabId`/`prefabInstanceId`/`prefabNodeKey`/`prefabOverrides`)만 붙는다 → **뷰어/임베드/물리 코드 무변경**(평범한 오브젝트로 렌더). 동기화·override는 전부 **에디터 전용 연산**. 그룹(Group)과의 차이 = 원본-사본 연결(동기화)+재사용 레이어.
- **스키마(`src/types/scene.ts`)**: `PrefabSchema`(id/name/rootKey/nodes[])·`PrefabNode`(nodeKey/parentKey/data — 절대 id/parentId 대신 안정적 key로 트리)·`PrefabNodeData`(Omit)·`PrefabOverrideGroup`(11종). `ObjectNodeSchema`에 프리팹 태그 4종(전부 옵셔널=하위호환). `ProjectSceneSchema.prefabs?[]` + `normalizeSceneData` 처리. `saveScene.ts`도 prefabs 직렬화.
- **순수 로직(`src/lib/prefab.ts`)**: `buildPrefab`(선택 루트+자손→정의+태그)·`instantiate`(정의→bake 오브젝트, id 리맵)·`mergeDefIntoNode`(override·루트 transform 존중 병합)·`syncInstances`(전 인스턴스 재동기화 — 구조 add/remove 포함)·`rebuildPrefabFromInstance`(Apply — 루트 배치 transform은 def에 안 밀어넣음)·`overrideGroupsFromPatch`(필드→그룹).
- **스토어(`sceneStore.ts`)**: state `prefabs[]` + 액션 `createPrefab`/`instantiatePrefab`/`applyInstanceToPrefab`/`revertInstance(group?)`/`deletePrefab`/`renamePrefab`. **override 자동 기록**: `updateObject`가 인스턴스 노드 편집 시 바뀐 필드의 그룹을 `prefabOverrides`에 누적(루트 transform은 항상 인스턴스 소유라 제외). **undo/redo에 prefabs 스냅샷**(HistoryEntry.prefabs? — 프리팹 액션만 채움, 비프리팹 액션은 미변경 유지).
- **override/동기화 규칙**: 루트 position/rotation/scale = **항상 인스턴스 소유(동기화 안 함)**. 그 외(자식 transform·material·events·motion·physics·content·light·particle·name·visibility·dialogue) = 원본 따름, **인스턴스에서 건드린 필드그룹만 원본 이탈**. 구조(자식 추가/삭제)는 원본이 소유(sync가 인스턴스에 맞춤). **Apply**=인스턴스 상태→정의(루트 배치 제외)→다른 인스턴스 재동기화(각자 override 보존)+소스 override 클리어. **Revert**=override 버리고 원본 재당김(그룹 지정 시 그 그룹만). **Delete**=정의만 삭제, 인스턴스는 태그 벗고 독립 오브젝트로 유지.
- **UI(`InspectorPanel.tsx`)**: (1) 단일 오브젝트 Inspector 상단 **Prefab 섹션** — 비인스턴스 루트엔 '프리팹으로 만들기', 인스턴스엔 원본명·인스턴스 수·override 배지(클릭=그 그룹만 revert)·'원본에 반영(Apply)'·'원본으로 되돌리기(Revert all)'. (2) 빈 선택(Environment) 패널에 **Prefab 라이브러리** — 정의 목록·인스턴스 수·'배치(instantiate)'·삭제.
- **검증**: **tsc 클린** + **순수 로직 시나리오 테스트 15/15 통과**(build→instantiate→자식 override→def 수정 sync[override 인스턴스는 값 유지·나머지는 따라감]→루트 배치 유지→Apply→구조 노드 추가 전파, `tsx` 임시 스크립트) + **에디터 라우트 200(라이브 인증 세션 컴파일 정상)**. **에디터 실클릭(만들기→배치→override→Apply/Revert) 브라우저 확인 필요**.
- **MVP 범위/제약(후속)**: 씬 단위(다른 씬 재사용 X — 프로젝트 단위 승격은 후속) · 프리팹 썸네일 미생성 · 인스턴스에서의 **구조 편집(자식 추가/삭제)은 미보존**(sync가 정의 구조로 맞춤) · 라이브러리 배치는 원점(드래그 배치·바닥 스냅 연동 후속) · Apply는 선택 인스턴스 1개 기준 · 중첩 프리팹(프리팹 안 프리팹) 미검증.

## 최근 완료 (2026-07-08~09) — 에디터 카메라 손질 (모두 `EditorCanvas` `OrbitControls`/Canvas)
- **초기 카메라 더 멀리**: Canvas `camera.position` `[5,4,8]`(원점 거리 ~10) → `[9,7,13]`(~17.3)로 뒤로 빼 씬 전체가 보이게.
- **휠 줌: 스텝↑ + '확대 안 먹던' 버그 수정**: (1) `zoomSpeed={2}` 추가(기본 1이라 많이 굴려야 했음). (2) **진짜 원인** — `onChange`가 `ctrl.object.position.y < 0.3`을 직접 클램프해, 카메라를 낮은 각도로 내리면 휠 dolly가 대상 쪽으로 당길 때 이 클램프가 카메라를 도로 위로 밀어 **줌을 상쇄**(카메라 움직인 뒤 휠 막 굴려도 확대 안 되던 증상)했음 → position.y 직접 클램프 **제거**(target.y≥0 + `maxPolarAngle`<90°(0.02→0.08) 조합이면 카메라는 항상 바닥 위라 불필요).
- **관성(damping) 제거**: `enableDamping={false}` — drei 기본값이 켜져 있어 드래그 놓아도 스르륵 미끄러지던 것 → 손 떼면 즉시 멈춤.
  - **플레이 모드 카메라도 관성 제거 (2026-07-09)**: `PlayModeController` 팔로우 카메라가 `camera.position.lerp(_camPos, 0.1)`이라 드래그로 방위(azimuth)는 즉시 바뀌는데 카메라 위치는 프레임당 10%씩만 따라가 **회전 시 미끄러지고 손 떼도 스르륵 이동**하던 것 → `camera.position.copy(_camPos)`로 궤도 지점에 즉시 스냅. **캐릭터 추적의 부드러움은 `camTarget.lerp(_targetPos, 0.12)`가 담당**하므로 팔로우 자체는 여전히 부드러움(회전 관성만 제거). 포커스(줌) 분기의 lerp는 의도된 애니메이션이라 무변경. 검증: 1줄 수정. **실동작 브라우저 확인 필요**.
- **우클릭 패닝이 각도를 바꾸던 버그 수정**: `screenSpacePanning={false}` — 기본(화면평면 패닝)일 땐 비스듬한 각도에서 세로 드래그에 월드 Y성분이 섞이고, `onChange`의 `target.y<0` 클램프가 **타겟만 붙잡고 카메라는 안 붙잡아** 각도가 정면으로 눕던 문제 → 바닥평면(XZ) 패닝으로 바꿔 타겟 y 불변 → 각도 안 바뀜(사용자 기대 "우클릭=바닥 이동"과도 일치).
- 검증: 모두 tsc 클린. **에디터 인증 필요 → 브라우저 실동작 확인 대기**.
- **참고(현 마우스 스킴)**: 회전=**Ctrl+좌클릭**, 패닝=우클릭, 선택박스=좌클릭, 줌=휠. (사용자는 ctrl+우클릭=회전으로 기대했음 — 원하면 `mouseButtons`로 추가 가능.)
- **미해결/후속 (2026-07-09 중단, 다음에)**:
  - **확대 시 패닝/줌이 거리비례라 찔끔찔끔** — 근본 해법은 **"선택 오브젝트로 포커스"**(F키/더블클릭 → orbit pivot을 선택물로 이동+프레이밍). 현재 없음. 사용자에게 추가 제안했고 **보류(오늘은 여기까지)**. `cameraViewRequest`(시점 프리셋)·`cameraBookmarks`는 이미 있음 → 이걸 참고해 `focusSelected` 스토어 액션+`EditorCanvas` 핸들러로 구현 예정.
  - 옵션 후보: `zoomToCursor`(커서 쪽으로 줌 — 사용자 설명은 했으나 미적용), ctrl+우클릭 회전 매핑.

## 최근 완료 (2026-07-08) — UX 수정 3건
- **잠긴 오브젝트 클릭 시 선택 해제**: 오브젝트 선택 후 잠긴 오브젝트를 클릭하면 선택이 안 풀리던 문제(잠긴 것은 R3F가 hit 처리 → `onPointerMissed` 미발동, `handleClick`은 `if(locked) return`이라 아무 것도 안 함) → 세 `handleClick`(라이트/프리미티브·콘텐츠/GLB)의 잠금 분기를 `if(object.locked){ if(!shiftKey) selectObject(null); return; }`로 변경 → 잠긴 것 클릭 = 빈 공간 클릭처럼 선택 해제(shift+클릭은 다중선택 유지 위해 무변경). 검증: tsc 클린.
- **Mood '기본' 복귀 버튼**: Mood 프리셋을 한 번 누르면 되돌릴 수 없던 문제 → `MOOD_PRESETS` 맨 앞에 **'기본(↺)'** 추가 — `hdrPreset:'none'`(DefaultEnvironment IBL)·`toneMappingExposure:1`·라이트를 `DEFAULT_ENVIRONMENT` 값으로 되돌림(무드 해제). 기존 프리셋 적용 경로(`updateEnvironment`) 그대로 재사용. 검증: tsc 클린.
- **E 포커스 카메라 정면(수평)화**: 플레이 모드 E 포커스(`focus_object`) 시 카메라가 캐릭터가 보던 상하 틸트를 그대로 유지해 위/아래에서 비스듬히 보이던 문제 → `PlayModeController` 포커스 분기에서 카메라 방향의 **Y성분 제거(수평화)** + 대상 중심과 같은 높이 배치 → 정면·수평 시선. 수평 방위(azimuth·좌우 방향)는 유지(현재 서 있는 쪽에서 정면으로). 탐색 모드 focus(`CameraFocus`)는 무변경. 검증: tsc 클린 + dev `/test/move-object` 200. **실동작 브라우저 확인 필요**(특히 포커스 정면 앵글 느낌).

## 최근 완료 (2026-07-08)

- **상호작용 근접 범위(interactRange) 설정 — 씬 기본값 + 오브젝트별 오버라이드**: 기존 3m 고정(`PlayModeController` 상수)이던 것을 설정 가능하게. **우선순위: 오브젝트값 > 씬 기본값 > 3**. interact(E)·approach·E 프롬프트·하이라이트가 이 범위를 공유. 스키마: `EnvSchema.interactRange?`(씬 기본) + `ObjectNodeSchema.interactRange?`(오브젝트 오버라이드). 배선: `PlayCanvas`가 `effRange(o)=o.interactRange ?? scene.environment.interactRange ?? 3`를 **interactables/approachables 각 항목의 `range`**로 실어 보냄 → `PlayModeController` 근접 루프가 단일 `interactRange` 대신 **항목별 `it.range`**로 판정(interact=자기 범위 내 최근접, approach=자기 범위 경계). 에디터: Environment '**Interaction**' 섹션에 '상호작용 범위 기본값(m)' LabeledNum + Inspector '**Events**' 섹션 상단에 오브젝트별 '상호작용 범위(m)' 입력(비우면 씬 기본, placeholder로 기본값 표시, '기본값' 버튼으로 해제). 검증: tsc 클린. **실동작 브라우저 확인 필요**(범위 줄이면 더 가까이서 E 뜨는지, 오브젝트값이 씬값 오버라이드하는지).
- **플레이 모드 카메라 포커스(줌) + 상호작용 중 이동 잠금**: `focus_object`가 탐색 전용이라 플레이에서 무시되던 것 → **플레이 모드에서도 대상 오브젝트로 카메라 줌**(팔로우 카메라 오버라이드). 용도: E로 작품/NPC에 다가가 **줌 + 팝업/컨텐츠** 표시("살펴보기"). **복귀=팝업 닫기(A안)**: 팝업 닫으면 카메라가 캐릭터 팔로우로 복귀. 배선: `ViewerClient`에 `playFocus`(대상 id) state + `focus_object`가 playMode면 `setPlayFocus`(아니면 기존 `setFocusRequest` 탐색). `ViewerCanvas`가 `objWorldPos`/`objFocusRadius`로 월드좌표+반경 계산해 `focusPoint`를 `PlayCanvas`→`PlayModeController`로 전달 → useFrame이 팔로우 대신 대상 프레이밍(현재 방향 유지·fov 기반 거리, lerp). **이동 잠금(확장형)**: 중앙 상수 `MOVEMENT_LOCKING_ACTIONS`(현재 show_popup·focus_object) — 플레이에서 이 액션 발동 시 `interactionLock` on → `PlayModeController`가 WASD/모바일/점프 입력 무시(중력·낙사는 유지). **`endInteraction()`**(팝업 닫기 버튼·Esc·모드 전환)이 팝업 닫기+포커스 복귀+잠금 해제를 한 번에. 새로 "발동 중 이동 막을 액션"은 상수에 추가만 하면 적용. 제약: 포커스 단독(팝업 없이)일 땐 Esc로만 빠져나옴(온스크린 힌트 미표시 — 후속). area 팝업도 잠금 대상(walk 중 멈춤) — 원치 않으면 상수에서 show_popup 제거. 검증: tsc 클린. **실동작 브라우저 확인 필요**(E→줌+팝업→이동 잠김→닫기→복귀+잠금해제, 탐색 focus 회귀 없음).
  - **포커스 프레이밍 수정(2026-07-08)**: 범위 좁혀(예 1m) 가까이서 포커스 시 카메라가 대상을 벗어나 넘어가던 문제 → 포커스 지점을 오브젝트 **원점(objWorldPos)이 아니라 월드 bbox '중심'**으로(`worldBBox` 사용) + 반경도 실제 bbox 크기 기준. GLB 원점이 발밑/비대칭이라 원점을 프레이밍하면 형상이 프레임 밖으로 밀리던 게 원인. bbox 미로딩 시 기존 원점+근사 반경 폴백. (탐색 모드 focus_object는 아직 원점 기준 — 필요 시 동일 적용)
  - **보완(2026-07-08)**: (1) 잠금 중 **드래그/터치 카메라 회전도 차단**(`PlayModeController` 드래그 핸들러를 `lockedRef`로 게이트) → 팝업/포커스 중 화면 안 돎. (2) 팝업 backdrop이 뒤 캔버스 클릭을 가리고 회전도 막혀 **팝업 안만 상호작용**. (3) **팝업 overlay(배경) 클릭 닫기 제거** → 오직 '닫기' 버튼으로만 닫힘. (4) 포커스 **줌 거리 계수 1.6→2.2**(덜 당김).
- **Events — `approach_enter`/`approach_exit` 트리거(근접 자동 발동)**: 목적 — NPC에 **다가가면 키 없이 자동으로** 모션/사운드 등이 발동(다가감→말풍선(기존 dialogue show=approach)+모션(신규 approach)→E로 선택(기존)의 풀 NPC 흐름 완성). **area와의 차이**: area=센서 콜라이더 **볼륨 진입**(오브젝트 관통 필요·임의 구역), approach=오브젝트 중심 **반경 근접**(interact와 동일 3m·**솔리드 유지 가능**·하이라이트/말풍선과 범위 일치). 둘은 역할 분담(구역 트리거 vs 물체 근접)이라 area는 유지. 배선: 스키마 `EventSchema.trigger`에 2종 추가 → `PlayModeController`에 `approachables`(위치 목록)+`onApproachEnter/Exit` prop + useFrame가 `approachingRef`(Set)로 오브젝트별 반경(interactRange) 경계 교차 감지해 enter/exit 1회씩 콜백 → `PlayCanvas`가 approach_enter/exit 이벤트 가진 루트 오브젝트로 목록 구성·`onObjectClick(obj, trigger)`로 디스패치 → `ViewerClient.handleObjectEvent`가 기존 액션 파이프라인 재사용(모든 액션 지원: play_animation·popup·sound·move·... 자동). 에디터: 트리거 드롭다운 2종 + `TRIGGER_LABELS` + 근접 안내 힌트(솔리드 유지·구역은 area 안내). **플레이 모드 전용·루트 오브젝트만**(interact와 동일 제약). 검증: tsc 클린 + **브라우저 실동작 확인 완료(2026-07-08 — 다가가면 자동 모션 정상)**.
- **interact(E) 트리거에서 자기 `play_animation` 재생 지원**: 문제 — interact 하이라이트는 **3m 근접**(`PlayModeController` interactRange)에서 뜨는데, 애니메이션은 area_enter(**센서 콜라이더 접촉**) 경로로만 걸 수 있어 "E 하이라이트는 뜨는데 애니는 안 돎"는 범위 불일치. 근본 원인: `play_animation`(자기 자신)이 click/hover(`ViewerObject` internalClip)·area(`PhysicsObject` activeClip)에서만 재생되고 **interact 트리거엔 배선이 없었음**(interact는 `handleObjectEvent`로 가는데 거기선 `animate_object`만 클립 처리). → `ViewerClient.handleObjectEvent`에 `play_animation` 분기 추가: `setClipRequests[obj.id]`(→ `ViewerObject` externalClip)로 라우팅해 **모든 트리거(특히 interact/E)에서 자기 클립 재생**. 이제 **interact + play_animation** 하나로 "근접 하이라이트+E프롬프트 → E 누르면 애니메이션"이 같은 상호작용에 묶임(area_enter 우회 불필요). click/hover/area는 기존 경로와 중복되나 같은 클립+React 배치라 무해(단일 재생). 에디터는 트리거 무관하게 play_animation 클립 입력(GlbClipPicker) 노출돼 수정 불필요. 검증: tsc 클린. **실동작 브라우저 확인 필요**(interact+play_animation 걸고 근접→E→재생, area 없이).
- **말풍선 벽 뒤 오클루전**: `SpeechBubble`(drei `Html`)에 `occlude` prop 누락으로 벽 뒤 오브젝트의 말풍선이 depth 무시하고 화면 최상단에 그려지던 것 → `occlude` 추가(씬 전체 레이캐스트). 매 프레임 카메라→말풍선 앵커 레이캐스트해 사이에 메쉬 있으면 `display:none`. GLB·프리미티브·콘텐츠 말풍선 공용 컴포넌트라 한 번에 적용. 방식: 부분 가림 아니라 앵커점 온/오프(딱 끊김). 유의: 낮은 카메라 각도서 자기 몸통에 순간 가려 깜빡일 수 있음(앵커=bbox.max.y+0.25). 검증: tsc 클린 + **브라우저 실동작 확인 완료(2026-07-08)**.
- **GLB 기본 애니메이션 클립(`defaultClip`) — 트리거 없이 자동 재생 (MVP-A)**: 지금까지 GLB 내장 클립은 **이벤트 트리거로만**(click/hover=`play_animation`, area=센서, `animate_object`) 돌았음 → 트리거 없이 **씬 로드 시 자동 루프 재생**할 기본 클립을 오브젝트별로 선택 가능하게. 용도: 돌아가는 선풍기·펄럭이는 깃발·idle 캐릭터. `motion`(트랜스폼 앰비언트)과 별개(GLB 내장 클립). 스키마 `ObjectNodeSchema.defaultClip?: string`. 뷰어 `GlbViewer`에 `defaultClip` prop + 마운트 시 `action.setLoop(LoopRepeat, ∞).fadeIn(0.3).play()` effect(기존 `playClip` effect보다 먼저 — 초기 playClip=null이라 안 끊김). **트리거 클립이 오면** 기존 `playClip` effect가 전 액션 fadeOut 후 트리거 클립 재생 → default가 자연스럽게 덮임. **MVP-A 결정**: 트리거(1회성) 클립 종료 후 idle 복귀는 **없음**(playClip이 null로 리셋 안 되므로). 에디터: Inspector에 **Animation 섹션**(Motion 아래·Events 위, GLB 전용 `!isGroup && assetId`) — 기존 `GlbClipPicker` 재사용(클립 목록 자동 파싱) + '기본 애니메이션 해제' 버튼. 에디터 정적·**뷰어 전용**. 검증: tsc 클린. **실동작 브라우저 확인 필요**(default clip 지정→로드 시 자동 재생, 클릭 트리거로 override).
- **잠긴(locked) 오브젝트 하이라이트/선택 차단**: (1) **호버 하이라이트 차단** — `EditorObjectInstance`의 `hovered` state가 lock을 무시해 잠긴 오브젝트도 마우스 올리면 emissive/와이어박스/box3Helper가 뜨던 것 → `handlePointerOver`에서 `object.locked`면 `setHovered(true)` 무시 + GLB `onHoverChange`도 `h && !object.locked`로 게이트(이 `hovered` state 하나가 프리미티브·콘텐츠·GLB 세 경로 하이라이트를 전부 구동). (2) **잠글 때 선택 해제** — 스토어에 `setObjectLocked(id, locked)` 신설(`updateObject`의 `_prevSnapshot` 패턴 → `pushHistory` 1회 undo), 잠금 시 해당 id를 `selectedIds`/`selectedId`에서 제거 → 선택 하이라이트·기즈모 즉시 분리(`GizmoController`는 이미 `!locked` 게이트라 이중 안전). `HierarchyPanel` 🔒 토글이 이 액션 사용. 클릭 선택은 기존에 `if (object.locked) return`으로 막혀 있었음. 검증: tsc 클린 + **브라우저 실동작 확인 완료(2026-07-08 — 잠긴 것 호버 무반응·잠글 때 선택 즉시 해제 정상)**.
- **Events E3-B — 문/콜라이더 토글(`set_passable`/`set_solid`/`toggle_collision`)**: 플레이 모드에서 대상 오브젝트의 **콜라이더만 런타임 on/off**(시각은 유지) → "E키→문 열림 애니→통과 가능" 시나리오. 스키마 `EventSchema.action`에 3종 추가(value=대상 objectId). 배선: `ViewerClient`에 `passOverride`(objectId→passable) state + 핸들러(set_passable=true / set_solid=false / toggle_collision=반전) → `passableIds` Set을 `ViewerCanvas`→`PlayCanvas`로 전달. `PlayCanvas`가 통과 대상을 **모든 콜라이더 버킷(auto/physics/movingCollider/그룹)에서 제외하고 시각 전용(`passableVisualObjects`/`movingGroups`)으로만 렌더**. **덤으로 hide_object 콜라이더 누수 수정**: `autoObjects`/`physicsObjects`가 `o.visible`을 무시해 숨긴 오브젝트에 '보이지 않는 벽'이 남던 것 → `o.visible` 필터 추가. 그룹 라우팅은 **여집합(`movingGroups = allGroups − movingGroupColliders − groupObjects`)**으로 재작성해 통과+모션+콜라이더 조합에서 렌더 누락 방지. 에디터: 이벤트 Action 드롭다운에 3종 추가(대상 오브젝트 SelectBox + 플레이 전용/콜라이더만 토글 안내). 임베드도 ViewerClient 공유라 자동 지원. 검증: tsc 클린 + **브라우저 실동작 확인 완료(2026-07-08 — E/클릭→콜라이더 제거→통과, toggle 반복 정상)**.
- **배열/반복 툴(Array)**: 선택 오브젝트를 일정 간격으로 N개(원본 포함)까지 복제 — 울타리·기둥·계단 등 반복 배치. `sceneStore.arraySelected(count, offset)`(duplicateSelected의 그룹 재귀 복제 패턴 재사용, `withHistory`로 단일 undo) → 복제 i개(i=1..count-1)를 `position + offset*i`에 추가, 그룹이면 하위 계층 idMap 재매핑. 에디터: Inspector **Array 섹션**(Transform 아래, **기본 접힘**) — 개수(2~100)·간격 XYZ(m)·'배열 생성' 버튼 + 토스트. 모든 오브젝트 타입 지원(그룹 포함). 검증: tsc 클린 + **브라우저 실동작 확인 완료(2026-07-08 — 간격 두고 N개 복제 정상)**.
- **Inspector 단일/그룹 패널 통합**: 그룹이 `if (obj.isGroup) return (...)` **별도 축소 패널**이라 새 기능이 그룹에 자동으로 안 따라오던 **드리프트 문제**(모션이 그룹에 안 뜸/안 돎이 전부 이 뿌리) → **early-return 삭제하고 메인 Inspector 하나로 통합**, 섹션을 오브젝트 타입별 조건부 노출로 처리. 그룹은 `obj.isGroup`로 게이트: 헤더 `Inspector — 그룹`, Transform/Visibility/Motion 노출, **Physics·Events 숨김**(그룹 자체는 충돌/클릭 타깃 아님 — 자식 개별 처리), 하단 '그룹 해제(Ctrl+Shift+G)' 안내. Content/Material/Particle/Light는 기존 조건부(그룹은 자동 숨김). Motion 콜라이더 토글도 그룹 노출(라벨만 그룹용). → 앞으로 새 섹션은 자동으로 그룹에도 일관 적용. 검증: tsc 클린.
- **그룹 자식 콜라이더 개별 라우팅**: `GroupWithCollision`이 그룹 자식을 **무조건 fixed 콜라이더**로만 그려 자식 개별 `motion`/`collider` 설정을 무시하던 버그(정적 그룹인데 이동 장애물로 설정한 자식도 정적 벽이 됨) → 자식도 **루트와 동일 라우팅**: 판정 함수(`isMovingColliderObj`/`isVisualOnlyMotionObj`)를 모듈로 승격해 공유. (1) `MovingCollider`를 **월드 베이스(`worldMatrix` 부모체인 합성) + 스케일 그룹**으로 재작성 → kinematic이 월드 좌표로 구동돼 **정적 그룹의 자식도 이동 장애물**로 동작(루트면 로컬=월드). 라우팅을 루트→`movingColliderObjects`(전 depth, 숨은/움직이는 그룹 조상 제외)로 확장. (2) 정적 그룹 자식 중 **모션+콜라이더OFF → 콜라이더 없이 시각만(통과)**, **이동콜라이더 자식은 상위서 월드 kinematic으로 → GroupWithCollision에선 스킵**(이중 렌더 방지), **중첩 모션 그룹 자식 → 시각 전용 애니**(중첩 그룹 kinematic은 v1 미지원). 검증: tsc 클린 + `/space` 200. **실동작 브라우저 확인 필요**(정적 그룹 안에서 이동콜라이더 자식만 움직이고 정적 자식은 벽, OFF 자식은 통과).

## 최근 완료 (2026-07-07)

- **Events E3-A — `interact` 트리거(다가가 E키)**: 플레이 모드에서 캐릭터가 interact 이벤트를 가진 오브젝트에 **근접(기본 3m)**하면 화면 하단에 **`E` 키캡만** 뜨고(이름 미표시 — 대상은 3D 하이라이트로 구분), **동시에 근접 대상 오브젝트가 하이라이트**(emissive 글로우만 — 플레이 모드는 무-외곽선 규칙 유지라 아웃라인/박스는 안 씀)돼 어디에 E를 눌러야 할지 보임. **E키(모바일=우하단 원형 E 버튼)**로 그 오브젝트의 이벤트 발동(팝업/씬이동/애니메이션 등 기존 액션 파이프라인 재사용). 하이라이트 배선: `InteractHighlightContext`(근접 대상 id)를 R3F 트리에 내려 `ViewerObject`가 자기 자신이면 emissive/아웃라인 on — 호버 하이라이트와 통합(`emissiveOn`/`outlineOn`, 아웃라인은 탐색 모드 호버 전용 — 플레이 모드는 호버·interact 모두 글로우만, 무-외곽선). NPC 대화·간판·아이템·"눌러서 열기"용. **센서 통과는 버그가 아니라 트리거 영역의 정의**임을 확인한 뒤 나온 후속 기능(플랫폼이 "게임적 상호작용"으로 한 걸음). 배선: `PlayModeController` useFrame이 플레이어↔interactable 최근접 산출(대상 변할 때만 콜백) + `KeyE` keydown 발동 → `PlayCanvas`가 interact 이벤트 있는 **루트** 오브젝트 목록 전달·id→obj 매핑 → `ViewerCanvas` 통과 → `ViewerClient`가 프롬프트 HTML·모바일 버튼·`interact` 디스패치·애널리틱스(`interact`) 담당. 에디터는 트리거 드롭다운에 `Interact (E)` + 안내문. **탐색 모드에선 발동 안 함**(캐릭터 없음 — 클릭으로 대체). 검증: tsc 클린 + 인증 세션 `/space`·`/editor` 200 + **브라우저 실동작 확인 완료(2026-07-07 — 근접·E키·하이라이트 정상)**.
  - **E3-A 추가 — 대화 말풍선 시스템(`dialogue`)**: 오브젝트 위에 뜨는 순차 문장. `ObjectNodeSchema.dialogue = { lines[], show:'always'|'approach'|'interact', advance:'auto'|'manual', autoSec?, speaker?, typing? }`. (레거시 `interactLabel`은 `effectiveDialogue`가 `lines:[label]·approach·auto`로 자동 변환.) **표시 시점** 항상/다가가면(3m)/E키로 열기, **넘기기** 자동(타이머 autoSec)/E키, **타이핑(타자기) 효과**, **화자 이름**(말풍선 상단). 상태 머신은 `useObjectDialogue` 훅(오브젝트별 idx/opened/typed) — early return 전에 호출. E키 advance는 `DialogueAdvanceContext`(nonce)로 3D 트리에 전달, **가장 가까운 대상만**(interactActive) 반응. nonce는 `ViewerClient.handleObjectEvent`가 trigger==='interact'일 때 bump(추가 배선 없음 — E는 항상 이 경로). 렌더: GLB는 `GlbViewer`가 bbox.max.y, 프리미티브/콘텐츠(텍스트·이미지)는 `ViewerObject`가 0.5·scale.y 오프셋. 근접 감지 대상(`interactables`)=interact 이벤트 OR 근접 필요 대화(항상+자동 앰비언트는 근접 불필요라 제외). E 프롬프트=interact 이벤트 OR dialogue.show==='interact'. 동시 말풍선은 근접 1개(+항상 표시 오브젝트들). 에디터: Events 섹션 상단 '대화 말풍선'(textarea 한 줄=한 문장 + 표시/넘기기 SelectBox + 간격/화자/타이핑). 검증: tsc 클린 + dev 컴파일/렌더 200 + **브라우저 실동작 확인 완료(2026-07-07 — 표시시점 3종·넘기기 2종·타이핑·화자·E 열기/넘기기 정상)**. (한글 말풍선이 세로로 나오던 버그 = drei Html shrink-to-fit + CJK 줄바꿈 → `width:max-content`+`wordBreak:keep-all`로 수정.) 제약: 루트 오브젝트만·플레이 전용·영상/빈 콘텐츠 미지원·선택지/조건부는 미구현(후속). 고도화 후보(미착수): 대사 종료 시 액션 연결, 선택지(분기), 하단 대화창 모드, 거리 LOD, 1회성 플래그.
  - ~~**남은 E3-B(추후)**: 문(door) = 런타임 콜라이더 on/off 토글~~ **[완료 2026-07-08 — 위 '최근 완료' 참고]**. hide_object 콜라이더 누수도 함께 수정.

- **뷰어 통합(임베드/배포 컨텍스트) 리팩터 (2026-07-07)**: 임베드가 `ViewerClient`의 축소 복제본(`EmbedClient`)이라 E2/E3/대화/interact가 다 빠져있던 문제 → **`ViewerClient`를 컨텍스트 인지형으로 파라미터화**(`variant: 'standalone'|'embed'`, `onBridge`). `EmbedClient`는 이제 `<ViewerClient variant="embed" onBridge={postMessage}/>` **얇은 래퍼**로 축소 → 임베드가 **전체 액션(open_url/popup/go_to_scene/show·hide·toggle/focus/reset_camera/animate/move/sound/play_animation)·대화 말풍선·interact·카메라 포커스 자동 지원**. 컨텍스트 분기: `show_popup`=iframe 안이면 부모 postMessage, 아니면 실제 팝업 렌더 / `emit_event`=iframe일 때만 브릿지(ViewerClient에도 이제 구현) / `go_to_scene`=경로 id 치환(위 참고). chrome=독립은 상단 풀 UI+배지, 임베드는 우상단 미니 토글+워터마크. **중요**: ShareModal이 주는 임베드 코드가 `<iframe src="{origin}/embed/{id}">`라 **third-party 사이트도 이 Next `/embed` 라우트를 씀** → 이 통합으로 실제 임베드 시나리오 해결. 검증: tsc 클린 + `/space` 200(회귀 없음)·`/embed` 정상 컴파일/실행(404는 씬 미게시). **실제 임베드 액션 E2E는 게시된 씬 + `/test/event-bridge`로 사용자 확인 필요**. 커스텀 도메인 서빙 라우팅 실존 여부 점검(→ `proxy.ts:14-24`에 있음. host→`projects.custom_domain` 조회 후 `/space/{default_scene_id}`로 rewrite. **단 경로 무시하고 기본 씬만 서빙** → 커스텀 도메인에서 다중 씬 이동은 별도 개선 필요. localhost는 이 로직 건너뜀 → 실도메인+DNS+배포 필요, 로컬 테스트 불가).
  - **embed.js → iframe 주입기로 전환 (2026-07-07)**: 기존 in-page mount(vite 번들 `EmbedApp`, 3.88MB, 호스트 origin에서 실행 → CSS/JS 충돌·3액션 제한)를 **폐기**하고, `public/embed.js`를 **~3.2KB 바닐라 iframe 주입기**로 교체(YouTube IFrame API 패턴). `<script src=".../embed.js" data-scene data-target?/data-width?/data-height?/data-radius?>` → 격리된 `/embed/{id}?parentOrigin=` iframe을 꽂음 → **통합된 `/embed`(전체 기능) 재사용, 드리프트/격리문제/번들 소멸**. `park3d:event`/`park3d:popup` postMessage를 호스트 `window`의 **CustomEvent로 재전달**(`window.addEventListener('park3d:event', e=>e.detail)`). 삭제: `embed/`(main.tsx·EmbedApp.tsx·vite.config.ts), `package.json`의 `build:embed`. `/embed`는 X-Frame-Options 없음(next.config) → cross-origin iframe 허용 확인. ShareModal 임베드 탭에 **스크립트(권장)/iframe 방식 토글** 추가. 검증: embed.js 3.2KB·CORS·문법 유효, /embed 200. **호스트 페이지 실삽입 E2E는 게시된 씬 필요(사용자)**.

- **프로젝트 복제 (2026-07-07)**: 대시보드 카드 `···` 메뉴 → "📄 복제". `duplicateProject`(dashboard/actions.ts) **완전 독립 복사** — 새 프로젝트(비공개·도메인/slug 없음, 이름 "{원본} (복사본)") + 플랜 한도 검증(초과 시 롤백) + **에셋 스토리지 파일(+\_thumb.png) 새 경로로 `storage.copy` + assets DB행 생성** + **모든 씬 복사**하며 `remapSceneData`로 scene_data의 `projectId`·`sceneId`·`assets[].id/dracoUrl/thumbnailUrl`·`objects[].assetId`·`go_to_scene` 값(씬 id)을 **새 id로 리맵** → 원본 삭제해도 복사본 독립. default_scene_id·thumbnail_url·description·meta 승계. UI: 복제 중 카드 오버레이("복제 중…"). 검증: tsc + dashboard 컴파일 200. **실제 복제 동작(스토리지 copy·리맵)은 사용자 브라우저 확인 필요**.

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

- ~~**오브젝트 앰비언트 애니메이션(`motion`)**~~ **[완료 2026-07-08 — MVP + 후속]**: `MotionConfig`(type=float/spin/pulse/orbit/wander, speed/amplitude/radius/**axis**/**collider**). 모션 수식은 **공용 `src/lib/motion.ts`**(`computeMotion` — 시각과 콜라이더가 동일 로직 공유). **시각**: `ViewerObject`의 `MotionGroup`(베이스 pos/rot/scl + 타입별 델타를 useFrame로, 콘텐츠는 로컬 원점이라 spin/pulse가 오브젝트 중심 피벗) + `Xform` 래퍼로 **GLB·프리미티브·콘텐츠(text/image/video)·그룹 전부** 배선(YouTube만 정적). 에디터 정적·**뷰어 전용**. **후속 완료**: (1) **spin 축 선택**(x/y/z, 기본 y), (2) **콘텐츠/그룹 지원**, (3) **콜라이더 동반**(`collider:true` → `PlayCanvas`의 `MovingCollider` = kinematicPosition RigidBody가 computeMotion으로 매 프레임 `setNextKinematicTranslation/Rotation` → **플레이 모드에서 진짜 이동 장애물**. auto/physics 필터에서 제외, pulse는 런타임 콜라이더 스케일 불가라 제외). 에디터 UI: 일반 오브젝트 Motion 섹션 게이트를 `!obj.light`로 열어 **GLB·프리미티브·콘텐츠 모두 노출**, **그룹은 전용 Inspector(별도 early-return 패널)에 Motion 블록 추가**. 라이트만 제외. **그룹 모션은 플레이 모드도 지원**: 플레이 렌더가 모드별로 갈라져 있어(`GroupWithCollision`은 정적) 그룹 모션이 안 돌던 것 → PlayCanvas에서 그룹을 3분기(모션없음=`GroupWithCollision` / 모션+콜라이더OFF=`ViewerObject` 시각전용 / 모션+콜라이더ON=**`MovingGroupCollider`** = 그룹 전체를 하나의 kinematicPosition 강체로 묶어 `colliders="hull"` 자식 복합 콜라이더가 함께 이동하는 **진짜 이동 장애물**). 그룹도 콜라이더 토글 노출(pulse 제외). 한계: 자식 형상이 볼록 껍질(hull)로 근사(오목 형상 두꺼워짐)·비균일 스케일 그룹은 콜라이더 왜곡 가능·캐릭터 라이딩 미구현. **콜라이더 OFF = 통과(장식) 규칙 통일**: 위치가 움직이는 모션(float/spin/orbit/wander)+콜라이더OFF 오브젝트는 **콜라이더 미부여(통과)** — 예전엔 autoObjects로 가서 시각은 떠다니는데 벽만 원래 자리에 남는 '유령 콜라이더' 버그였음. 단일=`visualMotionObjects`(ViewerObject 시각전용), 그룹=`movingGroups`. pulse는 제자리라 정적 콜라이더 유지(autoObjects). 한계: 콜라이더 동반 시 캐릭터가 **위에 올라타 실려가진 않음**(rapier kinematic 라이딩 미구현). wander=랜덤 목표점 easing 로밍. 검증: tsc 클린 + 에디터·뷰어 200 + **"잘움직이네" 사용자 확인(MVP)**. **콜라이더 동반·콘텐츠/그룹·spin축 실동작 브라우저 확인 필요**.
- **맵 제작 도구**: ~~(a) 추가 시 자동 바닥 스냅~~ **[완료 2026-07-07]** ~~(b) 배열/반복 툴~~ **[완료 2026-07-08 — Inspector Array 섹션]**. ※Ctrl+D 복제는 크기 정확 복사됨. 후속 후보: 그리드(2D)/원형 배열, 회전 증분.
- ~~**Inspector 툴팁**~~ **[완료 2026-07-07]**: `InfoHint`(ⓘ, lucide `Info`) 공통 컴포넌트 + `Tooltip`에 `wide` 옵션(줄바꿈/최대폭) 추가. `SectionHeader`에 `hint` prop → Transform/Visibility/Physics/Events/Content/Light/Particle/Boundary/Interaction/Ground/Player/Lights 등에 안내문. (필요 시 필드 단위 툴팁·나머지 섹션 추가 가능)
- ~~**Events E3-B(문/콜라이더 토글)**: `set_passable`/`toggle_collision` + hide_object 시 루트 콜라이더 제거~~ **[완료 2026-07-08]**.
- **팝업 고도화 — 웹사이트/HTML 임베드 + 커스터마이징**: **[Phase 1 완료 2026-07-08]**. 현재 `show_popup`은 `RichContent`로 이미지/영상/YouTube/Vimeo 자동 인식은 되나 **일반 웹사이트 URL은 링크로만** 뜨고 커스텀 HTML/스타일 불가 → "웹사이트도 품는다"는 취지에 부족. **방향(합의): iframe으로 통일** — URL 모드=`<iframe src>`, HTML 모드=`<iframe srcdoc sandbox>`(XSS·스타일오염을 샌드박스로 회피), auto=기존 RichContent.
  - **Phase 1 구현 내역(2026-07-08)**: 스키마 `EventSchema.popup?: PopupConfig { mode:'auto'|'url'|'html'; width?; height?; bg?; title? }` 추가(`src/types/scene.ts`, **하위호환 — popup 없으면 기존 auto 동작 100% 유지**). 새 컴포넌트 **`src/components/ui/PopupFrame.tsx`**: auto→`RichContent`, url→`<iframe src>`(sandbox 미부여), html→`<iframe srcdoc sandbox="allow-scripts allow-forms allow-popups allow-modals">`(**allow-same-origin 제외 → 스크립트가 불투명 origin에서 실행돼 부모 DOM/쿠키 접근 차단, XSS 격리**). **차단 폴백**: cross-origin iframe은 로드 성공/실패를 JS로 확신 불가 → 로딩 스피너 + 4초 후 "차단 가능성" 안내 + **url 모드엔 항상 '새 탭에서 열기' 버튼**(확실한 탈출구). `ViewerClient` 팝업 state에 `config` 추가, iframe 모드는 카드에 width/height/bg 인라인 스타일(기본 `min(90vw,860px)`×`min(82vh,620px)`) + PopupFrame, auto는 기존 RichContent 경로 그대로. **임베드(`/embed`)도 ViewerClient 공유라 자동 지원**. 에디터: Events 폼 `show_popup`일 때 모드 드롭다운 + 모드별 입력(html=textarea) + 너비/높이/제목 + 안내문(`InspectorPanel`, `newPopup` state·`cleanPopup`으로 auto+무스타일은 undefined로 정리). 검증: **tsc 클린**. **실동작 브라우저 확인 필요**(url 임베드 가능 사이트·차단 사이트 폴백·html 샌드박스·크기 조절, 에디터 프리뷰는 auto 기준이라 실렌더는 뷰어에서 확인). 제약: 에디터 이벤트 목록의 미리보기(👁)는 여전히 RichContent 기준(모드 무시).
  - **Phase 2 완료(2026-07-08)**: (1) **위치 프리셋** `PopupConfig.position: 'center'|'left'|'right'|'bottom'` — center=중앙 모달(기존), bottom=바텀시트, left/right=풀하이트 사이드 패널. `ViewerClient` 팝업 렌더를 위치별 오버레이 정렬/카드 기본크기/모서리(bottom=rounded-t, side=rounded-r/l)로 분기. (2) **등장 애니메이션** — `globals.css`에 keyframes(popupScale/SlideUp/SlideInLeft/SlideInRight/Backdrop) + 위치별 `animate-[...]` 클래스, `prefers-reduced-motion`이면 비활성. (3) **씬 전역 기본 팝업 스타일** `EnvSchema.defaultPopup?: Pick<PopupConfig,'position'|'width'|'height'|'bg'>` — 에디터 Environment '팝업 기본값' 섹션. 뷰어가 **이벤트 config > 씬 defaultPopup > 하드 기본값** 순으로 병합(interactRange 패턴). (4) 에디터 이벤트 폼: 모드 무관 **위치 드롭다운 + 너비/높이/제목/배경색(color picker)** 상시 노출(Phase 1은 url/html만). **하위호환 철저**: center+auto+크기미지정 = 기존 컴팩트 모달 경로 그대로(`legacyCompact`), 그 외만 flex-col 구조 카드. `cleanPopup`이 position도 보존. 검증: **tsc 클린 + dev 서버 `/test/move-object` 200(ViewerClient+PopupFrame 컴파일/임포트 정상)**. **실동작 브라우저 확인 필요**(4개 위치·애니메이션·씬 기본값 병합·배경색·모바일 클램프).
  - **Phase 3 완료(2026-07-08)**: (1) **등장 애니메이션 종류 선택** `PopupConfig.anim: 'auto'|'none'|'fade'|'scale'|'slide'` — auto=위치별 기본(기존), slide는 위치에 맞는 방향 자동. `globals.css`에 `popupFade` 추가, `ViewerClient`가 anim→animClass 매핑. 씬 기본값(`defaultPopup`)에도 anim 포함. (2) **chrome/padding 옵션** `PopupConfig.chrome?`(미설정/true=제목바+하단 닫기, **false=몰입형: 제목·닫기 숨김 + 우상단 플로팅 ✕ + 여백 0** → edge-to-edge iframe용), `padding?`(카드 내부 여백 override, 예 '0'|'24px'). chrome=false는 legacyCompact 제외라 구조 카드로 렌더. (3) **에디터 ▶ 미리보기를 PopupFrame로** — `previewPopup` state를 `{content, config}`로 바꿔 뷰어와 동일 병합(이벤트>씬기본)으로 **모드(iframe/html) 실제 렌더 + 크기/배경 반영**. 위치 프리셋은 에디터 미리보기에선 중앙 고정 + "뷰어에선 ○○ 배치" 주석(실제 위치는 뷰어). 에디터 이벤트 폼에 애니메이션 드롭다운·chrome 토글·여백 입력 추가, `cleanPopup`이 anim/chrome/padding 보존. 검증: **tsc 클린 + dev `/test/move-object` 200**. **실동작 브라우저 확인 필요**(anim 5종·몰입형 chrome=false 플로팅닫기·여백0 iframe·▶ 미리보기 iframe 렌더).
  - **팝업 Phase 완료** — 후속 후보(미착수): 팝업 안 여러 액션 버튼(CTA), 등장/퇴장 분리 애니메이션, 팝업 열림 시 이벤트 트리거 체이닝.
- **대화 시스템 고도화 — 대사 종료 액션(버튼)·거리 LOD·1회성 [완료 2026-07-08]**: (1) **대사 종료 시 액션 = 말풍선 안 버튼** — `EventSchema.trigger`에 `dialogue_end` 추가. **자동발동이 아니라**(사용자 피드백: always+이벤트 문제·끝나자마자 넘어가면 당황) 대화 **마지막 문장에 액션 버튼**을 띄우고 **방문자가 누르면** 발동. `DialogueConfig.endButtonLabel`(기본 '확인'). `SpeechBubble` 안 3D Html 버튼(pointerEvents auto + onMouseDown/onTouchStart stopPropagation으로 카메라 드래그 차단 — 플레이 모드는 포인터락 없어 클릭 가능) → `dv.confirm()` → `onEvent(obj,'dialogue_end')` → 기존 `handleObjectEvent` 파이프라인(팝업·씬이동·문열기 등 전 액션). 데스크톱은 E키(근접+끝)로도 확정. auto 대화는 종료 이벤트 있으면 **마지막 문장에서 순환 멈춰 버튼 유지**. (2) **거리 LOD** — `SpeechBubble`을 `<group ref>`로 감싸 useFrame에서 카메라 거리 계산, 12m부터 페이드→20m 넘으면 사실상 숨김(직접 style.opacity, setState 없음, drei `distanceFactor` 원근축소와 병행). (3) **1회성** — `DialogueConfig.once`. `active = wantActive && !dismissed && !(once && seen)`. seen 시점: 버튼 확정(confirm) 또는 (버튼 없는 대화는) 끝까지 보고 근접 해제 시. `dismissed`=버튼 눌러 이번 세션 닫음(근접 풀리면 리셋). 미묘한 자동발동 로직(firedRef 등)은 버튼 방식으로 대체돼 단순화됨. **미완료(대화 남은 것)**: 선택지(분기), 하단 대화창 모드. 에디터: 트리거 '대사 종료 시'(버튼 안내), 대화 섹션 '1회성' 토글 + (종료 이벤트 있을 때) '종료 버튼' 이름 입력. 검증: **tsc 클린 + dev `/test/move-object` 200**. **실동작 브라우저 확인 필요**(근접→대사 끝 버튼 등장→클릭→액션, 멀어지면 페이드, once 재방문 안 뜸 — [[project_e2e_play_mode_testing]] 방식 권장).
- **경계 벽 2차**: ~~그라데이션 페이드/one-sided/면별 텍스처/스카이박스 대안~~ **[완료 2026-07-10 — 아래 '최근 완료' 참고]** / **원형·커스텀 모양만 남음**(콜라이더도 원형 대응 필요라 별도).
- ~~**조명 L2 (c)**: 라이트 색(warm/cool) 스키마~~ **[완료 2026-07-10 — 아래 '최근 완료' 참고]**. L2 전체 완료.
- ~~**Prefab**: 미착수. 착수 전 override/동기화 규칙 설계 필요.~~ **[MVP 완료 2026-07-09 — 아래 참고]**
- ~~**AssetBrowser 탭**: Materials/HDR (WIP)~~ **[완료 2026-07-10 — 아래 '최근 완료' 참고]**. **4개 탭(Materials/Textures/HDR/Audio) 전부 완료.** ground·boundary 텍스처는 여전히 개별 업로드(에셋 등록 아님) — 원하면 uploadImageTexture로 통합 가능.

### 🗺️ 대형 로드맵 (원본 `ROADMAP.md`/`FEATURE_LIST.md` — 이 핸드오프 요약에 누락됐던 것들)

> 이 노트가 최근 작업 위주라 아래 기획들이 빠져있었음(2026-07-07 재편입). 상세 AC는 `FEATURE_LIST.md`/`ROADMAP.md` 참조.

- **3D 에셋 마켓플레이스** (FEAT-MARKET-01 / P5-03): 에셋 브라우저 "마켓플레이스" 탭 — 카테고리·검색, 무료/유료 구분, **Business 플랜은 자기 에셋 등록·판매**. 별도 스프린트(마켓 DB/결제 구조 설계 필요).
- ~~**씬 템플릿 라이브러리** (FEAT-TEMPLATE-01 / P3-08)~~ **[완료]**: 새 씬 생성 시 빈씬/쇼룸/갤러리/광장/카페 5종 템플릿 선택 모달. `SceneSwitcher`의 `TemplatePickerModal` + `src/lib/sceneTemplates.ts`(SCENE_TEMPLATES). `createFromTemplate`로 생성.
- **실시간 협업** (FEAT-COLLAB-01 / P5-01): 다중 유저 동시 편집(커서·선택 공유, CRDT).
- **AI 자동 배치** (P5-02).
- **Material 커스텀 에디터** (P4-03) — 현재 Inspector Material 섹션 주석처리 상태.
- **뷰포트 분할**(P4-06) · **단축키 커스터마이징**(P4-08) · **에셋 폴더/태그**(P3-11) · **Event Bridge 프리셋**(P4-10) · **댓글/피드백 모드**(P4-09).
- **성능/최적화**: InstancedMesh 자동 전환(P4-01) · KTX2/Draco 파이프라인(P4-02, ※현재 draco 실압축 안 함) · 스토어 selector 리팩터(NumInput 스크럽 시 캔버스 전체 리렌더, WORKLOG).

### 정리/결정 필요

- **오토세이브** 되살리기/제거 결정 (현재 수동 Ctrl+S만, `setAutoSaveAt` lint 경고 원인).
- ~~**Layers 데드 코드**~~ **[정리 완료 2026-07-10]**: 스토어의 죽은 machinery(`layers` 상태·`LayerState`·`addLayer`/`toggleLayerVisible`/`toggleLayerLocked`/`setObjectLayer`) 제거 — 어떤 컴포넌트도 안 쓰던 완전 데드코드. `ObjectNodeSchema.layer` 필드는 하위호환 위해 유지(제거 시 마이그레이션·팩토리 대량 수정 필요, 무해).

### 인프라/비즈니스

- **결제/플랜 업그레이드 (Stripe)** — 미착수.
- **커스텀 도메인 다중 씬 이동** — `proxy.ts`가 기본 씬만 서빙(경로 무시). 다중 씬은 별도 개선.
- **emit_event(Event Bridge)** — 구현 완료, 실 iframe E2E는 게시 씬으로 확인만 남음(Pro 게이팅은 코드표시 UI에만).
  - **핵심 시나리오 명확화 (2026-07-08) — 임베드 호스트가 '자기 페이지'를 3D 위에 띄우기**: 사용자 의도 = park3d 씬을 **A사이트(고객사)에 임베드**하고, 3D 안의 건물 클릭 시 **A사이트의 회사소개/연혁 등 자기 페이지**를 3D 위에 표시. **이건 `emit_event`(Event Bridge)로 이미 가능**하며 **X-Frame-Options 무관** — A사이트가 자기 same-origin 콘텐츠를 자기가 렌더하고, park3d는 "건물 클릭됨(value)" 신호만 전달하기 때문. 방식: 건물에 `Trigger=Click · Action=emit_event · value='about'/'history'` → 임베드가 부모로 `park3d:event` postMessage → `embed.js`가 호스트 `window`의 CustomEvent로 재전달 → **호스트가 `window.addEventListener('park3d:event', e => e.detail)`로 받아 자기 모달/라우팅으로 표시**. (`show_popup`은 우리 뷰어 내부 팝업 렌더 + 부모 통지 겸용 — 호스트가 직접 띄울 땐 `emit_event`가 정석, 중복 팝업 없음.) **아까 팝업 iframe/커스터마이징 로드맵은 이것과 별개** — 그건 _독립 URL/커스텀도메인 배포에서 우리 뷰어가 직접 콘텐츠를 보여줄 때_ 유용(상호보완). **참조 데모 페이지 추가**: `/test/host-demo?url=/embed/<sceneId>` — "A사이트 목업"(상단 내비 + 3D 임베드 + park3d:event 수신 시 회사소개/연혁 사이드 패널을 3D 위에 오버레이). raw postMessage 구독으로 self-app에서도 동작(실배포는 embed.js CustomEvent). 기존 `/test/event-bridge`는 raw 이벤트 로거로 유지. 실 게시 씬 + 건물에 emit_event 걸어 최종 확인만 남음.

## 조명 L2 — L1 피드백 취합 결과 & 계획 (2026-07-06)

사용자가 L1 기본값으로 실제 씬을 보고 준 피드백 3건 + 코드 진단:

1. **GLB가 바닥에 파묻힘** — `addAssetObject`(sceneStore)가 GLB 원점을 무조건 y=0에 놓음. GLB는 원점이 발밑이 아닌 기하 중심인 경우가 많아 밑면이 바닥(`y=-0.002` 텍스처 평면) 아래로 내려감. 인스펙터 y 클램프 `Math.max(0,v)`는 **원점**만 0 이상으로 막고 **실제 밑면(bbox.min.y)**은 안 맞춤. 프리미티브는 생성 시 y=0.5+스케일1이라 정상. **[완료 — "바닥에 놓기" 버튼]** `GlbObject`가 계산한 로컬 bbox를 `glbLocalBboxCache`(url→Box3)에 저장 → 인스펙터 버튼이 오브젝트의 **회전+스케일 행렬을 로컬 bbox에 적용해 실제 min.y**를 구하고 `position.y = -min.y`로 밑면을 바닥(0)에 정렬. 루트(parentId=null) GLB만. 자동 스냅 대신 버튼(공중 배치 통제권 유지). 검증: three 수치(회전/스케일 5케이스 worldBase=0) + `/test/snap` 렌더(25°+비균일 스케일에서도 밑면이 바닥에 정확히 앉음).
2. **색이 밝게/파스텔로 뜸**(예: 저장 #226155 → 화면 #39706a) — 에디터·뷰어 Canvas 어디에도 톤매핑 미지정 → R3F 기본 **ACESFilmicToneMapping**이 채도 낮추고 중간톤 들어올림. **[완료 — Linear 채택]** `/test/tonemap` A/B 픽셀 측정(실제 조명 리그) 결과 저장색 대비 Δ: **none≈linear(Δ~10) < aces(Δ~20) < neutral(Δ~28)**. 처음엔 Neutral 추천했으나 측정상 Neutral이 오히려 색을 더 밀어냄. NoToneMapping은 exposure가 무효라, **`THREE.LinearToneMapping` 채택**(none과 동일 정확도 + 노출 조절 유효). 트레이드오프: 값>1 하드클립(부드러운 롤오프 없음) — 기본 조명은 안 넘겨 안전, 밝은 HDR/강광은 노출 슬라이더로 억제. `SceneToneMapping` 컴포넌트 + Canvas gl prop, 에디터·뷰어 동일.
3. **씬별 분위기 원함**(가벼우면) — 이미 `environment.lights`·HDR·sky·fog가 씬 단위 저장이라 대부분 가능. 가벼운 추가: **씬별 노출(toneMappingExposure) 슬라이더** + 선택적 분위기 프리셋(아침/한낮/노을/밤 env 묶음).

**L2 진행 상황**: ①(톤매핑 Linear+노출)·②(바닥 스냅 버튼)·③(분위기 프리셋 + ContactShadows) **완료**.

- **③-a 분위기 프리셋**: 에디터 Environment 패널 'Mood' 섹션 — 아침/한낮/노을/밤/스튜디오 5개 버튼(`MOOD_PRESETS`). 클릭 시 `updateEnvironment`로 **HDR 프리셋 + 라이트(강도/태양위치) + 노출** 묶음 적용(기존 검증된 경로 재사용). **브라우저 확인 완료(2026-07-07)**.
- **③-b ContactShadows**: 스키마 `contactShadows`, 에디터·뷰어 렌더, Lights 패널 토글. **기본 꺼짐(opt-in)**. **실제 GPU 브라우저에서 렌더 확인 완료(2026-07-07)** — 헤드리스 SwiftShader에선 안 그려졌던 것뿐. opt-in 유지.
- **(c) 라이트 색(warm/cool)** **[완료 2026-07-10]**: 아래 '최근 완료' 참고. → **L2 전 항목 완료.**

### L2 후속 수정 (2026-07-06, 사용자 피드백)

- **기본(방향광) 그림자 더 진하게**: fill 광이 그림자를 씻어내던 걸 줄임 — `ViewerCanvas`·`EditorCanvas`의 ambient 배수 0.5→**0.2**, hemisphere 0.08→**0.02**, `DefaultEnvironment` IBL 기본값 0.35→**0.25**. 측정(`/test/shadow`): 그림자/바닥 밝기 140/165 → **119/149**로 심도↑. 트레이드오프: fill이 줄어 씬 전체가 약간 어두워짐(특히 그림자 밖 어두운 구석)·PBR 재질 IBL 반사 살짝 감소. 더 진하게 원하면 fill을 더 낮추거나 per-scene 그림자 강도 슬라이더 추가 고려.
- **ContactShadows 플레이 모드 트레일 버그 수정**: 접지 그림자 켠 채 플레이하면 캐릭터 이동 경로에 검은 그림자가 칠해지던 문제 → **플레이 모드에선 ContactShadows 미렌더**(`!playMode` 게이트, `ViewerCanvas`). 접지 그림자는 정적 씬(탐색/에디터)용. 헤드리스에선 ContactShadows 자체가 안 그려져 트레일 재현·확인 불가지만, 컴포넌트를 트리에서 빼므로 구조적으로 트레일 불가능.

## 알려진 제약/한계

- `go_to_scene`: **경로의 현재 씬 id를 대상 id로 치환**해 이동 → `/space`·`/embed`·커스텀도메인(경로에 id 포함 시) 모두 대응. 경로에 id 없으면 `/space/{id}` 폴백. (뷰어 통합 리팩터 2026-07-07)
- `focus_object`: 탐색=OrbitControls 이동, **플레이=팔로우 대신 대상 줌**(2026-07-08, 팝업 닫기/Esc로 복귀+이동 잠금 해제). `reset_camera`: 탐색(orbit) 모드 전용 — 플레이는 캐릭터 팔로우 카메라라 무시됨.
- ~~솔리드는 area 트리거로 애니메이션 재생 안 됨~~ **[해소 — 2026-07-10]**: `ViewerClient.handleObjectEvent`가 **모든 트리거에서 `play_animation` 처리**(→ clipRequests→externalClip)하고, 솔리드는 `PlayModeController`의 물리 접촉 콜백 `onObstacleEnter`가 area_enter를 발동하므로 → **솔리드+area+애니메이션 동작**. (센서는 PhysicsObject activeClip 경로와 중복이나 같은 클립이라 무해.)
- **트리거 확장(Distance/Collision) 이미 커버**: Distance ≈ `approach_enter/exit`(오브젝트 중심 반경 자동 트리거), Collision ≈ **솔리드 오브젝트의 area_enter/exit**(`onObstacleEnter`가 캐릭터 물리 접촉 시 발동 — 센서 불필요). 별도 트리거 추가는 중복이라 미도입.
- `interact` 트리거: **플레이 모드 전용 + 루트 오브젝트 전용**(중첩 그룹 자식은 로컬 좌표라 근접 판정 제외). 범위 고정 3m·정면 조건 없음(최근접). 키는 E 고정. ~~**임베드는 프롬프트 UI 미표시**~~ **[해소 — ViewerClient 통합]**: E 프롬프트(데스크톱 키캡/모바일 버튼)는 variant 게이팅이 아니라 `playMode`만 체크 → **`defaultMode='play'` 임베드에서 정상 표시**(임베드는 모드 토글이 없어 defaultMode 고정이므로 interact 쓰려면 play로 설정). `Is Sensor` 통과는 버그가 아니라 트리거 영역의 정의 — 막고 싶으면 센서 끄기(기본 솔리드).
- `move_object`: ~~**그룹 대상은 탐색 모드 전용**~~ **[완료 2026-07-10 — 그룹도 플레이 모드 이동, 아래 '최근 완료' 참고]**. 방식: `movedIds`(posOverride 대상) 배선 → 옮겨지는 그룹을 `MovedGroupCollider`(kinematicPosition hull 강체)로 라우팅해 콜라이더가 함께 이동. **제약(남음)**: 그룹 자식은 볼록 껍질(hull) 근사(오목 형상 두꺼워짐)·한번 옮긴 그룹은 이후 hull 콜라이더 유지(자식별 정밀 콜라이더→hull). 이동한 솔리드 위에 선 캐릭터는 같이 안 실려감(텔레포트라 이동 플랫폼은 아님·rapier 라이딩 미구현). 임베드도 ViewerClient 공유라 자동 지원.
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
