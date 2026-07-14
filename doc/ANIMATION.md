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

## Phase 로드맵
- **Phase 1 (기반 + 단일 포즈)**: 스키마·스토어(animClips CRUD·persist·undo)·런타임 플레이어·`play_clip` 액션 + **최소 포즈 UI**(단일 오브젝트/그룹: 클립 생성·포즈 캡처·시간·미리보기). ← **여기부터**
- **Phase 2 (다중 오브젝트/그룹)**: 그룹 스코프 클립, 오브젝트별 트랙, 계층 동기, 격리 편집 모드.
- **Phase 3 (타임라인 UI)**: 하단 타임라인(트랙·키프레임·재생헤드·스크럽·이징 곡선), 모드 토글.
- **Phase 4 (다듬기)**: 이징 종류·키 복사/이동·rest 복귀 옵션·Prefab 통합·GLB 클립과 통일.

## 사이드이펙트 방지 체크리스트
- 모든 스키마 필드 옵셔널(하위호환). normalizeSceneData 통과.
- 런타임 플레이어는 **활성 클립 있을 때만** 동작(clipOverride 비면 effectiveScene 무변경).
- `play_clip`은 새 액션(기존 액션 무변경). 기존 motion/move_object/animate_object 그대로.
- 스토어 animClips는 variables 패턴(별도 state+CRUD, undo 스냅샷 포함).

## 진행 상태
- [x] **Phase 1 (기반 + 포즈 저작) — 2026-07-14 구현** (tsc 클린 + editor 컴파일 307, 브라우저 실동작 대기)
- [ ] Phase 2 (다중 오브젝트/그룹 격리 편집 모드·계층 동기)
- [ ] Phase 3 (타임라인 UI·모드 토글)
- [ ] Phase 4 (다듬기)

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
