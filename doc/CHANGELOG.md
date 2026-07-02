# CHANGELOG: 변경 이력 및 빌드 스냅샷

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