# PIVOT & DIRECT-MANIPULATION 구현 명세

> 오브젝트의 **변형 기준점(피벗/앵커)** 을 일반 속성으로 승격하고, 선택 박스 **꼭지점 핸들 직접 조작** + **꼭지점 우클릭 컨텍스트 메뉴**를 얹는다.
> 이것이 축변경·직접조작·애니메이션 경첩·**액추에이터(관절)** 의 공통 근간이 된다. (기준: 이 문서)
>
> 상태: **설계 확정 대기** — 아래 "결정 필요" 확인 후 Phase 1 착수.

---

## 0. 배경 / 문제

- 오브젝트는 **로컬 원점(대개 중심) 기준으로 스케일**된다 → 높이를 키우면 위·아래로 동시에 커져 **밑면이 바닥 아래로**. (바닥 스냅 자체는 밑면 기준이라 안전하나, 이후 스케일이 이를 깬다.)
- 프리팹 원본/자식이 바닥 클램프와 얽혀 **따로 놈**.
- **피벗 개념이 애니메이션에만** 존재(`AnimationClipSection`의 7개 면-중심 프리셋) → 엣지/코너 불가, 일반 편집엔 부재.

**해결**: 오브젝트마다 **앵커**를 두고 스케일·회전이 그 점 기준으로 일어나게 한다. **하단 앵커 = 바닥 고정 + 위로만 성장.** 이 앵커를 애니·액추에이터가 공유.

---

## 1. 핵심 개념 — "핸들 = 앵커"

- 선택 박스 **꼭지점(코너)/모서리(엣지)/면 중심에 핸들**(작은 원/박스).
- **핸들 드래그 = 스케일/회전**. 드래그하는 핸들의 **반대쪽 점이 고정점(앵커)** → "오른쪽-아래를 끌면 왼쪽-위 고정" = "하단 앵커면 위로만 성장"과 동일 원리.
- **꼭지점 우클릭 → 컨텍스트 메뉴 → 이 점을 '축(피벗)으로 고정'** → 그 앵커가 지속(스케일·회전·애니·액추에이터 공통).
- 변형 수치는 **Inspector에 실시간**(기존 `liveTransformStore` 채널 재사용).

---

## 2. 3개 재사용 레이어

```
Layer 3  ContextMenu (공용, 이미 추출됨)  ── 확장 지점(축변경 + 다수 메뉴)
   │
Layer 2  ManipulationHandles (뷰포트)     ── 핸들 렌더 + 드래그 → liveTransformStore + 앵커 변형
   │
Layer 1  Object Pivot/Anchor (데이터+수학) ── 스키마 + animPivot 확장(스케일/회전 앵커 보정)
```

이 순서로 **아래에서 위로** 쌓는다(각 층 단독 검증 가능).

---

## 3. Layer 1 — 오브젝트 피벗/앵커 (데이터 + 수학)

### 3.1 스키마 (`src/types/scene.ts`)

```ts
// 정규화 앵커 — 각 축 0=min면 · 0.5=중심 · 1=max면. 미설정 = 중심(현재 동작, 하위호환).
//   실제 로컬 점 = lerp(localBBox.min, localBBox.max, anchor). (스케일 무관 → 크기 바꿔도 앵커 유지)
interface ObjectNodeSchema {
  // ...
  pivot?: { x: number; y: number; z: number }; // 0..1 정규화. 미설정=중심.
}
```

- **정규화(0..1)** 로 저장 = **스케일 불변**. 하단 앵커는 `y:0`이면 크기 바뀌어도 항상 밑면.
- **기본 undefined = 중심 = 현재 동작** → 기존 씬 100% 무변경.
- 27-점 프리셋 = 각 축 ∈ {0, 0.5, 1}. 자유 입력 = 0..1 임의값.

> **결정 필요 ①**: 애니 피벗(현재 `AnimTrack.pivot` = 스케일드-로컬 절대 오프셋)과의 관계.
> - (A) 신규 오브젝트 앵커는 **정규화**로 두고, 애니 피벗은 당분간 별도 → Phase 4에서 통합(로드 시 절대→정규화 변환, 기본 중심이라 회귀 없음).
> - (B) 애니 피벗도 즉시 정규화로 마이그레이션.
> 권장 = (A) 단계적.

### 3.2 수학 (`src/lib/animPivot.ts` 확장, 또는 신규 `pivotMath.ts`)

로컬 앵커 점 `A = lerp(localBBox.min, localBBox.max, pivot)` (지오메트리 단위, **스케일 전**).
월드에서 원점→앵커 오프셋 `P = R · (A ⊙ scale)` (R=회전, ⊙=성분곱).
**앵커를 고정**하려면 스케일/회전이 바뀔 때 원점을 보정:

```
// 스케일 s0→s1 (회전 R 고정): position += R · (A ⊙ (s0 − s1))
// 회전 R0→R1 (스케일 s 고정): position += (R0 − R1) · (A ⊙ s)     ← 기존 pivotOffset 일반화
scaleAnchorDelta(A, R, s0, s1)  →  Δposition
rotateAnchorDelta(A, s, R0, R1) →  Δposition   // = pivotOffset(A⊙s, R1) − pivotOffset(A⊙s, R0)
```

- 기존 `pivotOffset(pivot, rotDeg) = pivot − R·pivot` 은 회전 케이스의 특수형 → **재사용/일반화**.
- `localBBox`는 이미 `src/lib/objectBBox.ts`가 제공(프리미티브 실측 캐시·GLB 캐시·그룹 재귀 union).
- **결정론적 단위 테스트**(tsx): 폭1 박스 하단앵커 2배 스케일 → 밑면 y 고정 · 좌하단 코너 90° 회전 → 코너 고정 등.

### 3.3 앵커 보정을 적용해야 하는 **모든 경로** (하나라도 빠지면 그 경로만 어긋남)

| 경로 | 파일 | 처리 |
|---|---|---|
| Size/Scale 필드 | `TransformSection` | onChange 시 `scaleAnchorDelta`로 position 동반 보정 |
| 스케일 기즈모 | `GizmoController`(SingleGizmo) | 프록시 cLocal=앵커, onChange에서 보정(회전은 이미 cLocal 피벗) |
| 회전 기즈모 | `GizmoController` | cLocal=앵커로 (이미 애니 경첩에서 하던 것 일반화) |
| 바닥 스냅 | `sceneStore.floorSnapObject` | 하단앵커면 "앵커를 바닥에"로 자연 통일 |
| Array/Cloner·프리팹·복제 | 해당 액션 | pivot이 필드라 **자동 복사**(추가 작업 없음, 검증만) |
| 애니 스케일 키 | Phase 4 | 애니 피벗 통합 시 |

---

## 4. Layer 2 — 조작 핸들 (뷰포트)

신규 `src/app/editor/[projectId]/canvas/ManipulationHandles.tsx` (선택 시 렌더).

- **핸들 렌더**: 선택 오브젝트 **월드 bbox**(`worldBBox`) 위에 코너 8 + (선택) 엣지/면 핸들. 카메라 향한 빌보드 작은 원/박스. `depthTest=false`+`renderOrder`로 안 가림.
- **드래그 = 스케일**: 핸들 드래그 → 반대 코너 앵커 고정 → 새 scale + `scaleAnchorDelta` position. 드래그 중 `liveTransformStore.setLive`로 **Inspector 실시간**, 놓을 때 `commitTransforms`(undo 1회).
- **드래그 = 회전**: 코너 바깥쪽 링/핸들 드래그 = 회전(피그마식). 앵커 기준.
- **3D 평면 결정**: 조작 평면 = **카메라를 바라보는 주 면**(또는 선택 오브젝트 로컬 주면). 스크린-공간 델타를 그 평면에 투영. *(결정 필요 ②)*
- **모디파이어**: Shift=균일/축고정 · Alt=중심기준(앵커 무시 임시) · Ctrl=스냅(그리드/오브젝트).
- **드래그 HUD**: 핸들 옆 실시간 수치 오버레이(Inspector 안 봐도 됨).
- 기존 **TransformControls 기즈모와 공존**(모드 토글) 또는 대체 — *(결정 필요 ③)*.

> **결정 필요 ②**: 3D 조작 평면 = "카메라 향한 면" vs "오브젝트 로컬 주면" vs 둘 다(모디파이어 전환).
> **결정 필요 ③**: 새 핸들이 기존 기즈모를 **대체**할지 **공존**(예: 기본=핸들, 정밀=기즈모)할지.

---

## 5. Layer 3 — 컨텍스트 메뉴 (꼭지점 우클릭)

공용 `src/components/ui/ContextMenu.tsx` 재사용(위치·클램핑·바깥클릭/Esc 이미 구현). 꼭지점 우클릭 → 해당 코너 정보(어느 앵커인지)와 함께 오픈. 아래는 담을 항목(기존 재활용 + 신규).

### A. 축/변형 (핵심)
- **이 점을 축(피벗)으로 고정** / **축 리셋(중심)**
- **회전 리셋** · **스케일 리셋** · **변형 적용(bake)**
- **미러/뒤집기** X/Y/Z (축 기준)
- **바닥에 놓기**(기존) · **표면에 스냅**(신규, 다른 오브젝트 위)

### B. 정렬·배치 (구현됨 → 접근성↑)
- **정렬** min/center/max · **Tidy up** · **간격 균등(Distribute)**
- **격자/오브젝트 스냅 토글**

### C. 복제·구성 (구현됨)
- **복제**(⌃D) · **복사/붙여넣기** · **속성 복사/붙여넣기**
- **Array(반복)** / **라이브 클로너** — "여기 기준 배열"
- **Boolean**(합/빼/교집합) · **하나로 합치기(Merge)**

### D. 계층·프리팹 (구현됨)
- **그룹/그룹 해제** · **프리팹으로 만들기 / 원본으로 지정 / 프리팹 해제**
- **표시/숨김** · **잠금**

### E. 애니/모션/액추에이터 (근간 확장)
- **모션 추가**(회전/부유/펄스…)
- **여기 앵커로 '성장 애니' 만들기**(하단 고정 스케일 키 자동)
- **여기에 키프레임 추가** · **경첩으로 애니 시작**
- **★ 액추에이터(관절)로 변환** — 이 축을 경첩 삼아 구동 (다음 큰 기능)

### F. 재질·편집·뷰 (구현됨)
- **재질 에셋 적용** · **색 팔레트 적용**
- 타입별: **펜툴로 수정 / 복셀 수정**
- **이 오브젝트로 카메라 포커스** · **카메라 북마크 저장**

### G. 신규 아이디어
- **제약(Constraints)** — 부모 모서리 고정(반응형 프레임 배치)
- **가동 피벗 핸들** — 축 점을 드래그해 자유 배치

> 메뉴는 **오브젝트 타입/상태별 조건부 노출**(예: 프리팹만 '해제', GLB만 없는 항목 등). 확장은 항목 추가만.

---

> **카메라도 이 근간의 대상**: 카메라는 위치·회전을 가진 오브젝트라 조작 핸들·기즈모(스케일 제외)·애니 클립을 그대로 상속 → 카메라 오브젝트 배치/조준/플라이스루가 저비용으로 얹힌다. 상세 = **`doc/CAMERA.md`**.

## 6. 액추에이터(관절) — Phase 5 상세 설계 (설계 확정 대기)

> 앵커/조작 근간(Phase 1~3 완료) 위에 **관절**을 얹는다. 아래 "결정 필요" 확인 후 Phase 5a 착수.

### 6.0 한 줄 정의
오브젝트를 **경첩점(hinge)** 기준으로 **한 축**을 따라 **범위(min~max)** 안에서 **구동(drive)** 시키는 관절.
= **문 여닫기 · 로봇팔 관절 · 피스톤 · 레버 · 시소**를 노코드로. 앵커가 이미 스케일·회전을 그 점 기준으로 하므로 **"축+각도+구동"만 얹으면** 됨.

### 6.1 스키마 (`src/types/scene.ts`)
```ts
export interface ActuatorConfig {
  kind: 'rotate' | 'slide';       // 회전 관절(경첩) / 직선 관절(피스톤)
  axis: 'x' | 'y' | 'z';          // 회전축(rotate) 또는 이동축(slide) — 오브젝트 로컬
  hinge?: Vector3;                // 경첩 위치(정규화 0..1, 미설정=형상 중심). ★중(0.5)/엣지 허용 — rotate 전용
  min: number;                    // rotate=각도(도)·slide=거리(m) — 닫힘/기준
  max: number;                    // rotate=각도(도)·slide=거리(m) — 열림/최대
  drive: 'manual' | 'oscillate' | 'variable' | 'event';
  value?: number;                 // 현재 위치 0..1(min=0·max=1). 에디터 미리보기·초기값. 기본 0
  speed?: number;                 // oscillate 속도배수 / event 이동속도(초당 0..1). 기본 1
  loop?: 'pingpong' | 'forward';  // oscillate 방식. 기본 pingpong
  variable?: string;              // drive='variable'일 때 바인딩할 GameVariable.name(0..1 해석)
  collider?: boolean;             // 플레이 모드 콜라이더 동반(진짜 장애물). 기본 false=시각
}
// ObjectNodeSchema.actuator?: ActuatorConfig   // 옵셔널=관절 없음(하위호환). motion과 배타(actuator 우선).
```
전부 옵셔널 추가 → 기존 씬/렌더/저장 무변경.

### 6.2 경첩(hinge) — 앵커 근간 재사용 + "중" 재노출
- 회전 경첩 = **회전축에 수직인 평면의 한 점**. 예: **문 = Y축 + 좌측-중앙**(X-Z 평면 좌측).
- 문/레버 경첩은 대개 **엣지/면(중 0.5 포함)**. 일반 앵커 피커는 코너만(중 감춤)이지만, **관절 경첩 피커는 축 수직 평면의 3×3 그리드(9점, 중·엣지 포함)** 로 노출 → 사용자가 예상한 "중 나중에 쓰기"가 여기.
- 수학 재사용: 경첩 로컬점 `H = anchorLocalPoint(localBBox, hinge)`, 회전 보정 `rotateAnchorDelta(H, scale, rot0, rot1)`(이미 있음).

### 6.3 런타임 (`src/lib/actuator.ts` 신규 — motion.ts 패턴)
`computeActuator(act, hingeLocal, basePos, baseRot, baseScl, driveValue, out)` — 시각·콜라이더 공유.
- **rotate**: `angle=lerp(min,max,driveValue)°` 축 회전 → `out.quat=baseQuat∘axisQuat(angle)`, 위치보정 `rotateAnchorDelta`로 경첩 고정.
- **slide**: `d=lerp(min,max,driveValue)` 축 방향 이동(회전 반영).
- **driveValue 산출**(뷰어 rAF): `manual`=act.value(정지) / `oscillate`=시간 pingpong / `variable`=변수값 clamp01 / `event`=목표(0/1) 향해 speed/초 부드럽게.
- **적용**: 시각=`ViewerObject`의 MotionGroup/Xform 자리(모션 대신), 에디터=정적 미리보기(act.value) / 콜라이더=`PlayCanvas`의 MovingCollider·MovingGroupCollider 재사용(collider:true만) / **다관절=계층 중첩으로 자동**(부모가 서브트리 이동+자식이 로컬 회전).

### 6.4 게임 로직 연동
- `variable` 구동: 기존 GameVariable+set_variable로 값 조절 → 관절 반영(배선 최소).
- `event` 구동(신규 액션 후보): `EventAction`에 **`set_actuator`**(value=`"objectId|target"`) → 목표 저장 후 매 프레임 이동 → "버튼/근접 → 문 열림".

### 6.5 에디터 UI (`ActuatorSection.tsx` 신규)
헤더 스위치(Physics 패턴) + 종류(회전/직선) + 축 + **경첩 3×3 피커** + 범위(min/max) + 구동 드롭다운(방식별 컨트롤) + **미리보기 슬라이더(value)**(live 채널 실시간) + 콜라이더 토글. motion과 배타 안내.

### 6.6 단계 분할
| 단계 | 내용 | 리스크 |
|---|---|---|
| **5a** | 스키마 + computeActuator(rotate/slide) + 경첩 3×3 피커 + **manual·oscillate** + 시각 적용 + ActuatorSection + 미리보기 | 중 |
| **5b** | **variable·event 구동**(+set_actuator) — 문 여닫기 등 | 중 |
| **5c** | **콜라이더 동반**(플레이 장애물, MovingCollider 재사용) | 중상 |
| **5d**(선택) | 다관절 프리셋(로봇팔)·범위 가이드·min/max 핸들·이징 | 하 |
각 단계: tsc 클린 + 결정론 테스트(각도/경첩 고정) + 브라우저 확인 후 다음.

### 6.7 결정 필요
- **① 경첩 소스**: (A) actuator 전용 `hinge` 필드[권장·스케일 앵커와 분리] / (B) object.pivot 재사용.
- **② event 구동**: (A) 신규 `set_actuator` + variable 둘 다[권장, set_actuator는 5b 후반] / (B) variable만.
- **③ 시작 범위**: 5a(시각 저작)까지 먼저 확인받고 진행 / 5a+5b 묶어 진행.

### 6.8 제약
- **motion과 배타**(둘 다 로컬 변환). 콜라이더=hull 근사·비균일 스케일 왜곡·라이딩 미구현(모션 동일). variable=v1은 clamp01(임의 범위 매핑 후속). slide 콜라이더는 이동만. 하위호환 옵셔널.

---

## 7. 단계별 구현 계획

| Phase | 내용 | 산출물 | 리스크 |
|---|---|---|---|
| **1** | 오브젝트 앵커 스키마 + 수학 + **스케일 앵커**(Size/Scale·기즈모·바닥스냅) + Transform 섹션 **피벗 피커(27점+수치)** | Layer 1 + 피커 | 낮음(기본 중심=무변경) |
| **2** | **핸들 레이어** — 코너 핸들 드래그 스케일 + liveTransform 실시간 + 앵커 고정 | Layer 2(스케일) | 중(3D 평면 결정) |
| **3** | 핸들 **회전** + 회전 기즈모 앵커 통일 + 모디파이어·드래그 HUD | Layer 2(회전) | 중 |
| **4** | **꼭지점 컨텍스트 메뉴** + 기존 기능 항목 연결 + 애니 피벗 통합 | Layer 3 + 통합 | 중 |
| **5** | **액추에이터(관절)** — 축+각도+구동 | 신규 기능 | 상 |

각 Phase: tsc 클린 + 결정론적 단위 테스트 + 브라우저 확인 후 다음.

---

## 8. 위험 / 제약 / 결정 필요 (요약)

- **결정 ①**: 애니 피벗 통합 시점 — (A)단계적[권장] / (B)즉시.
- **결정 ②**: 3D 조작 평면 — 카메라 향한 면 / 로컬 주면 / 모디파이어 전환.
- **결정 ③**: 새 핸들이 기존 기즈모 대체 vs 공존.
- **제약**: 비균일 스케일+회전 동시 앵커는 bbox 근사(표준 도형 정확, GLB/로프트 근사) · 그룹 앵커는 자식 union bbox 기준 · 스케일+회전 동시 미세 드리프트는 케이스별 검증.
- **하위호환**: `pivot` 옵셔널·기본 중심 → normalize/save/prefab이 objects 통과라 자동 보존, 기존 씬 무변경.

---

## 9. 재사용 파일 참조

- `src/lib/animPivot.ts` — pivotOffset(회전 케이스). Layer 1 수학의 기반, 일반화.
- `src/lib/objectBBox.ts` — localBBox/worldBBox/localCenter.
- `src/store/liveTransformStore.ts` — 드래그 중 Inspector 실시간 채널.
- `src/components/ui/ContextMenu.tsx` — 공용 컨텍스트 메뉴(Layer 3).
- `src/app/editor/[projectId]/canvas/GizmoController.tsx` — 프록시 기즈모(회전 이미 cLocal 피벗).
- `src/store/sceneStore.ts` — commitTransforms·floorSnapObject·align/tidy/distribute.
- `src/app/editor/[projectId]/panels/inspector/AnimationClipSection.tsx` — 현재 7-프리셋 피벗 UI(피커로 승격).
