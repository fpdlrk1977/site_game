# ANIMATION — 애니메이션 저작 시스템 설계 & 로드맵 (기준 문서)

> 목적: 사용자가 **임의의 애니메이션을 직접 저작**(포즈 전환 ~ 키프레임 타임라인)하고, 여러 오브젝트를 조합해 하나의 재사용 오브젝트로 만들 수 있게 한다.
> 이 문서가 단일 기준(source of truth). 구현/결정 바뀌면 여기 갱신. 진행 로그는 `doc/PROGRESS.md`.

## 핵심 철학
- **포즈/상태 전환은 키프레임의 부분집합** → 처음부터 **키프레임 데이터 모델**로 저장하면, 나중에 타임라인 UI는 "얹는" 것이지 재작성이 아니다. 두 모드(간단/고급)를 **같은 데이터·같은 런타임**으로 지원.
- **기존 인프라 재사용 = 사이드이펙트 최소화**: 이벤트(트리거)·effectiveScene override·그룹·기즈모·프리팹을 그대로 쓰고 그 위에 얹는다. 기존 `motion`(앰비언트)·`move_object`(단발 이동)은 **무변경**(공존).
- **비파괴**: 오브젝트의 씬 트랜스폼 = rest(기준). 애니 움직임은 클립 데이터로만 저장, 런타임에 override로 미리보기/재생. 씬 레이아웃은 안 망가짐.

## 데이터 모델 (forward-compatible — 포즈=키프레임)
```ts
interface AnimKeyframe { time: number; position?: Vec3; rotation?: Vec3; scale?: Vec3; } // rotation=deg
interface AnimTrack { objectId: string; keys: AnimKeyframe[]; }   // 오브젝트별 트랙(단일=1개, 그룹=자식 여러 개)
interface AnimClip {
  id: string; name: string; duration: number; loop?: boolean;
  tracks: AnimTrack[];
  rootId?: string | null;   // 스코프(그룹/프리팹 재사용). null=씬 전역
}
// ProjectSceneSchema.animClips?: AnimClip[]   (씬 단위, 하위호환 옵셔널)
// EventAction += 'play_clip'  (value=clipId) — 기존 트리거로 재생. loop 클립은 scene_start로.
```
- **포즈 = 키프레임 1개**, **상태 전환(A→B) = 키 2개 클립**, **풀 타임라인 = 키 N개 + 트랙 + 곡선**. 데이터 동일.
- 단일 오브젝트 = 트랙 1개. 여러 오브젝트 = 트랙 N개(그룹 자식). rootId로 그룹/프리팹 스코프.

## 런타임 (뷰어 `ViewerClient`) — override 패턴 재사용
- 상태 `clipOverride: Record<objectId, {position?,rotation?,scale?}>` (posOverride/modelOverride와 동일 패턴).
- `play_clip` 액션 → 그 클립을 활성화. rAF 루프가 경과시간 t로 각 트랙의 키프레임 사이를 **보간(lerp/easeInOutQuad)** → clipOverride 갱신 → effectiveScene가 오브젝트 트랜스폼에 주입.
- loop면 반복, 아니면 끝나면 마지막 키 유지(또는 rest 복귀는 옵션). restartGame에서 초기화.
- **N개 키프레임 보간 플레이어를 처음부터** → 타임라인(키 많음)도 런타임 변경 없이 동작.

## 에디터 통합 (기존 창, 격리 모드)
- **애니메이션 편집 모드**: 대상 그룹 선택 → 모드 진입 시 대상만 선명·나머지 씬 흐림(격리), 하단 타임라인/포즈 UI 등장, 기즈모는 대상만. 나가면 일반 편집 복귀.
- **계층 ↔ 트랙 동기**: 타임라인 행 = 클립 참여 오브젝트(계층 순). 선택 동기·하이라이트.
- **저작 = 조작+캡처**: 기존 기즈모로 오브젝트를 옮긴 뒤 현재 시간에 "+ 키프레임" → 그 트랙에 기록.
- **비파괴 스크럽**: 재생헤드 이동 = 그 순간 상태 미리보기(clipOverride), 씬 rest 트랜스폼 불변.
- **재사용**: 완성 그룹 클립 → Prefab 저장 → "애니메이션 되는 복합 오브젝트".

## 두 모드 (같은 데이터)
- **간단(포즈)**: 인스펙터 Animation 섹션. 포즈(트랜스폼 스냅샷=키) 목록 + 전환(from→to, 시간·이징) + `play_clip` 이벤트 배선. 초보/문·서랍·레버.
- **고급(타임라인)**: 하단 패널. 트랙별 키프레임·재생헤드·곡선. 모드 토글로 전환.
- **왕복 규칙**: 간단→고급 항상 OK. 키 많은 클립은 고급 전용(간단 모드는 "타임라인에서 편집" 안내).

## Phase 로드맵 (2026-07-14 재정리 — 논의 반영)

### ✅ 완료
- **P1 — 기반 + 단일 포즈 저작**: 키프레임 데이터 모델·스토어(CRUD/persist/undo)·런타임 보간 플레이어·`play_clip` 액션·인스펙터 Animation 섹션(클립 생성·포즈 캡처·시간 편집·이징/loop). 그룹은 통째 애니(trackObjs=[obj]).
- **✅ 회전 피벗(런타임) + UX**: `AnimClip.pivot`, 런타임 `pivot − R·pivot` 위치보정(경첩). 뷰포트 축 마커(앰버), 포즈 클릭→이동, 현재 포즈 하이라이트. **한계**: 저작(기즈모/툴바) 회전은 여전히 중심 → 재생과 불일치(아래 P2에서 해결).

### 🔜 P2 — 단일 애니 "완성도" (저작 일관성 + 재사용)
> 목표: 문 하나짜리 애니를 **제대로 만들고·확인하고·재사용**까지.
- **2a. 피벗 일관화(자동 피벗 그룹)**: '회전축' 누르면 그 모서리에 **피벗 그룹 자동 생성** + 오브젝트를 넣음 → 기즈모·툴바·애니 회전이 **전부 그 축 기준** = 에디터=재생 일치. 기존 그룹 재사용(렌더/기즈모 무변경). 런타임 피벗 흉내는 이걸로 대체. (부작용: 트리에 피벗 그룹 생김 — 경첩이라 납득)
- **2b. 애니 재사용**: 복제(Ctrl+D)·프리팹에 **클립이 함께 복제·id 리맵**되게. (현재는 클립이 씬단위+그룹 id 참조라 재사용 시 애니 유실 → 리맵 필요.) 모델(GLB) 굽기는 정적이라 애니 미포함(후속).
- **2c. 에디터 미리보기 ▶**: 인스펙터에서 바로 재생(경첩 열림 확인). 저작 속도.

### 🔜 P3 — 다중 오브젝트 (복합 애니)
> 목표: **이중문·자동차 바퀴**처럼 여러 부품이 한 애니로 각자 움직임.
- **3a. 한 클립 · 다중 트랙**: 클립이 오브젝트(또는 피벗그룹)별 트랙 여러 개 → play_clip 한 번에 왼/오 문 동시. (이중문 = 피벗그룹 2개 + 트랙 2개)
- **3b. 격리 편집 모드**: 대상만 선명·나머지 씬 흐림, 기즈모는 대상만.
- **3c. 계층 트리 ↔ 트랙 동기**: 선택 하이라이트·트랙 추가/제거.

### 🔜 P4 — 타임라인 UI (정밀 저작)
- **4a. 하단 타임라인**: 트랙·키프레임 다이아·재생헤드·스크럽.
- **4b. 간단/타임라인 모드 토글** (같은 데이터, 왕복 규칙).
- **4c. 이징 곡선 편집**.

### 🔜 P5 — 다듬기
- 회전 최단경로 보간(>180°) · 커스텀 피벗·스케일 애니 피벗 드리프트 · GLB 내장 클립과 통일 · 키 복사/이동 · rest 복귀 옵션.

## 사이드이펙트 방지 체크리스트
- 모든 스키마 필드 옵셔널(하위호환). normalizeSceneData 통과.
- 런타임 플레이어는 **활성 클립 있을 때만** 동작(clipOverride 비면 effectiveScene 무변경).
- `play_clip`은 새 액션(기존 액션 무변경). 기존 motion/move_object/animate_object 그대로.
- 스토어 animClips는 variables 패턴(별도 state+CRUD, undo 스냅샷 포함).

## 진행 상태
- [x] **P1 기반 + 단일 포즈 저작 — 2026-07-14**
- [x] **회전 피벗(런타임) + 축 마커·포즈 클릭/하이라이트 — 2026-07-14**
- [~] **P2b 애니 재사용 — 2026-07-14 (복제 완료)**: `dupAnimClips`(rootId/트랙 objectId idMap 리맵) → `duplicateSelected`(Ctrl+D)·`duplicateInPlace` 4브랜치 배선(undo 포함). **복제 시 애니 따라감.** 데이터 리맵만이라 트리/렌더/기즈모 무변경(안전). **남음**: 프리팹 통합(nodeKey 기반이라 별도), 모델(GLB) 굽기.
  - **버그 3종 수정(2026-07-14, 사용자 보고)**: 복제 후 ①복제본 애니가 원본을 움직임 ②복제본 `play_clip` 이벤트가 옛 클립을 가리킴 ③삭제한 오브젝트 클립이 재생 목록에 잔존. **원인**: `dupAnimClips`는 새 클립을 만들었지만 **복제본의 `play_clip` 이벤트 value(옛 클립 id)를 리맵 안 함**(①②) + 삭제가 고아 클립 정리 안 함(③). **수정**: (1) `dupAnimClips` 반환형을 `{clips, clipIdMap(옛클립id→새클립id)}`로 바꾸고 `remapPlayClipEvents(newObjs, clipIdMap)`로 복제된 오브젝트의 `play_clip` value를 새 클립 id로 치환(4브랜치 전부). 옛 클립을 안 가진 이벤트는 무변경(다른 클립 참조 보존). (2) 공용 헬퍼 `pruneOrphanClips(animClips, deletedIds)` — 삭제 오브젝트 참조 **트랙 제거 → 트랙 0개면 클립 삭제**, stale `rootId` 정리. `deleteSelected`(트리/키보드 Del/커맨드팔레트 삭제 전부 이 액션 경유) **+ `removeObjectsByAsset`(에셋 삭제 연쇄)** 둘 다 적용, 변경 시 undo 스냅샷에 `animClips` 포함. `play_clip` 드롭다운은 스토어 `animClips`를 매핑하므로 제거 즉시 목록에서 사라짐(EventsSection). tsc 클린. **브라우저 확인 대기.**
  - **사용자 정정(2026-07-14)**: ③은 "애니 삭제 없이 오브젝트만 트리에서 삭제 시 재생 목록에 클립 잔존" — 위 (2)가 정확히 그 경로(`deleteSelected`).
- [x] **복제본 재생 위치 버그(2026-07-14)**: 오프셋 복제(`duplicateSelected`, +1) 후 복제본 재생 시 **원본 위치로 점프**해서 애니됨. **원인**: 클립 키프레임은 **절대 position**을 저장(뷰어 `sampleTrack`→effectiveScene가 `co.position`으로 전면 덮어씀)하는데, `dupAnimClips`가 트랙 objectId만 리맵하고 키프레임 좌표는 원본 값 그대로 둠 → 복제본이 원본 절대좌표로 이동. **수정**: `dupAnimClips`에 `posDelta`(OLD 오브젝트 id→이동량) 인자 추가 → 복제 클립의 position 키프레임을 그 오브젝트 이동량만큼 오프셋. `duplicateSelected` 2브랜치(그룹=루트 이동량만·자식 로컬 유지 / 단일)는 `copy.position − src.position`를 델타로 전달, `duplicateInPlace`(오프셋 0)는 델타 없이 원위치 유지. rotation/scale은 위치무관이라 그대로. tsc 클린. **브라우저 확인 대기.**
- [x] **복제 클립 이름 구분(2026-07-14)**: 복제 시 클립 이름이 그대로라 재생 목록에 같은 이름 2개 → `dupAnimClips`가 `"~ 복사"`(기존/이번 생성 이름과 중복이면 `"~ 복사 2/3…"`)로 유일화. 오브젝트 복제 네이밍(`${name} 복사`)과 일관.
- [x] **P2a 피벗 일관화 — ② 기즈모 피벗 (2026-07-14)**: 경첩 회전을 **에디터 기즈모가 직접** 처리 → 에디터=재생 WYSIWYG. **핵심 통찰**: `SingleGizmo` 프록시가 이미 임의 로컬점(`cLocal`) 기준으로 회전하도록 일반화돼 있어, 회전 모드 + pivot 클립이면 `cLocal`을 경첩점(`pivot/scale`, 원점기준)으로만 바꾸면 됨(트리/렌더 무변경, 기즈모 격리 수정). 그러면 origin = `restOrigin + (pivot − R·pivot)`로 position+rotation이 **baked** 저장. **수학 검증**: 기즈모 baked = 레거시 런타임 `pivotOffset` = `bakeClipPivots` **세 경로 동일**(결정적 테스트 8/8·재bake 가역 3/3).
  - **모델**: `AnimClip.pivotBaked?`(스키마) — true면 런타임 순수보간(pivotOffset 재적용 안 함). 신규 lib `src/lib/animPivot.ts`(`pivotOffset`·`bakeClipPivots`). **레거시 마이그레이션**: `loadScene`이 `bakeClipPivots`로 기존(중심회전+런타임pivot) 클립을 1회 baked 통일(멱등) → 기존 문 회귀 없음. 런타임(`ViewerClient`)은 `!clip.pivotBaked`일 때만 pivotOffset 폴백(안전).
  - **에디터**: `GizmoController` 회전모드 cLocal=경첩. `AnimationClipSection`은 피벗 변경 시 `setPivot`으로 키프레임 **재-bake(retroactive·가역)** → 나중에 축을 바꿔도 기존 포즈가 즉시 그 경첩으로 스윙. `goToPose`/노란 표식/기즈모 축 전부 일치. **이동/스케일 모드에선 여전히 중심**(회전만 경첩) → 일반 편집 자연스러움. tsc 클린. **브라우저 확인 대기.**
  - **동작 변화**: 피벗은 이제 "런타임 매직"이 아니라 **저작에 반영(baked)** — 예측가능. 축을 바꾸면 즉시 재-bake.
  - **후속 수정 2건(2026-07-14, 사용자 "중심으로 열리는 느낌")**: (a) **피벗 프리셋을 실제 로컬 bbox로** — 예전 `0.5×scale` 고정이라 GLB·비단위·원점≠중심 오브젝트는 모서리가 중심 쪽으로 당겨짐 → `localBBox×scale`로 진짜 모서리(`AnimationClipSection`). (b) **런타임 원호 복원** — baked 위치를 직선 보간하면 스윙 중 경첩이 중심으로 드리프트(현/chord). `ViewerClient` tickClips가 각 키의 **rest 위치(baked면 pivotOffset 제거)로 회전을 보간 → 매 프레임 pivotOffset 재적용**해 완벽한 원호(레거시 런타임과 동일 부드러움). 끝점은 baked 포즈와 정확히 일치. 결정적 테스트: 원호 6/6·bake 8/8·재bake 3/3. tsc 클린. **브라우저 확인 대기.**
- [x] **P2c 에디터 미리보기 ▶ (2026-07-14)**: 인스펙터 Animation 섹션에 **▶ 미리보기 / ■ 정지** 버튼 — 이벤트·플레이 모드 없이 뷰포트에서 바로 클립 재생(경첩 원호 포함). 정지/섹션 이탈 시 **원위치 복구(비파괴)**.
  - **샘플링 공용화**: `src/lib/animSample.ts`(`sampleTrack`·`sampleClip` — 경첩 원호 로직 포함) 추출 → **ViewerClient(뷰어 재생)와 에디터 미리보기가 동일 코드 공유**(드리프트 방지). ViewerClient의 로컬 sampleTrack/pivotOffset/lerp 제거·`sampleClip`로 대체(로직 동일, tsc 클린).
  - **구동**: 스토어 transient `animPreview{clipId,startedAt}`+`start/stopAnimPreview`(저장/undo 무관, loadScene서 리셋). `EditorCanvas`의 `ClipPreview`(Canvas 내부)가 useFrame으로 `sampleClip` → **오브젝트 Three ref 직접 구동**(기즈모와 동일 비파괴 패턴, 렌더/스토어 무변경). 종료 시 영향 오브젝트를 스토어 트랜스폼으로 복원. 회전은 `rotation.set(XYZ)`로 EditorObjectInstance와 동일 순서.
  - 제약: 포즈 2개 미만이면 버튼 비활성. 미리보기 중 편집 비권장(테스트용). 그룹/멀티트랙도 track objectId별로 구동(P3 대비 이미 일반화). tsc 클린. **브라우저 확인 대기.**
- [x] **P3 다중 오브젝트/다중 트랙 (2026-07-14)**: 한 클립에 **여러 오브젝트(트랙)**를 담아 함께 애니(양문·자동차 등). 런타임/미리보기는 이미 트랙 순회라 대응됨 — **저작 + 트랙별 경첩**을 확장.
  - **스키마**: `AnimTrack.pivot?/pivotBaked?`(트랙별 경첩 — 양문 좌/우 반대 경첩). 클립레벨 `pivot`은 폴백(하위호환). `normalizeClipPivots`(로드 1회)가 레거시 클립레벨 pivot을 **트랙별로 이관 + baked 통일**(멱등).
  - **샘플링 공용화**: `sampleClip`이 `tr.pivot ?? clip.pivot`으로 트랙별 원호 복원. `animSample.ts` 뷰어/미리보기 공유.
  - **스토어**: `addTrackToClip`(기존 키 시간에 현재 트랜스폼으로 정렬 캡처)·`removeTrackFromClip`(마지막 트랙 보호). 포즈 추가/goToPose/updatePose는 전 트랙 대상.
  - **에디터**(`AnimationClipSection`): 클립을 root뿐 아니라 **트랙 오브젝트 어디서든** 편집(선택 오브젝트 기준). **트랙 목록**(이름 클릭=선택→그 오브젝트 포즈/경첩 편집, +오브젝트 추가/제외) · **회전축은 트랙별**(선택 오브젝트의 track.pivot, 유효피벗 폴백+레거시 정리) · **포즈 갱신**(현재 포즈를 지금 상태로 덮어쓰기 — 나중에 추가한 오브젝트 자세 지정/포즈 수정). 기즈모·노란 표식도 선택 오브젝트의 트랙 경첩 조회.
  - 검증: 마이그레이션(baked/미-baked)·멱등·다중트랙 독립 원호 결정적 테스트 10/10 + 앞선 8/8·6/6·3/3. tsc 클린.
  - **후속 수정(2026-07-14, 사용자 "오브젝트 추가 후 포즈2 클릭 무반응")**: 원인 = (a) 원본이 이미 pose2에 있어 무변화 + (b) 새 트랙은 정적(모든 포즈=현재)이라 안 움직임 → **코드 버그 아님**(스토어 goToPose 테스트 6/6). UX: 오브젝트 추가 시 **자동 선택 + 안내**.
  - **인스펙터 접힘 유지(2026-07-14, 사용자 "오브젝트 추가/트랙 선택 시 인스펙터 초기화 불편")**: 섹션 접힘 상태(`collapsed`)가 `selectedId` key로 remount되는 `InspectorInner` 안에 있어 오브젝트 전환마다 리셋됐음 → **remount 안 되는 부모 `InspectorPanel`로 올려 prop 전달** → 트랙에서 다른 오브젝트를 골라도 Animation 패널이 열린 채 유지(작업 연속성). 다른 per-object 상태는 여전히 초기화(의도 유지). **스크롤 위치도** 부모 ref에 저장 후 remount 시 `useLayoutEffect`로 복원(섹션 토글 리렌더엔 무영향) → 트랙 전환 시 스크롤이 위로 안 튐.
  - **오토키(auto-key) 도입(2026-07-14, 사용자 "굳이 포즈 갱신 버튼? 자동 안 되나")**: 수동 '포즈 갱신' 버튼 **제거** → **포즈를 클릭(편집 중=하이라이트)한 상태에서 오브젝트를 옮기면 그 포즈에 자동 반영**. 구현: 명시 상태 `poseEdit{clipId,idx}`(transient) + 순수 헬퍼 `autoKeyPose`를 **`commitTransforms`(기즈모)·`updateObject`(인스펙터)** 커밋에 배선(objects·animClips 원자 히스토리). `goToPose`를 **스토어 액션**으로 옮겨 objects 직접 세팅(오토키 우회 → 포즈 이동이 엉뚱한 포즈 덮어쓰지 않음). `addPose`는 poseEdit 해제(추가=스냅샷, 이후 자유 이동→다음 포즈). 하이라이트=poseEdit 우선·root 트랜스폼 일치 폴백. **오토키 결정적 테스트 10/10**(포즈 선택 후 이동→해당 포즈만 갱신·타 포즈 불변·goToPose 무발동·no-op·updateObject 경로). tsc 클린. **브라우저 확인 대기.**
- [ ] P4 타임라인 UI(모드 토글·이징 곡선)
- [ ] P5 다듬기(최단경로·커스텀 피벗·GLB 통일)

### 회전 피벗 구현 내역 (2026-07-14) — 사이드이펙트 0 (렌더/기즈모 무변경)
- **스키마**: `AnimClip.pivot?: Vector3`(스케일드-로컬 오프셋, 미설정=중심).
- **런타임**(`ViewerClient`): `pivotOffset(pivot,rotDeg)=pivot − R·pivot`(THREE.Euler로 R 적용). tickClips에서 회전 키에 대해 position을 이 오프셋만큼 보정 → **그 점(경첩)이 고정된 채 회전**. **오브젝트 원점만 이동시켜 만드는 착시라 일반 렌더/기즈모는 안 건드림**. 수학 검증: 폭1 문 왼쪽모서리 pivot=(−0.5,0,0), 90°Y회전 → 원점 (−0.5,0,−0.5)+rot90, 왼쪽모서리 월드=(−0.5,0,0) 고정 ✓.
- **에디터**(`AnimationClipSection`): 단일 오브젝트에 '회전축(경첩)' 프리셋(중심/좌/우/앞/뒤/아래/위 = ±0.5×scale 모서리). 그룹은 오프셋-자식 방식 병행.
- **한계**: 프리셋은 단위 bbox×scale 가정(표준 박스/구/실린더 정확, GLB/로프트는 근사) · 커스텀 pivot 입력·그룹 pivot·스케일 애니 동반 시 pivot 드리프트는 후속.

### Phase 1 구현 내역 (2026-07-14)
- **스키마**(`scene.ts`): `AnimKeyframe`/`AnimTrack`/`AnimClip`(rootId 스코프·tracks·duration·loop·easing) + `ProjectSceneSchema.animClips?` + `EventAction 'play_clip'` + normalize. 전부 옵셔널(하위호환).
- **스토어**(`sceneStore.ts`): `animClips` state + `addAnimClip`/`updateAnimClip`/`removeAnimClip` + 초기상태·loadScene·undo/redo 번들·HistoryEntry. 저장(`saveScene` buildSceneData) 포함.
- **런타임**(`ViewerClient.tsx`): 모듈 순수함수 `sampleTrack`(N키 보간, linear/easeInOut). `clipOverride` state + `playingClips` ref + rAF `tickClips`(경과시간→트랙 보간→override 병합, loop/끝포즈유지) + `play_clip` 액션 핸들러 + effectiveScene에 clipOverride 적용(pos/rot/scale, 비파괴) + restartGame 초기화. **override 패턴 재사용 = 렌더경로 무변경**. 그룹 자식도 effectiveScene 경유라 다중 오브젝트 자동 지원.
- **에디터**(신규 `AnimationClipSection.tsx`): 인스펙터 Animation 섹션 — 클립 생성(현재 트랜스폼 t=0 캡처)·**포즈 추가**(현재 상태 다음 시간에 캡처, 그룹이면 자식들 함께)·포즈 목록/삭제·시작포즈로 되돌리기·길이/이징/loop·이름편집. EventsSection에 `play_clip` 액션(클립 SelectBox).
- **저작 흐름**: 오브젝트를 옮김 → 포즈 추가 반복 → Events에서 `트리거 → 애니 재생(play_clip)` 배선 → 플레이/뷰어에서 재생.
- **한계(Phase 2~)**: 에디터 내 미리보기·타임라인·계층 동기·격리 편집 모드 없음(현재는 캡처+play_clip). 회전 보간은 단순 성분 lerp(>180° 최단경로 아님). 애니 대상은 자기/직속 자식(중첩 그룹은 후속). motion과 동시 사용 비권장.

## 결정 로그
- 데이터는 **키프레임 클립**(포즈=키). 씬 단위 `animClips`, 트랙=오브젝트별. rootId로 스코프.
- 재생은 **이벤트 액션 `play_clip`**(기존 트리거 전부 재사용). 클립 자체 트리거 필드 안 둠(이벤트로 통일).
- 적용은 **effectiveScene override**(posOverride 패턴) — 비파괴, 기존 렌더 경로 무변경.
