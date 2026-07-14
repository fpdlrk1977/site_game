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

## HUD 커스터마이즈 분석 (사용자 질문 — 스코어/체력바를 사용자가 만들 수 있나?) ✅ 가능·구현됨

**결론: 가능하고 Phase 2에서 구현함.** 방식은 "자유 배치 캔버스"가 아니라 **위젯 바인딩** 모델(노코드 도구 표준: 위젯을 변수에 연결).
- 스키마 `HudElement{id, variable(바인딩), kind:text|bar|lives, label, position(6구석), color, max, icon}` + `ProjectSceneSchema.hudElements[]`.
- 사용자는 에디터에서 **위젯 추가 → 변수 연결 → 종류(텍스트/체력바/목숨)·위치·색·최대값 선택**. 뷰어가 실시간 값으로 렌더.
- **후속 여지**(원하면 확장): 자유 좌표 드래그 배치, 커스텀 이미지 아이콘/프레임, 폰트·크기, 조건부 표시(값 0일 때 숨김), 게이지 애니메이션, 미니맵·타이머 위젯 프리셋.

## Phase 2 — 게임 요소 ✅ 구현 완료 (2026-07-12, tsc·컴파일 클린 / 브라우저 검증 대기)

- **타이머**(트리거 `scene_start`·`on_timer`): scene_start=로드/재시작 시 1회, on_timer=`timer.everySec` 간격 반복(once면 1회). ViewerClient가 setInterval/setTimeout로 구동, 게임오버 시 정지, 재시작 시 재설정.
- **스폰/디스폰**(액션 `spawn_object`·`despawn_object`): spawn=템플릿 오브젝트 복제 생성(원본 위치+오프셋, `spawned[]` state→effectiveScene 병합), despawn=`despawnedIds` Set으로 필터 제거(빈 값=자기 자신). **제약**: 단일 오브젝트만(그룹·자식 미지원), 스폰 클론은 timer/scene_start 대상 제외(무한 스폰 방지).
- **HUD 고도화**: 위 'HUD 커스터마이즈' 참조(text/bar/lives 위젯).
- **승리/패배**(액션 `game_win`·`game_lose`): 결과 오버레이(🎉/💀 + 메시지 + '다시 시작' 버튼). `restartGame()`=변수 initial 복구+스폰/오버라이드/결과 초기화+scene_start·타이머 재실행(`runNonce` bump).
- **구현 위치**: `scene.ts`(트리거·액션·HudElement·EventSchema.timer), `sceneStore.ts`(hudElements CRUD+undo), `ViewerClient.tsx`(scene_start/on_timer effect, spawn/despawn/win/lose 브랜치, restartGame, HudWidgets 렌더, 결과 오버레이), `InspectorPanel.tsx`(HUD 섹션, 트리거/액션/타이머/스폰/승패 UI).

### Phase 2 후속 ✅ 구현 완료 (2026-07-12) — 다중조건·if/else·랜덤
- **다중 조건 (AND/OR)**: `EventSchema.conditions?: EventCondition[]` + `conditionLogic?: 'and'|'or'`. 런타임 `evalGate(ev)` = conditions[] 우선(AND=every·OR=some), 없으면 레거시 `condition` 폴백. 에디터: 조건 여러 개 추가 + AND(전부)/OR(하나) 토글. 저장 시 conditions로 통일(레거시 condition 비움), 로드 시 레거시는 배열로 승격.
- **if/else 분기**: `EventSchema.elseAction?`/`elseValue?` — 조건이 **거짓**이면 대신 실행. 런타임 `runElseAction`(합성 이벤트). variable_changed는 then=false→true 엣지, **else=true→false 엣지**. 모든 트리거(click/area/interact/scene_start/on_timer/variable_changed) 지원. 에디터: 조건 있을 때 "아니면(else) 액션" — 간단 입력 액션만(팝업/스폰/스크립트 복합입력 제외, `ELSE_ACTION_OPTIONS`).
- **랜덤**: `set_variable` 연산에 `random` 추가 — value=`"변수명|random|min,max"` → [min,max] 정수 랜덤(주사위 등). 에디터: 연산 '랜덤 🎲' + min~max 두 입력.
- **미구현(후속)**: 세이브/로드(진행 저장)·리더보드·조건에서 변수↔변수 비교(현재는 변수↔상수)·중첩 분기.

## Phase 3 — 고급

### 커스텀 스크립트(JS) ✅ 구현 완료 (2026-07-12)
- 액션 `run_script` — value=JS 코드. `new Function('api','self', code)`로 실행, **안전 헬퍼 api만 노출**(window 직접 노출 X): `api.get/set/add`(변수)·`show/hide`(id)·`despawn`(id)·`popup`(내용)·`sound`(url)·`win/lose`(메시지)·`log`, `self`(이 오브젝트). try/catch로 오류 격리.
- **보안 주의(문서화)**: 제작자 자신의 코드가 뷰어에서 실행됨(= 자기 웹사이트에 `<script>` 넣는 것과 동일 신뢰수준). **진짜 샌드박스(iframe/worker 격리)는 후속** — 타인 코드를 실행하거나 마켓 배포 시 필수. 현재는 단일 제작자 시나리오라 허용.
- 구현: `ViewerClient.runScript`. 에디터: run_script 액션 = textarea + api 사용법 안내.

### 비주얼 노드 에디터 (Blueprint식) — 🔬 분석 결과 **별도 스프린트로 보류 권장** (미구현)
- **현황**: 이미 Events(trigger→condition→action)가 **경량 비주얼 스크립팅**(규칙 리스트). 노드 에디터는 이걸 **그래프 UI로 재표현**하는 것 — 기능이 아니라 **표현/UX 레이어**.
- **규모**: 드래그 노드·와이어·포트·줌/팬·자동 레이아웃 = **대형 UI 프로젝트**(수 주). 그래프 라이브러리 `@xyflow/react`(React Flow) 설치 필요. 데이터모델은 현 Events를 노드 그래프로 매핑(대체로 1:1)하면 되나, 노드 간 연결(한 액션 완료→다음)·분기 등 **실행 모델 확장**도 수반.
- **권장 순서**: (1) 먼저 Phase 2 후속(다중 조건·if/else·랜덤)으로 **로직 표현력**부터 키우고, (2) 사용자 수요 확인 후 노드 에디터를 **전용 스프린트**로. 지금 당장은 Events 리스트 UI로 충분히 게임 제작 가능.
- **착수 시 설계 메모**: 노드 종류 = 트리거노드/조건노드/액션노드/변수노드. 캔버스는 오브젝트별이 아니라 **씬 전역 로직 그래프**(오브젝트 참조는 노드 속성)로 가는 게 확장성 좋음. 기존 per-object events와의 공존/이관 정책 필요.

## 홈페이지(인터랙티브 웹) 관점

- 이미 `emit_event`+embed.js로 3D↔호스트 웹 통신 가능. 변수/조건이 붙으면 "이스터에그 찾기·퀴즈·제품 커스터마이저" 같은 **게임화된 홈페이지**도 노코드로.

## 설계 결정 로그

- **변수 참조는 name 기준**(id 아님) — 조건/액션 문자열에서 사람이 읽기 쉽게. name 고유성은 에디터에서 강제.
- **조건은 이벤트 게이트 방식**(별도 로직 노드 아님) — 기존 Events에 최소 침습으로 얹기. 반응형은 `variable_changed` 트리거로 해결.
- **런타임 상태는 뷰어 로컬**(저장 안 함) — 게임 플레이 상태이지 씬 데이터가 아님. 씬엔 initial만 저장.
- **엣지 감지**로 variable_changed 반응형의 중복 발동 방지.

---

## 🗺️ 변수 시스템 고도화 로드맵 (2026-07-14 수립 — 진행 중)

> 사용자 요청: 변수 타입 확장(현재 number/boolean 2개) + asset(모델) 참조까지 포함한 통합 계획.
> **추천 착수 순서대로 진행**(Claude 판단). 각 Phase 완료 시 이 문서 갱신.

### Phase A — 타입 확장 기반 (string · enum · color) ⬅️ **먼저**
셋이 같은 패턴(타입 추가 + 에디터 입력 + `==` 조건)이라 한 번에. `GameVariable.type` 유니온 확장 + `value: number|boolean|string` + 에디터 UI + `evalCondition`/`applyVarOp` 분기.
- **string**: 값=텍스트, 조건 `==/!=/contains`, 연산 set·append
- **enum** ⭐(상태머신): `GameVariable.options?: string[]`, 조건 `==` 드롭다운, 연산 set·"다음 상태"
- **color**: 값=hex, 컬러픽커, 재질/HUD 색 연결
- 난이도 낮~중, 리스크 낮음.

### Phase B — number 활용도 강화 (A와 병행)
`applyVarOp`/`evalCondition`만 손대면 됨. clamp(0~max)·div·mod + **변수↔변수 연산/비교**(`score = score + coins`, `score > highScore`). 난이도 낮음.

### Phase C — asset(모델) 변수 + 소비 배선 🔑
값 저장은 쉬우나 "변수가 가리키는 모델로 뭘 하기"가 새 배선. 여기서 **`@변수` 간접지정** 첫 도입.
1. **asset 타입**: 값=에셋 id, 에디터=씬 에셋 드롭다운
2. **소비 A — 모델 스왑**: 새 액션 `swap_model`(값=`대상|@변수`) → `effectiveScene`에 `modelOverride` 맵(기존 vis/pos Override와 동일 패턴)
3. **소비 B — 변수 모델 스폰**: `spawn_object`가 `@변수` 해석 → 그 에셋으로 생성
- 소비 A(스왑)가 B(스폰)보다 쉬움 → A 먼저. `@변수` 메커니즘은 후속 "오브젝트 참조 변수"의 토대.

### Phase D — timer 타입
number 기반 + 뷰어 자동 감소 틱, 연산 start/pause/reset, 조건 `<= 0`. 난이도 중.

### Phase E — 스코프/지속성 (별도 스프린트, 최대 "확대" 레버)
`GameVariable.scope: 'scene'|'global'|'persistent'`. global=씬 넘어 유지, persistent=localStorage(최고점수·이어하기). 멀티 씬·세이브/로드 전제. 난이도 높음.

### 진행 상태
- [x] **Phase A (string·enum·color) — 2026-07-14 구현**
- [x] **Phase B (ops div/mod/clamp·변수↔변수 연산) — 2026-07-14 구현**
- [x] **Phase C (asset 변수 + swap_model) — 2026-07-14 구현** (spawn-from-variable은 후속)
- [x] **Phase D (timer) — 2026-07-14 구현**
- [x] **Phase E (scope/persist) — 2026-07-14 구현**

### Phase D+E 구현 내역 (2026-07-14) — tsc 클린, 브라우저 실동작 대기
- **Phase D timer**: `GameVariable.type` `'timer'`(number 기반). 런타임 `ViewerClient`에 1초 interval — timer 변수를 `-1`(0에서 멈춤), `onVarsChanged`로 워처 발동(→ `timer<=0 → game_lose` 가능). 게임오버 시 정지, 재시작 재설정. 에디터: 변수 카드 timer=초 입력, 조건/연산은 number로 처리(fall-through). set_variable로 시간 가감 가능.
- **Phase E scope/persist**: `GameVariable.scope?: 'scene'|'global'|'persistent'`. 런타임: `scopeStore`(global=sessionStorage·persistent=localStorage, 키 `p3v:{projectId}:{name}`), init에서 `readScopedInitial`(저장값 우선), `onVarsChanged`에서 `persistScoped`(scoped 변수 저장). restartGame: scene+global→initial(global 세션 제거), persistent 유지. 에디터: 변수 카드 '유지 범위' 드롭다운. 씬 이동(go_to_scene=새 페이지)해도 global 유지, 브라우저 재방문해도 persistent 유지(최고점수·이어하기).

### Phase C 구현 내역 (2026-07-14) — tsc 클린, 브라우저 실동작 대기
- **스키마**: `GameVariable.type`에 `'asset'`(값=AssetRefSchema.id). `EventAction`에 `'swap_model'`.
- **런타임**(`ViewerClient`): `modelOverride: Record<objId, assetId>` state → effectiveScene에서 `assetId` 덮어씀(vis/pos/material Override와 동일 패턴). `swap_model` 액션 = value `"대상id|소스"`, 소스 `@변수명`이면 `varsRef`에서 asset id 해석(= **`@변수` 간접지정 첫 도입**), 아니면 에셋 id 직접. restartGame에서 초기화.
- **에디터**: EnvironmentPanel 변수 카드 type 'asset' → 씬 모델 에셋 드롭다운. EventsSection `swap_model` 액션 = 대상 오브젝트 + 소스(asset 변수 `@name` 또는 직접 모델 에셋) 2단 선택.
- **한계/후속**: spawn_object가 `@변수` 해석은 아직(스폰은 템플릿 오브젝트 기준) · swap 대상은 GLB 오브젝트가 자연스러움(프리미티브에 걸면 GLB로 바뀜) · SceneLogicSection엔 swap_model 미노출(EventsSection만). `@변수` 메커니즘은 향후 "오브젝트 참조 변수"의 토대.

### Phase A+B 구현 내역 (2026-07-14) — tsc 클린, **브라우저 실동작 확인 대기**
- **스키마**(`scene.ts`): `GameVariable.type`에 string·enum·color 추가, `initial: number|boolean|string`, `options?: string[]`(enum). `EventCondition.op`에 `contains`, `value: number|boolean|string`.
- **스토어**(`sceneStore.ts` `updateVariable`): 타입 변경 시 initial 보정(string=''·color='#ffffff'·enum=options[0], 없으면 ['A','B'])+enum 옵션 편집 시 initial 목록 밖이면 첫 옵션.
- **런타임**(`ViewerClient.tsx`): `varsRef`/`hudVars` 타입에 string. `evalCondition` ==/!=를 `String()` 정규화 + `contains`. `applyVarOp`: string 브랜치(set/append/next=enum 순환), 숫자에 div/mod/clamp 추가, **`resolveNum`으로 리터럴 또는 변수명 해석**(변수↔변수 연산). `api.set` 타입 string 포함.
- **에디터**: EnvironmentPanel 변수 카드 = 타입 5종 드롭다운 + 타입별 초기값 입력(텍스트/컬러픽커/enum드롭다운) + enum 선택지 목록 편집. EventsSection = `VAR_TYPE_LABEL`·`defaultCondition` 헬퍼, set_variable 폼/조건 입력을 타입별로(숫자값 입력은 "값 또는 변수명" 텍스트라 변수참조 UI 노출).
- **하위호환**: 기존 number/boolean 변수·조건 그대로 동작(normalizeSceneData는 variables 배열 통과).

---

## 🎮 게임 컨트롤러 (전역 로직 홀더) 로드맵 (2026-07-14 수립)

> 문제: 현재 이벤트가 **오브젝트에만** 붙음 → "score>=3" 같은 공유 규칙을 반응체마다 복붙해야 함(중복). 해결: 오브젝트에 안 매달린 **씬 전역 규칙 그릇**.
> 핵심: 기존 `EventSchema`(trigger→condition→action)를 **그대로 재사용**, 오브젝트가 아니라 씬에 붙임 → 런타임·폼 대부분 재활용(저리스크).

### 스키마
- `ProjectSceneSchema.sceneEvents?: EventSchema[]` — 씬 전역 규칙. EventSchema 재사용. normalize 통과(하위호환).

### 트리거/액션 제약 (에디터)
- 씬 레벨 트리거 = 공간 불필요한 것만: **scene_start · on_timer · variable_changed**. (click/hover/interact/approach/area는 오브젝트 필요 → 숨김.)
- 액션 = 대상 명시/전역인 것(set_variable·spawn·popup·game_win/lose·set_passable(대상 지정)·show/hide 등).

### 런타임 (ViewerClient) — 기존 함수 재사용, 3패스만 추가
- `evaluateWatchers`: object events 순회에 **`scene.sceneEvents` 순회 추가**(watcherState는 이벤트 id 기준이라 그대로).
- `scene_start`·`on_timer`: 셋업에 씬 이벤트 포함.
- **합성 self**: `runEventAction(obj,...)`에 가상 컨트롤러 `{ id:'__scene__', name:'Scene' }` 전달. 대상 명시 액션 정상, self-타겟만 무의미(무해).

### 스토어 — `variables`와 동일 패턴
- `sceneEvents` state + `addSceneEvent`/`updateSceneEvent`/`removeSceneEvent` + loadScene·persist(saveScene/buildSceneData)·undo·normalize.

### 에디터 UI
- **Phase 1(추천 시작)**: 빈 곳 클릭 → Environment 패널에 **"Game Logic" 섹션**(트리거 3종 + 조건 + 핵심 액션). 발견성 OK, 저난이도.
- **Phase 2**: GNB "Logic" 탭 전용 화면, 문장 카드, EventsSection 폼 완전 일반화(obj 의존 제거).
- **난관**: 현 `EventsSection` renderEventForm이 obj에 강결합 → Phase 1은 focused 컴포넌트로 시작, Phase 2에서 일반화.

### 미래
- 성숙 시 **비주얼 노드 에디터**의 데이터 백엔드(씬 전역 그래프 = sceneEvents).

### 진행 상태
- [x] **Phase 1 — 2026-07-14 구현** (스키마+스토어+런타임 + Environment "Game Logic" 섹션). tsc 클린, 브라우저 실동작 확인 대기.
- [~] **Phase 2 부분 — 2026-07-14** (액션 팔레트 확장: SceneLogicSection에 swap_model·play_sound 추가). **남음**: GNB Logic 전용 탭, EventsSection 폼 완전 일반화(obj 의존 제거), go_to_scene/spawn/move 등 나머지 액션.

### Phase 1 구현 내역 (2026-07-14)
- **스키마**(`scene.ts`): `ProjectSceneSchema.sceneEvents?: EventSchema[]` + normalizeSceneData 통과.
- **스토어**(`sceneStore.ts`): `sceneEvents` state + `addSceneEvent`/`updateSceneEvent`/`removeSceneEvent`(withHistory 즉시 커밋) + 초기상태/loadScene/undo·redo 번들/HistoryEntry에 포함. `EventSchema` import 추가.
- **저장**(`saveScene.ts` buildSceneData): `sceneEvents` 포함(= 저장·인에디터 플레이 공유).
- **런타임**(`ViewerClient.tsx`): 합성 컨트롤러 `sceneControllerObj`(`{id:'__scene__'}`, useRef, `as unknown as` 캐스트) → scene_start·on_timer(`setupTimer` 헬퍼)·evaluateWatchers(`runWatcher` 헬퍼) 3패스에 `scene.sceneEvents` 순회 추가(전부 기존 runEventAction/evalGate 재사용). watcherState는 이벤트 id 기준이라 그대로 동작.
- **에디터**(신규 `panels/inspector/SceneLogicSection.tsx`): 자체 완결 컴포넌트(EventsSection 재사용 아님 — obj 강결합 회피). Environment 패널 HUD 아래 배치, 기본 접힘(`gamelogic`). 트리거 3종(scene_start/on_timer/variable_changed)+조건(타입인지, 다중 AND/OR)+액션 subset(set_variable[타입인지]·game_win/lose·show_popup·오브젝트 표시/숨김/토글/통과/제거). 헤더 `+`로 규칙 추가, 문장 카드 목록+수정/삭제.
- **한계(Phase 2로)**: 액션 팔레트 subset(go_to_scene·spawn·move·sound·focus 등 미포함), GNB 전용 탭 없음(Environment 안), EventsSection 폼 미일반화(중복 존재), else 분기 미지원.
