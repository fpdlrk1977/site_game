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

## 9. 동영상 콘텐츠 오브젝트 렌더링

`object.content.type === 'video'` 오브젝트는 URL 형식에 따라 두 가지 방식으로 렌더링한다.

### YouTube URL
- URL에서 영상 ID 추출 (`youtube.com/watch?v=`, `youtu.be/`, `youtube.com/embed/` 패턴)
- 검은 배경 plane + `<Html transform occlude center>` iframe 오버레이 (`https://www.youtube.com/embed/{id}?autoplay=1`)
- `<Html transform>`은 1 CSS px = 1 Three.js 로컬 단위. 컨테이너를 1×1 px로 설정하고 iframe(640×360px)을 `scale(1/640)` CSS 변환으로 축소해 plane 크기에 정확히 맞춤
- 영상 비율 16:9 → 세로 방향 레터박스 (plane 높이의 56.25% 채움)
- 클릭은 배경 mesh에 바인딩

### 직접 URL (MP4, WebM 등)
- `document.createElement('video')`로 HTML video 엘리먼트 생성
- `muted`, `loop`, `playsInline`, `autoplay` 적용 (브라우저 자동재생 정책 준수)
- `THREE.VideoTexture`로 plane mesh에 텍스처 적용
- `meshBasicMaterial`, `toneMapped={false}`, `DoubleSide`

### URL 없는 경우
- 어두운 placeholder plane (`#1a1a2e`) 렌더링

---

## 8. 파티클 이미터 렌더링

`object.particle`이 존재하는 오브젝트는 `<ParticleEmitter>` 컴포넌트로 렌더링한다.

- **컴포넌트**: `src/components/three/ParticleEmitter.tsx`
- **렌더링**: `THREE.Points` + `AdditiveBlending` — 투명 배경에 발광 효과
- **애니메이션**: `useFrame`으로 매 프레임 파티클 위치 업데이트, 수명 초과 시 재방출
- **프리셋**: `fire` / `dust` / `light` / `snow` — 각각 색상·속도·퍼짐 기본값이 다름
- **Physics 무관**: 파티클은 Rapier 콜라이더 없이 항상 렌더링 (`<Physics>` 컨텍스트 외부에서 처리 가능)
- **그룹 자식인 경우**: `ViewerObject` 내에서 부모 그룹의 로컬 좌표로 렌더링
- **InstancedMesh 제외**: `getInstancedIds()`에서 `obj.particle` 존재 시 배칭 대상 제외

### ViewerCanvas 렌더링 분기
```tsx
// 루트 레벨 파티클만 직접 배치 (그룹 자식 파티클은 ViewerObject 내부에서 처리)
{particleObjects.filter((o) => o.parentId === null).map((obj) => (
  <ParticleEmitter key={obj.id} config={obj.particle!}
    position={[obj.position.x, obj.position.y, obj.position.z]} />
))}
```

---

## 7. HTML 오버레이 레이어

- 3D 캔버스 위 `position: absolute` 2D HTML 레이어
- 포함 요소: 팝업 모달, 모바일 조이스틱/점프 버튼, 상단 로고 및 내비게이션
- 3D 컨텍스트(R3F Canvas)와 완전히 격리된 상태를 유지
- 포인터 이벤트: 조이스틱/버튼 영역 외에는 `pointer-events: none`으로 3D 캔버스에 이벤트 통과
