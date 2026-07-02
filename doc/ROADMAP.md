# ROADMAP: 개발 단계 및 마일스톤

## UI 리디자인 로드맵 (2026-07-01 결정)

> **기준 디자인**: `doc/ChatGPT Image 2026년 7월 1일 오전 09_47_49.png`
> Spline/Figma 스타일 3패널 에디터. 라이트 모드 기준, 다크 모드 토글 지원.
> 세부 명세는 `doc/UI_EDITOR.md` 참조.

### Phase A — 낮은 리스크 (빠른 효과)
기존 구조를 유지하면서 시각적 완성도를 높이는 작업.

| 태스크 | 파일 | 내용 |
|---|---|---|
| A-1 | `ViewportToolbar.tsx` | 텍스트 버튼 → 아이콘 버튼 + hover 툴팁 (단축키 표시) |
| A-2 | `EditorClient.tsx` (헤더) | 프로젝트명 — 씬명 헤더 바 추가 (미저장 `•` 표시 포함) |
| A-3 | `canvas/ViewportStatusBar.tsx` | Canvas 하단 Position/Rotation/Scale 실시간 표시 |
| A-4 | `HierarchyPanel.tsx` | 오브젝트 타입별 아이콘 강화, 트리 들여쓰기 선 |
| A-5 | `AssetBrowser.tsx` | Models/Materials/Textures/HDR/Audio 탭 구조 추가 (미구현 탭은 "준비 중" 표시) |

### Phase B — 중간 리스크 (레이아웃 재구성)
컴포넌트 위치/구조 변경. 기능에는 영향 없음.

| 태스크 | 파일 | 내용 |
|---|---|---|
| B-1 | `EditorClient.tsx` | 레이아웃 재구성: AssetBrowser를 하단 띠 → 왼쪽 패널 하단으로 이동 |
| B-2 | `AssetBrowser.tsx` | 가로 스크롤 → 세로 2열 그리드로 전환 |
| B-3 | `InspectorPanel.tsx` | 섹션 구분 헤더 디자인 개선, Material 타입 선택기 추가 |
| B-4 | `InspectorPanel.tsx` | Interactions 섹션 UI 개선 (URL 입력 + Add 버튼 스타일) |

### Phase C — 높은 리스크 (테마 시스템)
전체 컴포넌트 색상 클래스 교체. 충분한 일정 확보 후 진행.

| 태스크 | 상태 | 내용 |
|---|---|---|
| C-1 | ✅ 완료 | CSS 변수 기반 테마 토큰 정의 — `globals.css` `@layer base` + `@theme inline` 2-tier 구조 |
| C-2 | ✅ 완료 | 에디터/대시보드/계정 페이지 전체 하드코딩 색상 → Tailwind CSS 변수 클래스 교체 |
| C-3 | ✅ 완료 | 라이트/다크 토글 버튼 + `localStorage` 저장 (`ThemeProvider`, `ThemeToggle`) |
| C-4 | 🟡 부분 구현 (2026-07-02) | drei `<Environment preset>` 기반 HDR 프리셋 10종(sunset/dawn/night 등) 적용 완료. 사용자 커스텀 HDR 파일 업로드(`RGBELoader` + Supabase storage)는 미구현 |

---

## Phase 0: 진입 및 프로젝트 관리 기반
- 목표: 로그인 → 대시보드 → 에디터 진입까지의 흐름 완성. 씬/프로젝트 CRUD.
- 핵심 마일스톤: 신규 프로젝트 생성 후 에디터까지 막힘 없이 이동 가능.

### 태스크

#### [P0-01] Supabase Auth 연동
- Supabase 이메일/비밀번호 + Google OAuth 설정
- `/login` 페이지, 세션 미들웨어, 로그인/로그아웃 처리
- 예상 소요: 1일

#### [P0-02] 대시보드 페이지
- 프로젝트 카드 그리드, 신규 프로젝트 생성 모달
- 프로젝트 생성 시 기본 씬 자동 생성 후 에디터 이동
- 예상 소요: 1일

#### [P0-03] 씬 관리 드로어
- 프로젝트별 씬 목록, 씬 추가/삭제/전환
- 에디터 상단 씬 드롭다운 연동
- 예상 소요: 1일

#### [P0-04] 프로젝트 설정 페이지
- 커스텀 도메인, 임베드 코드, Event Bridge 가이드 표시
- 예상 소요: 0.5일

#### [P0-05] 플랜 게이팅 시스템 기반 구축
- `users_plan` 테이블 마이그레이션 추가
- `lib/planGates.ts` — 플랜별 기능·수량 제한 단일 정의 (PLAN_SPEC.md)
- `lib/checkPlan.ts` — 서버 사이드 검증 유틸
- `hooks/usePlan.ts` — 클라이언트 훅
- `components/ui/PlanGate.tsx` + `UpgradeBanner.tsx`
- `store/userStore.ts` — planTier 포함
- 로그인 완료 시 users_plan 조회하여 userStore에 세팅
- 예상 소요: 1일

**Phase 0 합계 예상: 약 4.5일**

---

## Phase 1: MVP 코어 구축 (기능 검증)
- 목표: 단일 캔버스 위에 마우스로 큐브를 스폰하고, 기즈모로 조작한 뒤 JSON으로 콘솔 출력.
- 핵심 마일스톤: Zustand 스토어 - R3F 캔버스 - TransformControls 삼각 동기화 완료.

### 태스크

#### [P1-01] EditorCanvas + 기즈모 기본 연동
- R3F Canvas 세팅, editorStore 연결, TransformControls (translate/rotate/scale)
- OrbitControls 연동 (기즈모 드래그 중 비활성화)
- 예상 소요: 2일

#### [P1-02] Hierarchy + Inspector 패널
- parentId 트리 렌더링, 선택/visible/locked 토글
- Transform 섹션 양방향 바인딩, Physics/Events 섹션 UI
- 예상 소요: 2일

#### [P1-03] Undo / Redo 시스템
- Delta 방식 히스토리, 최대 50스텝
- Ctrl+Z/Y 단축키, addObject/removeObject 자동 기록
- 예상 소요: 1일

#### [P1-04] 기본 도형 스폰 (Primitive Shapes)
- Box / Sphere / Cylinder / Plane — .glb 없이 즉시 배치 가능
- Three.js 기본 Geometry 사용, ObjectNodeSchema와 동일하게 저장
- 에셋 브라우저 상단에 기본 도형 탭 추가
- 예상 소요: 0.5일

#### [P1-05] 에디터 UX 기본기 (Quick Wins 묶음)
- **스냅 기능**: ViewportToolbar에 스냅 토글 + 간격 선택 (0.25 / 0.5 / 1 / 2). 기즈모 드래그 시 Three.js TransformControls `translationSnap` / `rotationSnap` 적용
- **Focus (F키)**: 선택 오브젝트 바운딩박스 중심으로 OrbitControls target + 카메라 이동
- **오브젝트 이름 인라인 편집**: Hierarchy 항목 더블클릭 → `<input>` 전환 → blur 시 editorStore 업데이트
- **오브젝트 검색**: Hierarchy 상단 검색창 → 이름 필터링 (대소문자 무시)
- **카메라 북마크**: `[뷰 저장]` 버튼으로 현재 카메라 앵글 저장, 단축키(1~5)로 복귀
- **배경 그리드 설정**: ViewportToolbar에서 그리드 간격 (0.5/1/5) 및 on/off 토글
- 예상 소요: 2일

#### [P1-07] WebGL 폴백 + 에러 상태 처리
- WebGL 미지원 감지 → 안내 화면 표시 (Canvas 렌더링 전 단계에서 체크)
- 에디터 화면 너비 1280px 미만 → "PC에서 이용해 주세요" 화면
- `uiStore`에 `error: string | null` 필드 추가 → 전역 에러 토스트 컴포넌트
- 씬 fetch 실패 / 저장 실패 / 업로드 실패 각각의 에러 메시지 정의
- 예상 소요: 1일

**Phase 1 합계 예상: 약 9.5일**

#### [P1-06] 와이어프레임 + 콜라이더 시각화
- ViewportToolbar 토글: `[솔리드 / 와이어프레임]` 전환
- physics.enabled 오브젝트에 반투명 콜라이더 경계 박스 오버레이 표시 (에디터 전용)
- isSensor 오브젝트는 파란색, 일반 콜라이더는 초록색 표시
- 예상 소요: 1일

**Phase 1 합계 예상: 약 8.5일**

## Phase 2: 퍼블리싱 파이프라인 (클라우드 동기화)
- 목표: Supabase 연동 저장, 에셋 업로드, 런타임 뷰어 독립 배포 + 커스텀 도메인 + 임베드 모드.
- 핵심 마일스톤: 에디터 코드가 포함되지 않은 `/space/:sceneId` 구동 + 기존 사이트에 script 태그 한 줄로 3D 월드 삽입 가능.

### 태스크

#### [P2-01] Scene Viewer `/space/[sceneId]`
- SSR 서버 컴포넌트에서 scene_data 로드 (공개 씬: is_published=true, 소유자: 항상 접근 가능)
- OG 메타태그 주입 (og:title, og:description, og:image=thumbnail_url)
- R3F Canvas: 환경(sky/fog/lights), primitiveShape 오브젝트 렌더링
- click 이벤트: open_url → window.open, show_popup → 팝업 모달
- hover 이벤트: cursor:pointer, 오브젝트 하이라이트
- OrbitControls (에디터 없음, 자유 시점)
- 모바일 반응형 지원
- "Powered by Park3D" 배지 (Free 플랜)
- 예상 소요: 1.5일

#### [P2-02] .glb 에셋 업로드
- Supabase Storage 버킷: `assets` (public read)
- 에디터 AssetBrowser에서 .glb 파일 업로드
- 업로드 완료 후 assets 테이블에 INSERT
- 씬에서 assetId로 참조, scene_data.assets[]에 dracoUrl 포함
- 예상 소요: 2일

#### [P2-03] 씬 퍼블리싱 (공개/비공개 토글)
- 대시보드 프로젝트 카드 또는 에디터 툴바에서 토글
- is_published=true 시 /space/:sceneId 공개 접근 허용
- 예상 소요: 0.5일

#### [P2-04] 씬 썸네일 자동 저장
- Ctrl+S 저장 시 R3F Canvas gl.domElement.toDataURL()로 캡처
- Supabase Storage 업로드 → projects.thumbnail_url 업데이트
- 예상 소요: 0.5일

#### [P2-05] 커스텀 도메인 연결
- `projects` 테이블에 `custom_domain TEXT` 컬럼 추가
- Next.js 미들웨어(`middleware.ts`)에서 요청 호스트명을 읽어 해당 `sceneId`로 rewrite
- 사용자가 에디터에서 도메인을 등록하면 DNS CNAME 안내 문구 표시
- 예상 소요: 1.5일

#### [P2-06] 임베드 모드 (기존 사이트 페이지 대체)
- 독립 번들 `embed.js` 빌드 (Next.js와 별개의 경량 Vite/Rollup 번들)
- 사용자가 기존 사이트 HTML에 아래 코드를 붙여넣으면 동작:
  ```html
  <div id="park3d-root"></div>
  <script src="https://cdn.park3d.com/embed.js" data-scene="SCENE_ID"></script>
  ```
- `embed.js`는 `#park3d-root` 요소 안에 뷰어 캔버스를 마운트
- 에디터 대시보드에서 임베드 코드 스니펫을 복사할 수 있는 UI 제공
- 예상 소요: 2일

#### [P2-08] CORS + Rate Limiting + Asset 정리
- `/api/scenes/:sceneId` CORS 헤더 추가 (`Access-Control-Allow-Origin: *`)
- Upstash Redis 기반 IP 레이트 리밋 (분당 60회)
- `cleanup-asset` Edge Function: 에셋 삭제 시 Storage 파일 자동 제거
- 예상 소요: 1일

#### [P2-09] embed.js 버전 관리
- `embed.v1.js` 형식으로 CDN 배포, 에디터 스니펫에 버전 명시
- `NEXT_PUBLIC_EMBED_VERSION` 환경 변수 추가
- 예상 소요: 0.5일

#### [P2-10] Open Graph 메타태그 + QR 코드
- `/space/:sceneId` SSR에서 `og:title`, `og:image`(thumbnail_url) 메타태그 주입
- 대시보드 공유 버튼 → QR 코드 PNG 다운로드 (`qrcode` 패키지)
- 예상 소요: 1일

#### [P2-11] 신규 사용자 온보딩
- 최초 에디터 진입 시 4단계 튜토리얼 오버레이
- localStorage 플래그로 재방문 시 미표시
- 예상 소요: 1일

**Phase 2 합계 예상: 약 9.5일**

#### [P2-07] 씬 썸네일 자동 저장
- `Ctrl+S` 저장 시점에 R3F Canvas의 `gl.domElement.toDataURL()`로 현재 뷰포트 캡처
- 이미지를 Supabase Storage에 업로드 → `projects.thumbnail_url` 업데이트
- 대시보드 프로젝트 카드에 자동 표시
- 예상 소요: 0.5일

**Phase 2 합계 예상: 약 6일**

## Phase 3: 인터랙션 및 물리 엔진 (게임화 레이어)
- 목표: @react-three/rapier 기반 충돌·점프·센서 시스템, 트리거-액션 이벤트, 캐릭터 컨트롤러 적용.
- 핵심 마일스톤: 오브젝트에 막히고 점프로 올라갈 수 있으며, 특정 구역 진입(Area Enter) 시 URL로 이동하는 템플릿 완성.

### 세부 태스크

#### [P3-01] Rapier 물리 월드 세팅
- `@react-three/rapier` 설치 및 `<Physics>` 컨텍스트를 뷰어 캔버스에 래핑
- `objects` 배열 렌더링 시 `physics.enabled` 값에 따라 Rapier 컴포넌트 자동 선택
  - `enabled: false` → 콜라이더 없이 `<primitive>` 렌더링
  - `enabled: true, isSensor: false` → `<RigidBody type="fixed">` + `colliderType` 기반 자동 콜라이더
  - `enabled: true, isSensor: true` → `<RigidBody type="fixed">` + sensor 콜라이더 (area_enter용)

#### [P3-02] 플레이어 캐릭터 컨트롤러
- `RigidBody type="dynamic"` + `CapsuleCollider` (반지름 0.4, 높이 1.6)
- WASD / 방향키 입력 → 수평 velocity 제어
- `Space` 키 → 접지 raycast 확인 후 수직 impulse `{ x:0, y:8, z:0 }` 적용 (점프)
- Mobile: Virtual Joystick(이동) + Jump 버튼(점프) HTML 오버레이

#### [P3-03] 팔로우 카메라
- 캐릭터 RigidBody 위치를 매 프레임 추적하는 쿼터뷰 카메라
- lerp로 부드러운 추적, 점프 시 카메라 Y축 보정

#### [P3-03-B] JavaScript Event Bridge
- `EventSchema.action: 'emit_event'` 처리 로직 구현
- **독립 URL 모드**: `window.dispatchEvent(new CustomEvent('park3d:VALUE', { detail: eventPayload }))`
- **임베드 모드**: `window.parent.postMessage({ type: 'park3d:VALUE', payload: eventPayload }, '*')`
- 호스트 페이지 연동 예시 (에디터 대시보드에서 코드 스니펫으로 제공):
  ```javascript
  window.addEventListener('park3d:add_to_cart', (e) => {
    myShop.addToCart(e.detail.productId);
  });
  ```
- 예상 소요: 1일

#### [P3-04] 레이캐스트 인터랙션 시스템
- `trigger: 'click'` 오브젝트: hover 시 Outline 이펙트 + cursor:pointer, 클릭 시 액션 실행
  - `open_url` → `window.open(value, '_blank')`
  - `show_popup` → `uiStore.openPopup(value)`

#### [P3-05] Area Enter 이벤트 처리
- `isSensor: true` 오브젝트에 Rapier `onIntersectionEnter` 콜백 바인딩
- 캐릭터 진입 감지 → `EventSchema.action` 실행, 재진입 방지 플래그 처리

#### [P3-06] 에디터 Inspector 물리 설정 UI
- 오브젝트 선택 시 Right Panel에 Physics 섹션 추가
- `enabled` 토글, `colliderType` 드롭다운, `isSensor` 체크박스
- `events[]` 배열 편집 UI (trigger/action/value 입력)

#### [P3-07] 그룹 선택 + 오브젝트 그룹화 ✅ 완료 (2026-07-02)
- [x] Shift+클릭 다중 선택 (캔버스 + HierarchyPanel 범위 선택)
- [x] 다중 선택 시 centroid 피벗 기즈모 (MultiGizmo) — 일괄 이동
- [x] Ctrl+G 그룹화 / Ctrl+Shift+G 해제 (레이어 탭 대신 트리+그룹 방식 채택)
- [x] 다중 선택 상태에서 Delete로 일괄 삭제
- [x] 뷰포트 빈 공간 드래그 박스 선택 (`boxSelectState.ts`, Ctrl+드래그는 오빗 유지)
- [x] X/Y/Z 축 기준 정렬 — ViewportToolbar 정렬 드롭다운 (min/center/max × 3축 = 9버튼)

#### [P3-08] 씬 템플릿 라이브러리
- 신규 씬 생성 시 "빈 씬 / 쇼룸 / 갤러리 / 전시장 / 카페" 등 템플릿 선택 가능
- 템플릿은 미리 정의된 `ProjectSceneSchema` JSON으로 저장
- 에디터 진입 전 템플릿 선택 모달 표시
- 예상 소요: 1일

#### [P3-09] ~~레이어 시스템~~ → 트리 구조 + 그룹 시스템으로 대체 ✅ 완료 (2026-06-30)
- 레이어 탭 방식 폐기 → HierarchyPanel 재귀 트리 구조 채택
- `isGroup: true` 오브젝트로 논리적 그룹 구성
- Ctrl+G / Ctrl+Shift+G 단축키로 그룹화/해제
- 그룹 펼치기/접기, 검색 시 자동 펼침

#### [P3-10] 2D 콘텐츠 오브젝트 (텍스트 / 이미지 / 동영상)
- **3D 텍스트**: Three.js `TextGeometry` + 폰트 선택, 크기/색상 편집
- **이미지 플레인**: URL 입력 → `MeshBasicMaterial` 텍스처 적용 (간판, 배너)
- **동영상 플레인**: URL 입력 → `VideoTexture` 적용 (YouTube embed, MP4)
- 모두 ObjectNodeSchema로 저장, assetId 대신 `contentType` + `contentUrl` 필드 추가
- 예상 소요: 2일

#### [P3-12] "Powered by Park3D" 배지 + 씬 통계
- Free 플랜 뷰어 우하단 배지 컴포넌트 (`hide_badge` planGate로 제어)
- `scene_events` 테이블 생성: view / click / area_enter 이벤트 수집
- 대시보드에 방문 통계 표시 (`analytics` planGate로 제어)
- 예상 소요: 1.5일

#### [P3-11] 에셋 브라우저 폴더 / 태그 시스템
- 에셋에 폴더 경로 또는 태그 부여 가능
- AssetBrowser에서 폴더/태그 기준 필터링
- 에셋 검색창 추가
- 예상 소요: 1일

**Phase 3 합계 예상: 약 12일**

---

## Phase 4: 생산성 고도화 (에디터 완성도)
- 목표: 반복 작업 자동화, 콘텐츠 재사용, 고급 시각 효과. 팀/전문가 사용자 대상.
- 핵심 마일스톤: 프리팹 시스템으로 동일 요소 N개 배치를 1개 수정으로 일괄 변경 가능.

### 태스크

#### [P4-01] InstancedMesh 자동 전환
- 동일 assetId 오브젝트 3개 이상 → InstancedMesh로 드로우콜 통합
- 예상 소요: 1.5일

#### [P4-02] KTX2/Draco 자동화 파이프라인 고도화
- 업로드 시 KTX2 텍스처 압축까지 추가 (현재 Draco 메쉬 압축만)
- 압축 품질 레벨 선택 (빠름/균형/최고)
- 예상 소요: 2일

#### [P4-03] Material 커스텀 에디터
- Inspector Material 섹션: color / roughness / metalness / emissive
- 실시간 씬 반영, ObjectNodeSchema `material` 필드 저장
- 예상 소요: 1.5일

#### [P4-04] 프리팹 시스템
- 오브젝트 또는 그룹을 "프리팹"으로 등록 (에셋 브라우저에 아이콘 표시)
- 프리팹 배치 시 원본과 연결 — 원본 수정 시 모든 인스턴스 일괄 반영
- `ObjectNodeSchema`에 `prefabId` 필드 추가
- 예상 소요: 3일

#### [P4-05] 버전 히스토리 (씬 롤백) ✅ 완료 (2026-07-02)
- [x] 씬 저장 시마다 `scene_versions` 테이블에 스냅샷 보관 (최대 30개, 초과 시 자동 삭제)
- [x] 에디터 툴바 히스토리 버튼 → `VersionHistoryModal` (날짜/시간 목록)
- [x] "이 버전으로 복구" 클릭 → 확인 다이얼로그 → 씬 복원 + `markModified()` 호출 (저장 버튼 활성화)

#### [P4-06] 뷰포트 분할 (에디터 + 플레이어 시점 동시 표시)
- 에디터 화면을 좌우 분할: 좌측 에디터 뷰 / 우측 플레이어 시점 실시간 미리보기
- 분할 비율 드래그 조절 가능
- 예상 소요: 2일

#### [P4-07] 파티클 이미터 ✅ Phase 3에서 앞당겨 완료 (2026-06-30)
- [x] `src/components/three/ParticleEmitter.tsx` — Three.js Points + AdditiveBlending
- [x] `useFrame` 파티클 애니메이션, 수명 초과 시 재방출
- [x] 4가지 프리셋: fire / dust / light / snow
- [x] AssetBrowser "파티클" 탭에서 배치
- [x] InspectorPanel Particle 섹션 (프리셋, 색상, 수/속도/Spread/크기)
- [x] 에디터 + 뷰어 모두 렌더링 (ViewerCanvas 파티클 분기 처리)

#### [P4-08] 단축키 커스터마이징
- 에디터 설정 패널에서 주요 액션 단축키 직접 지정
- 설정값은 localStorage에 저장
- 예상 소요: 1일

#### [P4-10] Event Bridge 통합 프리셋
- 에디터 대시보드에 Shopify / WooCommerce / 카페24 / 직접 입력 드롭다운
- 플랫폼 선택 시 맞춤 연결 코드 스니펫 자동 생성
- 예상 소요: 1.5일

#### [P4-09] 댓글 / 피드백 모드
- 에디터에서 "리뷰 모드" 진입 시 3D 공간 특정 위치 클릭 → 텍스트 메모 추가
- 메모는 `scene_comments` 테이블 저장, 작성자/날짜 표시
- 팀원과 URL 공유로 피드백 협업
- 예상 소요: 2일

**Phase 4 합계 예상: 약 17일**

---

## Phase 5: 엔터프라이즈 / AI (장기 로드맵)
- 목표: 팀 협업 및 AI 보조 기능. 핵심 제품 완성 후 진행.
- 핵심 마일스톤: 여러 명이 동시에 같은 씬을 편집 가능.

### 태스크

#### [P5-03] 3D 에셋 마켓플레이스
- 플랫폼 공용 에셋 라이브러리 (카테고리별 탐색, 검색)
- 무료/유료 에셋 구분, Business 플랜 판매 등록
- 예상 소요: 별도 스프린트 (마켓플레이스 DB/결제 구조 설계 필요)

#### [P5-01] 실시간 협업 (Multi-user Editing)
- WebSocket (Supabase Realtime) + CRDT 방식으로 동시 편집 충돌 해결
- 다른 유저의 커서/기즈모 위치를 실시간으로 표시
- 예상 소요: 10일 이상 (별도 설계 필요)

#### [P5-02] AI 자동 배치
- 텍스트 프롬프트 입력 ("카페 분위기의 공간 만들어줘") → AI가 에셋 배치 제안
- OpenAI API + 에셋 목록 컨텍스트 전달 → 배치 JSON 반환 → editorStore 적용
- 예상 소요: 5일 이상

**Phase 5 합계 예상: 별도 스프린트 계획 필요**