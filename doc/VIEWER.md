# VIEWER: 런타임 뷰어 엔진 명세

---

## 1. 에디터 모듈 격리 원칙

- `TransformControls`, `GridHelper`, `AssetBrowser`, `HierarchyPanel`, `InspectorPanel` 등 에디터 전용 컴포넌트를 절대 import하지 않는다.
- `components/viewer/`와 `components/ui/`만 사용하여 번들을 최소화한다.

---

## 2. 클라이언트 진입 및 렌더링 루프

1. 사용자가 `/space/:sceneId` 접속 → `GET /api/scenes/:sceneId`로 JSON 스키마 fetch
2. JSON의 `objects` 배열에서 중복 없는 `draco_url` 리스트 추출 → `useGLTF.preload()` 일괄 실행
3. 로딩 완료 후 `objects` 배열 순회 → `<SceneObject>` 렌더링 (physics 값에 따라 Rapier 자동 적용)
4. 이벤트 핸들러 바인딩 (`EventHandler`) 및 플레이어 컨트롤러 활성화

---

## 3. 물리 엔진 규격 (@react-three/rapier)

**채택 이유**: WASM 기반 Rapier.js는 R3F 생태계 표준이며, 충돌·중력·점프·센서 감지를 단일 엔진으로 처리한다.
**패키지**: `@react-three/rapier`

### 오브젝트별 Rapier 매핑 규칙

| `physics.enabled` | `physics.isSensor` | Rapier 설정 | 동작 |
|---|---|---|---|
| `false` | - | 콜라이더 없음 | 장식용, 플레이어가 통과함 |
| `true` | `false` | `RigidBody type="fixed"` + 자동 콜라이더 | 벽·바닥·오브젝트 — 플레이어를 막음 |
| `true` | `true` | `RigidBody type="fixed"` + sensor 콜라이더 | `area_enter` 감지 전용, 막지 않음 |

- `colliderType: 'hull'` — 메쉬 외형을 Convex Hull로 자동 계산 (기본값, 대부분의 오브젝트)
- `colliderType: 'trimesh'` — 메쉬 면 단위 정밀 콜라이더 (복잡한 지형용, 성능 주의)
- `colliderType: 'box'` / `'sphere'` / `'capsule'` — 단순 도형 콜라이더 (성능 우선)

---

## 4. 플레이어 컨트롤러 규격

- **RigidBody**: `type="dynamic"` + `CapsuleCollider` (반지름 0.4, 높이 1.6)
- **중력**: Rapier 기본 중력 (`-9.81 m/s²`) 적용
- **이동**: WASD / 방향키 → 수평 velocity 제어 (`useKeyboard` 훅)
- **점프**: `Space` 키 → `useGroundCheck` 훅으로 접지 확인 후 수직 impulse `{ x:0, y:8, z:0 }` 적용
  - 공중 재점프 불가 (접지 판정은 캐릭터 발 아래 방향 raycast 결과 사용)
- **Area Enter 감지**: `isSensor: true` 오브젝트에 `onIntersectionEnter` 콜백 바인딩

### 모바일 컨트롤
- 화면 좌측 하단: 터치식 `VirtualJoystick` (이동)
- 조이스틱 우측: Jump 버튼
- 두 컨트롤 모두 HTML 오버레이 레이어에 위치 (3D 컨텍스트 분리)

---

## 5. 팔로우 카메라 규격

- 캐릭터를 중심에 두고 고정 거리 · 고정 각도(쿼터뷰)를 유지하는 `FollowCamera`
- 매 프레임 캐릭터 RigidBody 위치를 lerp로 추적 (급격한 이동 방지)
- 점프 시 카메라 Y축을 자연스럽게 보정

---

## 6. 레이캐스팅 및 이벤트 처리 (`EventHandler.tsx`)

- 매 프레임 마우스 포인터 위치 기반 레이캐스터 실행
- `trigger: 'hover_enter'` 오브젝트 위 마우스 진입 시: Outline 이펙트 활성화 + `cursor: pointer`
- `trigger: 'click'` 오브젝트 클릭 시 `action`에 따라 핸들러 분기:
  - `open_url` → `window.open(value, '_blank')`
  - `show_popup` → `uiStore.openPopup(value)`
- `trigger: 'area_enter'` 는 Rapier `onIntersectionEnter` 콜백으로 처리 (레이캐스트 불사용)

---

## 7. HTML 오버레이 레이어

- 3D 캔버스 위 `position: absolute` 2D HTML 레이어
- 포함 요소: 팝업 모달, 모바일 조이스틱/점프 버튼, 상단 로고 및 내비게이션
- 3D 컨텍스트(R3F Canvas)와 완전히 격리된 상태를 유지
- 포인터 이벤트: 조이스틱/버튼 영역 외에는 `pointer-events: none`으로 3D 캔버스에 이벤트 통과
