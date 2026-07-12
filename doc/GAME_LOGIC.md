# GAME_LOGIC — 게임 로직 레이어 설계 & 로드맵 (기준 문서)

> **목적**: 3D 뷰어/에디터를 "게임·인터랙티브 홈페이지 메이커"로 확장하기 위한 **게임 로직 레이어**의 설계 기준.
> 이 문서는 나중에 이어서 작업할 때의 **단일 기준(source of truth)** 이다. 구현/결정이 바뀌면 여기를 갱신할 것.
> (구현 진행 상황은 `doc/PROGRESS.md`에 로그로 남기고, 이 문서는 "무엇을/왜/어떻게"의 설계를 담는다.)

## 핵심 철학 — 범용(general-purpose), 장르 비의존

- 이 레이어는 **특정 장르 전용이 아니다.** 변수·조건·타이머 같은 **범용 부품**을 제공하고, **어떤 게임을 만들지는 사용자가** 조립한다(레고식).
- "목표 게임(예: 동전 수집)"은 **개발 우선순위를 정하는 나침반 + 검증용 예제**일 뿐, 도구를 그 장르로 **가두지 않는다**. 만든 부품은 전 장르 공용.
- 기존 것을 **갈아엎지 않고 확장**한다. 특히 이미 있는 **Events 시스템(trigger→action)**이 비주얼 스크립팅의 씨앗 → 여기에 **상태(변수)+규칙(조건)**을 얹는다.

## 현재 자산 (2026-07-12 기준, 이미 있음)

- **Events**: `EventSchema.trigger`(click/hover_enter/hover_exit/area_enter/area_exit/interact/approach_enter/approach_exit/dialogue_end) → `EventSchema.action`(open_url/show_popup/emit_event/play_animation/go_to_scene/show·hide·toggle_object/focus_object/reset_camera/animate_object/move_object/play_sound/set_passable·set_solid·toggle_collision). `value` 문자열에 파라미터를 실음.
- **물리**: Rapier 플레이 모드. Physics Enable + **Dynamic(중력 낙하)** + Mass + Restitution. 캐릭터가 dynamic 밀기(`setApplyImpulsesToDynamicBodies`) + **F키 킥**(전방 근접 dynamic 넉백).
- **뷰어 실행부**: `ViewerClient.handleObjectEvent(obj, trigger)`가 액션 파이프라인의 단일 진입점(standalone·embed 공용). `emit_event`로 호스트 웹페이지와 통신(embed.js).

## 빠진 것 = 게임의 심장

- **상태(State/변수)**: score, health, hasKey, 진행 단계 …
- **규칙(로직/조건)**: "if score≥10 → 문 열림", "health==0 → 게임오버".
- 지금은 "버튼→팝업"(단발). 게임은 "조건에 따라 상태가 바뀌고 승패가 갈림".

---

## Phase 1 — 변수 + 조건 ✅ 구현 완료 (2026-07-12, tsc·컴파일 클린 / 브라우저 실검증 대기)

목표: **"동전 N개 모으면 문 열림 / 적 닿으면 체력-1, 0이면 리셋"** 급 게임 규칙이 노코드로 가능해지는 것.

> **구현 상태(2026-07-12)**: 아래 설계대로 스키마·스토어·뷰어 런타임·에디터 UI 전부 구현됨. `npx tsc --noEmit` 클린 + editor/space 컴파일 200. **로그인 브라우저 실동작 검증만 남음**(동전 수집 예제로).
> **실제 구현 위치**:
> - 스키마: `src/types/scene.ts` — `GameVariable`, `EventCondition`, `EventSchema.condition`, trigger `variable_changed`, action `set_variable`, `ProjectSceneSchema.variables`, `normalizeSceneData` 갱신.
> - 스토어: `src/store/sceneStore.ts` — `variables` state + `addVariable/updateVariable/removeVariable` + loadScene/undo/redo/HistoryEntry 반영.
> - 저장: `src/lib/saveScene.ts` — `variables` 포함. 복제: `dashboard/actions.ts` remapSceneData가 JSON 딥클론이라 자동 보존.
> - 런타임: `src/app/space/[sceneId]/ViewerClient.tsx` — `varsRef`(권위값)+`hudVars`(HUD)+`watcherState`(엣지)+`evalDepth`(재진입 가드), `evalCondition/applyVarOp/evaluateWatchers/onVarsChanged`, `runEventAction`(단일 이벤트 실행, 워처 재사용), `handleObjectEvent`(조건 게이트 후 디스패치), HUD 오버레이.
> - 에디터 UI: `InspectorPanel.tsx` — Environment '게임 변수' 섹션(CRUD·타입·초기값·HUD), 이벤트 폼에 `set_variable` 입력(변수/연산/값)·`variable_changed` 트리거·**조건 게이트**(변수/비교/값, 접이식).

### 1) 데이터 모델 (스키마)

```ts
// 씬 단위 변수 정의 — 이름(name)이 참조 키(고유). 런타임에 initial로 초기화.
interface GameVariable {
  id: string;
  name: string;              // 참조 키 (예: 'score') — 고유·공백없이
  type: 'number' | 'boolean';// (string은 후속)
  initial: number | boolean;
  showInHud?: boolean;       // 화면 HUD에 표시할지
}
// ProjectSceneSchema.variables?: GameVariable[]

// 이벤트 조건 게이트 — 있으면 조건이 참일 때만 액션 실행.
interface EventCondition {
  variable: string;                         // 변수 name
  op: '==' | '!=' | '>' | '>=' | '<' | '<=';
  value: number | boolean;
}
// EventSchema.condition?: EventCondition   (단일 조건=MVP, 다중 AND는 후속)

// 신규 trigger: 'variable_changed' — 아무 변수든 바뀌면 재평가(조건과 함께 "score>=10 되는 순간" 반응형 규칙).
// 신규 action:  'set_variable' — value = "varName|op|amount"  op: set/add/sub/mul/toggle
```

### 2) 실행 엔진 (뷰어 `ViewerClient`)

- **런타임 상태** `varsRef: Record<string, number|boolean>` — `scene.variables`의 initial로 초기화. 씬 로드/재시작 시 리셋.
- **조건 평가** `evalCondition(cond)`: `varsRef[cond.variable]`와 비교.
- **게이트**: `handleObjectEvent`가 액션 실행 전에 `event.condition` 있으면 평가 → false면 스킵.
- **set_variable**: `value` 파싱(`"score|add|1"`) → varsRef 갱신 → **변수 변경 이벤트 재평가** 트리거.
- **variable_changed 반응형**: 변수 바뀔 때마다 `trigger==='variable_changed'` 이벤트들을 순회, 각자의 condition 평가. **엣지 감지**(false→true 전환에서만 1회 발동, 매 변경마다 재발동 방지) — 이벤트별 마지막 평가값 기억.
- 모든 액션은 기존 파이프라인 재사용 → set_variable도 팝업·문열기 등과 자유 조합.

### 3) HUD (화면 표시)

- `showInHud`인 변수를 뷰어 화면 구석에 `이름: 값` 텍스트로 오버레이. (탐색/플레이 공용, 임베드 포함)
- MVP: 좌상단 스택. 스타일 커스텀은 후속.

### 4) 에디터 UI

- **Variables 섹션**(Environment 인스펙터, 씬 단위 — materialAssets와 같은 위치): 변수 추가/이름/타입/초기값/HUD토글/삭제.
- **Events 폼 확장**:
  - action 드롭다운에 `set_variable` → 변수 select + op(set/add/sub/mul/toggle) + amount.
  - trigger 드롭다운에 `변수 변경 시(variable_changed)`.
  - 각 이벤트에 **조건(선택)**: 변수 select + op + value. ("조건 추가" 접이식)

### 5) 저장/undo

- `variables`를 scene_data(save/normalize/load)·스토어 state·undo 스냅샷에 포함(materialAssets 패턴).

### 6) 검증 예제 (동전 수집 — 나침반)

1. 변수 `score`(number, 0, HUD on) 정의
2. 동전 오브젝트: trigger=interact(또는 area_enter) → action=`set_variable score|add|1` + `hide_object`(자기)
3. 문 오브젝트: trigger=`variable_changed` · condition `score >= 3` → action=`set_passable`(또는 play_animation)
4. → 동전 3개 먹으면 문이 열림. HUD에 score 표시.

---

## Phase 2 — 게임 요소 (후속)

- **타이머**: N초마다 / 카운트다운(액션 `wait`·트리거 `on_timer`).
- **스폰/디스폰**: 프리팹·오브젝트 런타임 생성·제거(적·아이템).
- **랜덤**: set_variable에 random 범위.
- **HUD 고도화**: 바(체력바)·아이콘·위치/스타일.
- **승리/패배 상태**: game_over/win 액션 → 결과 화면.
- **다중 조건**(AND/OR), 조건 분기(if/else).

## Phase 3 — 고급 (후속)

- **커스텀 스크립트(JS) 이스케이프 해치**: 노코드로 안 되는 로직을 샌드박스 JS 블록으로(파워유저).
- **비주얼 노드 에디터**(Blueprint식) — 규칙을 노드로 시각적 연결.
- 세이브/로드(진행 저장), 리더보드 등.

## 홈페이지(인터랙티브 웹) 관점

- 이미 `emit_event`+embed.js로 3D↔호스트 웹 통신 가능. 변수/조건이 붙으면 "이스터에그 찾기·퀴즈·제품 커스터마이저" 같은 **게임화된 홈페이지**도 노코드로.

## 설계 결정 로그

- **변수 참조는 name 기준**(id 아님) — 조건/액션 문자열에서 사람이 읽기 쉽게. name 고유성은 에디터에서 강제.
- **조건은 이벤트 게이트 방식**(별도 로직 노드 아님) — 기존 Events에 최소 침습으로 얹기. 반응형은 `variable_changed` 트리거로 해결.
- **런타임 상태는 뷰어 로컬**(저장 안 함) — 게임 플레이 상태이지 씬 데이터가 아님. 씬엔 initial만 저장.
- **엣지 감지**로 variable_changed 반응형의 중복 발동 방지.
