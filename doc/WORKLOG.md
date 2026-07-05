# WORKLOG — 유지보수 작업 기록

> 작업 내역·원인 분석·검증 방법을 누적 기록하는 문서.
> 새 작업을 시작하기 전에 [주의사항·함정](#5-주의사항--함정-작업-전-필독)과 [미결 사항](#6-미결--보류-사항)을 먼저 확인할 것.
> 새 항목은 상단에 날짜 역순으로 추가한다.

---

## 2026-07-05 유지보수 라운드 (버그 일괄 수정 + 구조 개선 + 성능)

### 1. 전수 코드 분석으로 발견한 버그 수정 (20건)

#### 확실한 버그 (동작 파손)
| # | 증상 | 원인 | 수정 파일 |
|---|---|---|---|
| ① | 캐릭터 프리뷰 선택 하이라이트가 절대 안 켜짐 | `selectedIds.length === 0` 비교 — `selectObject`는 `[id]`로 세팅하므로 항상 false | `CharacterPreview.tsx` |
| ② | 다중 선택 중 오브젝트 추가 시 UI 어긋남 | `addObject`/`addAssetObject`가 `selectedIds` 미갱신 | `sceneStore.ts` |
| ③ | 에셋 삭제해도 Storage 파일이 안 지워짐 | URL 파싱 정규식이 버킷 세그먼트부터 매칭 → 잘못된 경로로 remove 후 silent fail | `AssetBrowser.tsx` |
| ④ | 그룹에 physics 켜면 플레이 모드 이중 렌더 | `physicsObjects` 필터에 `!isGroup` 누락 | `PlayCanvas.tsx` |
| ⑤ | 그룹 자식 Y좌표 인스펙터 편집 시 0으로 튐 | 로컬 좌표(음수 y 정상)인데 무조건 클램프 — 기즈모의 `skipYClamp` 규칙과 불일치 | `InspectorPanel.tsx` |
| ⑥ | 스폰 y<0 저장 시 무한 낙사 루프 | 스폰 입력 min 없음 + 리스폰이 스폰 좌표 그대로 | `InspectorPanel.tsx`, `PlayModeController.tsx` (리스폰 y ≥ 1) |

#### 잠재 오류
- ⑦ 신규 오브젝트에 기즈모 미부착 (ref 등록이 렌더 후라 타이밍 갭) → `GizmoController.tsx`에 1회성 리렌더 가드
- ⑧ 히스토리 병합 오염 — `updateObject` 후 `pushHistory` 누락 경로 (HierarchyPanel의 visible/lock/rename)
- ⑨ Ground 토글 시 preset/textureUrl 유실 (스프레드 누락)
- ⑩ 사용 중 에셋 삭제 시 유령 참조 → 현재 씬 참조 검사 후 차단 (한계: 같은 프로젝트 **다른 씬** 사용 여부는 미검사)
- ⑪ 단축키: `e.code` 통일(한글 IME 안전), macOS Cmd 지원, Ctrl+숫자 브라우저 충돌 차단, **Shift+숫자 북마크 저장이 원래 동작 불가였던 것**(`e.key`가 `!` 등이 됨) 수정
- ⑫ 캐릭터 프리뷰가 다중 선택에 섞이는 문제 → `toggleSelectObject`에서 가상 ID 제외. `CHARACTER_PREVIEW_ID` 상수 원본을 `sceneStore.ts`로 이동 (순환 import 방지, CharacterPreview에서 re-export)
- ⑬ `beforeunload` 미저장 경고 추가 (`EditorClient.tsx`) — 오토세이브는 여전히 주석 비활성 상태
- ⑭ `redo`의 히스토리 상한(`slice(-49)`) 누락
- ⑮ 애니메이션 재트리거 불가 → 클립 요청을 `ClipRequest { name, t }` 타입으로 변경 (`ViewerObject.tsx`, `PhysicsObject.tsx`)

#### 사소한 수정
- GlbClipPicker에 URL별 클립 목록 캐시 (수십 MB GLB 반복 fetch 제거)
- Fog near ≤ far 교차 클램프 / NumInput 타이핑 중 min·max 클램프
- SectionHeader 접기 기능 복원 (+Physics 섹션 반쪽 배선 보정)
- 저장 버튼 연타 잠금 (`savingRef`) — scene_versions 중복 insert 방지
- 씬 전환 시 재로드 (`initialScene.sceneId` 의존성)

### 2. 에셋 URL 구조 전환 — signed URL → public URL

**배경**: 업로드 시 1년짜리 signed URL 문자열을 DB/scene_data에 그대로 저장 → 재발급 로직이 없어 1년 뒤 모든 에셋 링크가 일괄 만료되는 구조였음. 공개 씬(/space, /embed)은 어차피 방문자에게 URL이 노출되므로 버킷 공개 전환이 합리적이라 판단.

- **`supabase/migrations/0006_assets_public.sql`**: assets 버킷 공개 전환 + 공개 읽기 정책 + `assets` 테이블·`scenes.scene_data`·`scene_versions.scene_data`의 기존 signed URL을 public URL로 일괄 변환
- 코드: `createSignedUrl` 3곳 → `getPublicUrl` (AssetBrowser GLB/썸네일, InspectorPanel 그라운드 텍스처)
- 삭제 경로 파서는 sign/public **양쪽 URL 형식 모두 지원** (마이그레이션 전 데이터 호환)
- ⚠️ **마이그레이션은 파일만 생성된 상태 — Supabase 대시보드 SQL Editor 또는 `supabase db push`로 직접 적용 필요.** 적용 전까지 기존 에셋은 여전히 1년 시한부.

### 3. Area Enter 이벤트 수정 (3차에 걸친 원인 규명)

**최종 원인 3층 구조** — 코드 리딩만으로는 2번 실패, E2E로 확정:
1. Rapier는 기본값에서 **kinematic(플레이어) ↔ fixed(오브젝트) 쌍의 충돌 이벤트를 계산하지 않음** → 센서 콜라이더에 `ActiveCollisionTypes.KINEMATIC_FIXED` 명시 필요
2. r3/rapier의 `onIntersectionEnter`는 센서 전용 — Is Sensor 꺼진(녹색 가이드) 오브젝트는 감지 배선 자체가 없었음
3. **캐릭터 컨트롤러가 센서를 벽으로 취급** → 캡슐이 센서 표면에서 정지, 겹침이 발생할 수 없어 교차 이벤트 원천 불가 (결정타. E2E 스크린샷에서 캐릭터가 센서에 막힌 것을 보고 확정)

**최종 구현**:
- `PlayModeController.computeColliderMovement`에 `QueryFilterFlags.EXCLUDE_SENSORS` → 센서는 통과 가능한 트리거 영역
- 센서 경로: `PhysicsObject.onIntersectionEnter` (KINEMATIC_FIXED 적용)
- 솔리드 경로: 컨트롤러의 `computedCollision` 목록에서 `RigidBody.userData.objectId`로 오브젝트 식별 → `onObstacleEnter` 콜백 (`PlayCanvas`에서 area_enter로 라우팅). **0.5초 접촉 유예로 밀착 시 판정 깜빡임 중복 발동 방지**
- 결과: area_enter는 이제 physics/센서 설정과 무관하게 "닿으면 발동". Is Sensor는 통과 여부만 결정
- 부가: area_enter로 `open_url` 시 팝업 차단 폴백(링크 팝업), Inspector 경고문을 안내문으로 교체
- **알려진 한계**: 솔리드 GLB + area_enter + play_animation 조합은 클립 재생 안 됨 (센서면 정상)

### 4. 플레이 화면 성능 + 오브젝트 검게 렌더링 수정

**증상 "오브젝트가 있다가 사라졌다"** = 성능 문제가 아니라 렌더링 버그:
- 일부 GLB(Kenney류)가 unlit 선언은 헤더(`extensionsUsed`)에만 있고 재질에는 미부착 + `metallicFactor=1`로 export됨
- three.js가 완전 금속으로 로드 → HDR 없는 씬에서 반사 대상이 없어 **검게 렌더** → 각도 따라 스펙큘러 번쩍임 + 어두운 하늘과 겹치면 실루엣 소멸 = "사라짐"으로 보임
- **수정**: `src/lib/glbMaterials.ts`의 `normalizeGlbMaterials()` — metalnessMap 없이 metalness=1인 재질을 비금속으로 보정. GLB 클론 4개 지점(ViewerObject, GlbObject, PlayModeController 캐릭터, CharacterPreview) 모두 적용

**끊김** = 후처리가 프레임 시간의 절반 (변인 측정으로 확정):
| 조건 | FPS (1280×800, Intel UHD, 실제 씬) |
|---|---|
| 수정 전 | 72.8 |
| 후처리 MSAA 8→0만 | 116.7 |
| 후처리 완전 OFF | 144 (상한) |
| **최종 (MSAA 0 + 그림자맵 1024)** | **128.2 (+76%)** |

- **수정**: `PostProcessingEffects.tsx` 4개 프리셋 전부 `multisampling={0}`, `ViewerCanvas.tsx` 그림자맵 2048→1024
- 추가 여지(미적용): 저사양 방문자용 "성능 모드" 토글(후처리 자동 오프)

### 5. 주의사항 · 함정 (작업 전 필독)

**Rapier / 플레이 모드**
- kinematic↔fixed 쌍은 기본적으로 충돌 이벤트가 계산되지 않음 → 이벤트가 필요하면 `ActiveCollisionTypes.KINEMATIC_FIXED` 명시
- 캐릭터 컨트롤러 `computeColliderMovement`는 `EXCLUDE_SENSORS` 필수 (없으면 센서가 벽이 됨)
- 컨트롤러 접촉 판정은 밀착 시 프레임 간 깜빡임 → enter 감지에는 유예시간(0.5s) dedup 필요
- Rapier는 강체 비균일 스케일 미지원 — 회전+비균일 스케일 중첩 그룹은 콜라이더 어긋날 수 있음
- `@dimforge/rapier3d-compat`는 직접 의존성 (r3/rapier와 동일 버전 0.19.2 고정)

**히스토리(undo) 패턴**
- 연속 변경(드래그·타이핑): `updateObject`/`updateEnvironment`가 `_prevSnapshot` 캡처 → 커밋 시점(blur/mouseup)에 `pushHistory()`. **`updateObject`만 호출하고 `pushHistory`를 빼먹으면 다음 작업의 undo에 병합 오염됨**
- 단발 변경: 액션 내부에서 `past`에 직접 push (`slice(-49)` 상한 유지)

**좌표계**
- 오브젝트 position은 부모 기준 로컬 좌표. 그룹 자식은 음수 y 정상 — y 클램프는 최상위(`!parentId`)에만 (기즈모 `skipYClamp`와 동일 규칙)

**에셋/Storage**
- 에셋 URL은 public URL (`.../object/public/assets/...`). 구 데이터는 signed 형식일 수 있으므로 URL 파싱은 양쪽 지원
- Storage 경로 추출: `/object/(?:public|sign)/assets/([^?]+)` — 버킷명 다음 세그먼트부터가 remove()용 경로
- GLB 재질은 로드(클론) 시 반드시 `normalizeGlbMaterials()` 통과 — 새 GLB 로드 지점을 추가하면 같이 적용할 것

**UI/입력**
- 단축키는 `e.key` 대신 `e.code` (한글 IME·Shift 조합 안전), Ctrl 계열은 `e.ctrlKey || e.metaKey`
- `CHARACTER_PREVIEW_ID`(가상 오브젝트)의 원본은 `sceneStore.ts` — objects 배열에 존재하지 않으므로 선택/일괄 로직에서 섞이지 않게 주의

### 6. 미결 · 보류 사항

| 항목 | 상태 |
|---|---|
| `0006_assets_public.sql` DB 적용 | **사용자 실행 대기** (SQL Editor 또는 supabase db push) |
| 캐릭터 프리뷰 클릭 시 Inspector UX (제목만 바뀐 Environment 패널 재사용 → 혼란) | 사용자 결정 보류. 후보: ① Player·Spawn 섹션만 표시(추천) ② 항상 Environment ③ 현행+자동 스크롤 |
| 스토어 전체 구독 → selector 전환 (NumInput 스크럽 시 캔버스 전체 리렌더) | 미착수 (성능 리팩터링) |
| Layers 기능 데드 코드 (스토어에만 존재, UI 없음, 히스토리 미포함) | 미착수 (살릴지 제거할지 결정 필요) |
| 오토세이브 재활성화 (현재 주석 처리) | 미착수 — beforeunload 경고만 적용된 상태 |
| 에셋 삭제 시 다른 씬 사용 여부 검사 | 미착수 (현재 씬만 검사) |
| 솔리드 GLB area_enter + play_animation 클립 재생 | 알려진 한계 |
| 저사양용 "성능 모드" 토글 | 후보 (필요 시) |

### 7. 테스트 인프라 (회귀 검증용)

**원칙: 플레이 모드 물리·이벤트·렌더링 수정은 코드 리딩만으로 완료 보고 금지 — E2E로 발동/렌더를 확인한 후 보고** (area_enter 건에서 2회 반려된 교훈)

- **`/test/area-enter`**: area_enter 회귀 테스트 페이지. 자동 전진(mobileInputRef.fwd=1)으로 센서 박스 통과 → 솔리드 박스 접촉, 발동 내역을 `window.__areaEnterLog`에 기록
- **`/test/perf`**: 성능 측정 페이지. `public/__perf_scene.json`에 씬 데이터를 넣고 사용 (개인 데이터라 커밋 금지 — 측정 후 삭제). 쿼리 토글 `?shadows=off` `?post=0` `?ground=0` `?ms=0` `?mode=rotate`, 결과는 `window.__getPerf()`
- **헤드리스 구동**: puppeteer-core + Edge(`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`), args `--enable-gpu --use-angle=d3d11 --enable-unsafe-swiftshader` (실제 GPU로 측정됨). 개발 서버는 보통 3000 포트에 이미 떠 있음 — 새로 띄우면 충돌
- **엔진 레벨 검증**: `@dimforge/rapier3d-compat`를 node에서 직접 구동하는 재현 스크립트 패턴 (world + 콜라이더 + EventQueue)
