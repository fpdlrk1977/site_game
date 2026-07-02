# CHANGELOG: 변경 이력 및 빌드 스냅샷

## [0.7.0] - 2026-07-03
### 에디터 레이아웃 재구성 — GNB 레일 도입, 에셋 브라우저 통합

#### 배경
좌측 패널의 Assets 탭(`LeftPanel`의 `AssetsTabContent`)과 하단 Asset Browser가 기능 중복이었음. 하단 쪽이 상위 호환(썸네일·검색·hover 3D 프리뷰·텍스처 자동 임베드·Character 탭)이므로 하단 것을 좌측 패널로 이동시키고 좌측 자체 Assets 탭은 제거. ROADMAP Phase B(B-1/B-2)에 계획되어 있던 방향과 일치.

#### 추가
- **GNB 레일** (`EditorGnb.tsx` 신규): 헤더 아래 최좌측 48px 세로 레일. 좌측 패널과 별개의 상시 고정 영역(패널을 접어도 유지)
  - 상단 그룹: **Object** / **Assets** — 클릭 시 좌측 패널 콘텐츠 전환, 활성 탭 재클릭 시 패널 접기/펼치기
  - 하단 그룹: **설정** / **계정** — `useDropdown({ placement: 'right' })` 기반 우측 드롭다운 메뉴
  - 설정 메뉴: 다크/라이트 테마 전환(헤더에서 이동), 공유/임베드(`ShareModal` 재사용, `scenes.is_published` 지연 조회), 커스텀 도메인(`CustomDomainModal` 재사용, `projects.custom_domain` 지연 조회)
  - 계정 메뉴: 로그인 이메일 표시(지연 조회), 계정 설정(`/account`) 링크, 로그아웃(POST `/api/auth/signout`)
- `useDropdown`에 `placement: 'bottom' | 'right'` 옵션 추가 — 세로 레일에서 오른쪽으로 펼쳐지는 메뉴 지원

#### 변경
- **`AssetBrowser.tsx`**: 하단 전체폭 독(가로 스크롤 행 + 88px 세로 탭) → 좌측 패널 폭(240px)용 세로 레이아웃(탭 pill 줄바꿈 + 2열 카드 그리드)으로 재구성. 기능(업로드·썸네일·검색·프리뷰·텍스처 임베드)은 전부 유지. **Lights 탭 추가**(기존 좌측 Assets 탭에만 있던 라이트 배치 기능 이식 — 기능 손실 방지)
- **`LeftPanel.tsx`**: 자체 Objects/Assets 탭바와 중복 `AssetsTabContent`(구식 업로드 로직 포함) 삭제 → GNB 선택을 받아 `HierarchyPanel` 또는 `AssetBrowser`를 표시하는 단순 호스트로 축소
- **`EditorClient.tsx`**: 그리드 `[좌측패널|뷰포트|Inspector] × [헤더|본문|하단독]` → `[GNB|좌측패널|뷰포트|Inspector] × [헤더|본문]`으로 단순화. 하단 독과 `bottomOpen` 토글 제거. 좌측 토글은 콘텐츠 패널만 접고 GNB 레일은 유지
- **`ViewportToolbar.tsx`**: 테마 토글 버튼 제거 (GNB 설정 메뉴로 이동)
- **`EditorOnboarding.tsx`**: "하단 에셋 브라우저" 안내 문구를 GNB Assets 기준으로 수정

---

## [0.6.2] - 2026-07-02
### 플레이어 컨트롤러 재작성 — 경사면/지형 통과 버그 근본 수정

#### 문제
W(전진) + 점프로 가파른 지형(산 등)에 부딪히면 캐릭터가 뚫고 넘어가거나, 멈춘 듯 서서히 흘러내리는 현상이 반복 보고됨. 여러 차례 임계값 패치를 시도했으나 재발.

#### 원인
기존 `PlayModeController`는 dynamic `RigidBody`를 매 프레임 `setLinvel`/`setTranslation`으로 강제 덮어쓰는 방식이었음. Rapier 충돌 솔버가 경사면 접촉으로 밀어올린 위치를 스크립트가 다시 스냅백하는 핑퐁 구조였고, 특히 **점프 상승 구간(`jumpActiveRef` true)에서는 이 스냅백 로직 자체가 완전히 비활성화**되어 있어 W+점프로 지형에 부딪히는 정확히 그 상황에서 보호 장치가 작동하지 않았음. 추가로 `isGrounded` 판정이 raycast가 아닌 절대 Y좌표(`pos.y < 1.5`) 하드코딩이었고, 산 같은 오목 지형에도 볼록 껍질(`hull`) 콜라이더만 사용되고 있었음.

#### 수정
- `PlayModeController`의 플레이어 바디를 dynamic → **`kinematicPosition`**으로 전환, Rapier의 `world.createCharacterController()`(`KinematicCharacterController`) 기반 move-and-slide 방식으로 재작성
- `setMaxSlopeClimbAngle` / `setMinSlopeSlideAngle` (46°)로 오를 수 있는 경사각을 엔진 레벨에서 명시적으로 제한 — 이 각도보다 가파른 지형은 물리적으로 등반 불가, 자동으로 미끄러져 내려옴
- `enableAutostep(0.3, 0.2, true)`로 낮은 턱/계단만 자동으로 넘어가도록 허용(큰 지형은 영향 없음), `enableSnapToGround(0.3)`로 미세 지면 요철에서의 튐 방지
- 중력을 수동 적분(`verticalVelRef`)하는 방식으로 변경, 접지 여부는 `computedGrounded()`(실제 지오메트리 접촉 판정)로 대체 — 절대 Y좌표 하드코딩 제거
- 매 프레임 위치 강제 텔레포트(`setTranslation`) 로직 완전 제거 — 스크립트와 물리 솔버의 소유권 경합 해소

#### 후속 수정 — AutoCollider hull → trimesh
0.6.2 배포 후에도 W+점프로 산을 넘어가는 현상이 재현됨. 원인은 `PlayCanvas.tsx`의 `AutoCollider`(physics.enabled가 꺼진 — 즉 기본값 그대로인 — 오브젝트에 자동으로 고정 콜라이더를 부여하는 컴포넌트)가 박스/구체가 아닌 모든 GLB를 `hull`(볼록 껍질)로 근사하고 있었기 때문. 볼록 껍질은 오목한 지형(산의 굴곡, 급경사, 오버행)을 실제보다 완만하게 뭉개버려서, `MAX_SLOPE_CLIMB_DEG` 각도 제한이 정상 작동해도 애초에 "덜 가파른 지형"으로 인식되어 통과됨. `ObjectNodeSchema`의 물리 기본값이 `physics.enabled: false`(`DEFAULT_PHYSICS`)이므로, 에셋 브라우저로 배치만 하고 Physics 패널을 건드리지 않은 일반적인 산/바위 오브젝트는 전부 이 경로를 탄다.
- `AutoCollider`의 콜라이더 매핑을 `hull` → **`trimesh`**로 변경 (`type="fixed"` 바디는 오목한 trimesh를 안전하게 사용 가능 — convex 제약은 dynamic 바디에만 적용됨). 이제 실제 GLB 메쉬 형태 그대로 충돌 처리되어, 로컬하게 가파른 절벽/오버행이 실제로 가파르게 판정됨

#### 검토: "일반적인 게임의 처리 방식" 4가지 대조
사용자가 조사한 대표적 해법과 현재 구현을 대조한 결과:
- **① 법선 벡터 기반 경사각 제한**: Rapier `KinematicCharacterController`가 `setMaxSlopeClimbAngle`/`setMinSlopeSlideAngle`로 이미 엔진 네이티브 레벨에서 수행 중 (0.6.2에 적용). 직접 재구현할 필요 없음
- **② 벽면 슬라이딩(속도 투영)**: `computeColliderMovement` + `slideEnabled(true)`가 move-and-slide 스윕 테스트로 이미 처리. 수동으로 `Velocity - Dot(Velocity, Normal) * Normal` 재구현 시 기존에 고쳤던 "스크립트 vs 솔버 경합" 버그가 재발할 위험이 있어 권장하지 않음
- **③ 마찰력 0**: 플레이어 캡슐 콜라이더는 이미 `friction={0}` 적용됨. 다만 KinematicCharacterController 방식에서는 경사 통과 여부가 마찰이 아닌 슬로프 각도 판정으로 결정되므로 영향은 제한적
- **④ 단순화된 충돌 메쉬 / 투명 벽**: 이번에 실제로 누락되어 있던 부분. `hull` → `trimesh` 전환으로 지형 정확도를 개선함. 그래도 특정 구역을 100% 차단하고 싶다면(디자인 의도상 절대 불가 지역), 해당 산 GLB와 별도로 눈에 안 보이는 단순 Box/Cylinder 콜라이더 오브젝트를 겹쳐 놓는 방식(Invisible Wall)을 여전히 권장 — 현재 에디터에서도 투명 오브젝트(visible: false + physics.enabled: true)로 구현 가능

#### 후속 수정 — 오토스텝(autostep) 비활성화
trimesh 전환 후에도 "점프를 여러 번 반복하면 결국 산을 넘어간다"는 현상이 재현됨. 단번에 넘어가는 게 아니라 "여러 번 시도해야" 넘어간다는 점이 단서 — 이는 경사각 제한이 뚫린 게 아니라, `enableAutostep(0.3, 0.2, true)`가 매 점프 착지마다 조금씩 캐릭터를 밀어 올리는 누적 현상이었을 가능성이 높음. 저폴리곤 산 메쉬(GLB)는 표면이 완전히 매끈한 경사면이 아니라 작은 계단 모양 facet들로 쪼개져 있는 경우가 많은데, 오토스텝은 이런 작은 턱(최대 0.3m)을 정당한 "계단"으로 간주해 자동으로 올라타게 해준다. 이 기능이 경사각 판정과 별개의 경로로 동작하기 때문에, `maxSlopeClimbAngle`이 정상 작동해도 오토스텝이 반복 적용되며 경사각 제한을 우회해 서서히 정상을 넘어갈 수 있었음.
- `PlayModeController.tsx`에서 `enableAutostep` 호출 제거, `controller.disableAutostep()`으로 명시적 비활성화
- 이 게임에는 별도 계단 오브젝트/기능이 없어 오토스텝의 실사용 이점이 크지 않고, 지형 등반 우회의 위험이 더 크다고 판단해 완전 비활성화함. 추후 작은 턱(요철 바닥 등)이 걸리적거리면 `enableAutostep(0.1, 0.1, false)`처럼 훨씬 작은 값으로 재도입 검토 가능

#### 후속 수정 — 진짜 근본 원인 발견: `computedGrounded()`가 경사각을 무시함
trimesh 전환 + 오토스텝 비활성화 후에도 "점프를 여러 번 반복하면 산을 넘어간다"는 현상이 계속 재현됨. 브라우저/로그인 없이 `@dimforge/rapier3d-compat`만으로 60도 경사로(제한각 46도보다 훨씬 가파름) + 동일한 `PlayModeController` 로직을 격리 재현하는 시뮬레이션 스크립트를 작성해 검증한 결과, 실제 원인을 특정함:

**`KinematicCharacterController.computedGrounded()`는 `setMaxSlopeClimbAngle()` 설정과 무관하게, 발밑에 어떤 접촉이든 있으면(각도 상관없이) `true`를 반환한다.** 순수 걷기(수평 이동만)로는 60도 경사면에 막혀 더 못 감(경사각 제한이 정상 작동하는 것처럼 보임) — 하지만 일단 점프로 그 경사면 위에 올라서면, `computedGrounded()`가 `true`를 반환하므로 게임 로직이 "접지 상태"로 착각해 그 자리에서 **또 점프를 허용**한다. 이 잘못된 재점프가 매번 조금씩 더 높이/앞으로 캐릭터를 밀어 올리고, 반복될수록 산 정상까지 누적 등반이 가능해짐. (격리 시뮬레이션: 기존 로직은 15초 반복 점프 후 정상 근처 z=13.7/15, y=16.4/17.3까지 도달 — 명백한 버그 재현. 수정 로직은 50초·수십 회 반복 점프 후에도 z=4.76(경사로 진입 지점 밖)에서 벗어나지 못함 — 정상 차단 확인)

- `PlayModeController.tsx`에서 `controller.computedGrounded()` 원값을 그대로 쓰지 않고, `controller.numComputedCollisions()` / `computedCollision(i).normal1`로 이번 프레임의 모든 접촉면 노멀 각도를 직접 계산해 "걸을 수 있는 각도(≤46°)의 접촉이 하나라도 있을 때만" 진짜 접지로 인정하도록 변경. 이 "trueGrounded" 값을 점프 허용 여부와 낙하 속도 리셋에 사용
- 결과적으로 46°보다 가파른 면 위에서는 재점프가 원천 차단되고, 중력이 정상적으로 캐릭터를 끌어내림

#### 남은 과제 (별도 확인 필요)
- 경사각 임계값(46°)은 실제 산 에셋의 형태를 보고 튜닝 필요할 수 있음 (`PlayModeController.tsx` 상단 `MAX_SLOPE_CLIMB_DEG`)
- `PhysicsObject.tsx`(physics.enabled를 사용자가 직접 켠 오브젝트)의 `colliderType` 기본값도 `'hull'`(`DEFAULT_PHYSICS`) — 사용자가 Inspector에서 직접 `trimesh`로 바꾸지 않는 한 동일한 문제가 재발할 수 있음. 다만 이 기본값은 mass>0(dynamic) 오브젝트에도 공유되고, dynamic 바디에는 trimesh가 부적합/불안정하므로 전역 기본값을 바꾸기보다 산처럼 큰 정적 지형에는 사용자가 Inspector에서 명시적으로 `trimesh`를 선택하도록 안내하는 편이 안전함
- 100% 확실한 차단이 필요한 구역(디자인상 절대 진입 불가)은 이번 수정 이후에도 메쉬 정확도에 의존하지 않는 별도의 투명 Box/Cylinder 콜라이더(Invisible Wall)를 덧대는 것을 권장

---

## [0.6.1] - 2026-07-02
### 환경 편집 고도화 + 버그 수정

#### 추가
- **바닥(Ground) 시스템**: `GroundPlane.tsx`(신규), `groundTextures.ts`(신규) — grass/dirt/sand/stone 절차적 노이즈 텍스처(노멀맵 자동 생성) + water 프리셋(`MeshReflectorMaterial` 실시간 반사) + 커스텀 URL 텍스처 업로드. `EnvSchema.ground: { enabled, color, preset?, textureUrl? }`. Inspector Environment "Ground" 섹션. EditorCanvas + ViewerCanvas 적용
- **HDR 환경 프리셋**: `sky.type`에 `'sky'`(물리 기반 하늘, drei `<Sky>`) 추가. `HdrPreset` 10종(sunset/dawn/night/warehouse/forest/apartment/studio/city/park/lobby, drei `<Environment preset>`) — Sky/HDR/단색 배경 상호 배타 렌더링. Inspector Environment "Sky" 섹션에서 3-way 선택
- **씬 경계(Boundary)**: `EnvSchema.boundary` — 에디터·뷰어에 노란색 와이어프레임 박스(`BoundaryGizmo`)로 시각화, 플레이 모드에서는 4면 `RigidBody`(friction=0) 충돌 벽으로 실제 이동 제한. Inspector Environment "Boundary" 섹션
- **GLB 에셋 썸네일 자동 생성**: `glbThumbnail.ts`(신규) — 업로드 시 오프스크린 WebGL 렌더로 256×256 PNG 캡처 → Storage 업로드 → `AssetRefSchema.thumbnailUrl`. AssetBrowser 카드에 실제 모델 썸네일 표시 (실패해도 업로드는 정상 처리)

#### 수정
- **PlayModeController 경사면 버그**: 점프 Y속도와 경사면(cuboid 모서리 등) 반발력의 양수 Y속도가 구분되지 않아 캐릭터가 경사면에 걸려 공중에 뜨는 현상 → `jumpActiveRef` + 이전 프레임 Y위치 비교로 분리, 낙하(음수)는 허용하고 경사면 반발(양수)만 차단
- **경계 벽 물리**: `friction=0`으로 벽에 눌렸을 때 공중에 걸리는 현상 방지

#### 변경
- `EnvSchema`: `sky.type`에 `'sky'` 추가, `hdrPreset?`, `ground?`, `boundary?` 필드 추가
- `AssetRefSchema`: `thumbnailUrl?` 추가

---

## [0.6.0] - 2026-07-02
### Wave 3 고도화 기능 (3개)

#### 추가
- **에셋 3D 프리뷰 (W3-1)**: AssetBrowser Models 탭에서 GLB 카드에 마우스를 올리면 160×160 팝업에 미니 R3F Canvas로 모델을 3D 렌더 + 자동 회전. `AssetPreviewPopup.tsx`(신규) — createPortal(document.body)로 overflow:hidden 탈출, Bounds(drei) 자동 fit, Suspense 로딩
- **포스트 프로세싱 프리셋 (W3-2)**: `@react-three/postprocessing` 설치. `PostProcessingEffects.tsx` 공유 컴포넌트. 4가지 프리셋:
  - **Cinematic**: Bloom(mild) + Vignette(moderate)
  - **Dreamy**: Bloom(high) + ChromaticAberration + Vignette(soft)
  - **Vintage**: Vignette(hard) + Noise
  - **Sharp**: Bloom(very high threshold) + Vignette(subtle)
  - Inspector Environment "Post Processing" 섹션 2열 버튼 UI. `EnvSchema.postProcessing?.preset` 저장. EditorCanvas + ViewerCanvas 적용
- **라이트 오브젝트 (W3-3)**: PointLight / SpotLight / DirectionalLight를 씬 오브젝트로 추가.
  - `LightType`, `LightConfig` 타입 (`types/scene.ts`), `ObjectNodeSchema.light?` 필드
  - `sceneStore.addLightObject(type)` 액션
  - LeftPanel Assets → Lights 탭 (💡/🔦/☀️ 버튼)
  - CommandPalette에 라이트 추가 커맨드 3종
  - 에디터: `LightObjectInstance` — 팔면체 아이콘(색상별), glow ring, Spot은 콘 와이어프레임, 선택 하이라이트, 실제 Three.js 라이트도 렌더(에디터에서 조명 효과 미리보기)
  - Inspector "Light" 섹션: Type / Color / Intensity / Distance / Decay / Angle(spot) / Penumbra(spot) / Cast Shadow
  - ViewerCanvas + PlayCanvas: 씬 라이트 오브젝트를 실제 Three.js 라이트로 렌더

#### 변경
- `EnvSchema`: `postProcessing?: { preset: PostProcessPreset }` 추가
- `ObjectNodeSchema`: `light?: LightConfig` 추가
- `PlayCanvas`: 라이트 오브젝트를 physics 체인에서 제외(콜라이더 부여 방지)

---

## [0.5.0] - 2026-07-02
### Wave 2 UI/UX 개선 (9개 기능)

#### 추가
- **커맨드 팔레트** (`CommandPalette.tsx`): Ctrl+K로 오픈, 오브젝트·에디터 액션 통합 검색. 그룹 분류(보기/편집/추가/오브젝트), 키보드 ↑↓ 탐색, Enter 실행, ESC 닫기
- **스폰 포인트 설정**: `EnvSchema.playerStartPosition` 추가 → Inspector Environment "Spawn Point" 섹션 XYZ 입력. 뷰포트에 녹색 마커(기둥+화살표+링) 시각화 (`SpawnMarker` in EditorCanvas)
- **플레이어 속도/점프 설정**: `EnvSchema.playerSpeed` / `EnvSchema.playerJumpForce` → Inspector 슬라이더 → `PlayModeController` props로 전달 (speed 기본 5, jumpForce 기본 12)
- **트리거 영역 시각화 개선**: `ColliderOverlay`에서 센서 오브젝트는 wireframe + 반투명 채운 볼륨 동시 표시 (파란색), 일반 콜라이더는 녹색 wireframe
- **이벤트 프리뷰**: 이벤트 카드에 ▶ 테스트 버튼 추가. `open_url`→ 새 탭 열기, `show_popup`→ Inspector 내 오버레이 팝업, `emit_event`→ 토스트 알림
- **속성 복사/붙여넣기**: `Ctrl+Shift+C` material+physics 복사, `Ctrl+Shift+V` 선택 오브젝트에 붙여넣기. `sceneStore.copyObjectProperties` / `pasteObjectProperties` 액션
- **씬 메모**: `EnvSchema.notes` → Environment 패널 하단 "씬 메모" textarea. 씬 데이터로 자동 저장
- **다중 선택 일괄 편집**: 다중 선택 시 Inspector에 "일괄 편집" 섹션 추가 — Color 컬러피커(material 있는 오브젝트 전체), Visible/Physics Enabled 토글 일괄 적용 (`batchUpdateObjects` 스토어 액션)
- **수식 입력**: `NumInput` onBlur 시 `1+2`, `3*0.5` 등 수식 자동 계산. `evalMath` 함수 — 숫자/연산자/괄호만 허용하는 안전한 `Function()` 평가

#### 변경
- `PlayCanvas`: `spawnPosition`, `playerSpeed`, `playerJumpForce` 환경 설정에서 읽어 `PlayModeController`에 전달
- `sceneStore`: `copiedProperties` 상태, `copyObjectProperties`, `pasteObjectProperties`, `batchUpdateObjects` 추가
- `EditorClient`: `Ctrl+K` 커맨드 팔레트, `Ctrl+Shift+C/V` 속성 복사/붙여넣기 단축키 등록

---

## [0.4.0] - 2026-07-02
### 추가
- **GLB 캐릭터 시스템** (FEAT-CHARACTER-01): AssetBrowser "Character" 탭에서 GLB 업로드 → Inspector "Player" 섹션에서 캐릭터/스케일 할당 → 플레이 모드에서 idle/walk/jump 애니메이션 자동 탐색 및 전환 (`GlbCharacter` 컴포넌트, `SkeletonUtils.clone`)
- **플레이 모드 전체 충돌** (`AutoCollider`): `physics.enabled` 관계없이 씬의 모든 루트 오브젝트에 `RigidBody type="fixed"` 고정 콜라이더 자동 부여 (box→cuboid, sphere→ball, 그 외→hull)
- **스마트 툴팁** (`Tooltip.tsx`): `createPortal` + `getBoundingClientRect` 기반 뷰포트 경계 자동 회피 위치 조정, `bg-foreground text-background` 색상 반전
- **에디터 레이아웃 리디자인**: Header/Toolbar 분리, ViewportFloatingToolbar(뷰포트 내부 floating), LeftPanel(Objects/Assets 탭), ViewportOrientationGizmo(XYZ 기즈모), ViewportStatusBar
- **드래그 박스 셀렉트**: 뷰포트 빈 공간 좌클릭 드래그 → 범위 내 오브젝트 다중 선택 (`boxSelectState.ts`)
- **오브젝트 정렬 UI**: ViewportToolbar 정렬 드롭다운, X/Y/Z축 × min/center/max 9개 버튼
- **계정 설정 페이지** (`/account`): 표시 이름 편집, 비밀번호 변경, 플랜 표시
- **Event Bridge 엔드투엔드 테스트** (`/test/event-bridge`): iframe + 실시간 이벤트 로그 페이지

### 수정
- **Pro 플랜 미인식 버그**: 에디터 `page.tsx`에서 `users_plan` 조회 + `UserInitializer` 렌더링 누락 → 수정 완료
- **버전 복구 후 저장 버튼 비활성**: 버전 복구 시 `isModified: false` 유지 → `markModified()` 스토어 액션 추가 후 복구 콜백에서 호출
- **다크 모드 CSS 캐스케이드**: `@layer base`(`:root`/`.dark` raw vars) + `@theme inline`(`var()` 참조) 2-tier 구조 재작성
- **PCFSoftShadowMap 경고**: `shadows="soft"` → `shadows="percentage"` (Three.js r185 deprecated 대응)
- **PlayCanvas 그룹 트랜스폼**: `!o.parentId` 루트 오브젝트만 Physics에 전달 (H-6)
- **MultiGizmo rotate/scale 저장**: 쿼터니언 델타 + 스케일 팩터 방식 onChange 전파 (H-7)
- **EditorObjectInstance Rules of Hooks**: 얼리 리턴이 두 `useEffect` 앞에 있던 문제 수정 (C-1)

### 변경
- **폰트**: Geist Sans → Inter
- **Inspector 섹션 헤더**: `uppercase tracking-wider` → `tracking-wide` (Title Case 표기)

---

## [0.3.0] - 2026-06-30
### 추가
- **다중 선택**: 에디터 캔버스 Shift+클릭으로 여러 오브젝트 동시 선택 (`toggleSelectObject`, `selectedIds`)
- **HierarchyPanel 범위 선택**: Shift+클릭으로 flatList 기반 범위 선택 (anchorIndexRef 패턴)
- **MultiGizmo**: 다중 선택 오브젝트들의 centroid에 TransformControls — 동시 이동 지원
- **그룹 시스템**: Ctrl+G 그룹화 / Ctrl+Shift+G 해제. `isGroup` 플래그, `GroupObjectInstance`, 부모-자식 계층 좌표 변환, `groupSelected` / `ungroupSelected` 스토어 액션
- **HierarchyPanel 트리 구조**: 레이어 탭 제거, 재귀 트리(들여쓰기 16px/depth), 그룹 펼치기/접기(▶/▼), 검색 시 전체 펼침
- **파티클 이미터 (FEAT-PARTICLE-01)**: `ParticleEmitter` 컴포넌트(Three.js Points + AdditiveBlending), 4가지 프리셋(fire/dust/light/snow), AssetBrowser 파티클 탭, InspectorPanel Particle 섹션, 에디터+뷰어 렌더링
- **Supabase 마이그레이션 완료**: `0004_analytics.sql`(scene_events), `0005_scene_versions.sql`(scene_versions) 실행
- **scene_versions RLS 수정**: `FOR ALL USING` → `FOR SELECT USING` + `FOR INSERT WITH CHECK` + `FOR DELETE USING` 분리
- **scene_versions version 컬럼 제거**: 테이블에 불필요한 `version NOT NULL` 컬럼 `DROP COLUMN`

## [0.2.0] - 2026-06-29
### 추가
- Phase 0~4 전체 구현 완료 (Auth, Dashboard, Editor, Viewer, Physics, Analytics, Templates, Content Objects, Version History, Particle Emitter 등)
- Supabase Auth, 프로젝트/씬 CRUD, 플랜 게이팅
- R3F 에디터 캔버스, TransformControls, Undo/Redo
- Rapier 물리 엔진, 플레이어 컨트롤러, 팔로우 카메라
- GLB 에셋 업로드, 텍스트/이미지 콘텐츠 오브젝트
- InstancedMesh 자동 전환, Material 에디터
- 임베드 모드(/embed/[sceneId]), Event Bridge postMessage
- 씬 버전 히스토리, 씬 템플릿 라이브러리
- 분석 통계(scene_events), "Powered by Park3D" 배지

## [0.1.0] - 2026-03-24
- 초기 AI 지향 아키텍처 스펙 설계 및 JSON 데이터 스키마 확정.
- 프로젝트 전체 디렉토리 및 마일스톤 로드맵 수립.