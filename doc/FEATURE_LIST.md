# FEATURE_LIST: 기능 명세 및 AI 인수 조건 (Acceptance Criteria)

AI에게 특정 기능을 구현하라고 요청할 때, 아래의 인수 조건(AC)을 명확한 검증 기준으로 사용한다.
모든 AC 항목이 충족되었을 때만 해당 기능이 완료된 것으로 간주한다.

---

## PHASE 0: 진입 및 프로젝트 관리

---

### FEAT-PLAN-01: 플랜 게이팅 시스템
**설명**: 플랜(free/pro/business)에 따라 기능 접근과 수량을 제한한다. 모든 제한은 단일 파일(`planGates.ts`)에서 정의되며, UI와 API 양측에서 이중 검증한다.

**AC:**
- [ ] `users_plan` 테이블이 생성되고 신규 가입 유저는 자동으로 `free` 플랜이 부여된다
- [ ] 로그인 완료 시 `users_plan`이 조회되어 `userStore.planTier`에 세팅된다
- [ ] `usePlan().can('custom_domain')` 호출 시 플랜에 따라 `true/false`가 반환된다
- [ ] `usePlan().limit('scene_count')` 호출 시 플랜에 따라 정수 한도가 반환된다
- [ ] `<PlanGate feature="embed_mode">` 래퍼가 free 플랜에서 `<UpgradeBanner>`를 렌더링하고 pro 이상에서 자식 컴포넌트를 렌더링한다
- [ ] Free 플랜 유저가 씬 1개 이상 생성 시도 시 API에서 403 응답을 반환한다
- [ ] Free 플랜 유저가 커스텀 도메인 저장 시도 시 API에서 403 응답을 반환한다
- [ ] 프론트엔드 게이트를 우회하여 API를 직접 호출해도 서버 측에서 동일하게 차단된다
- [ ] `planGates.ts` 한 파일의 값 변경이 UI 잠금, API 차단, 업그레이드 안내에 동시 반영된다

---

### FEAT-DASH-01: 대시보드 — 프로젝트 목록
**설명**: 로그인 후 첫 화면. 보유 프로젝트를 카드 형태로 표시하고 신규 생성 및 관리를 지원한다.

**AC:**
- [ ] 비로그인 상태에서 `/dashboard` 접근 시 `/login`으로 리다이렉트된다
- [ ] 로그인 성공 후 `/dashboard`로 자동 이동한다
- [ ] 보유 프로젝트가 카드 그리드로 표시된다 (프로젝트명, 씬 수 표시)
- [ ] `[+ 새 프로젝트]` 클릭 시 이름 입력 모달이 열리고, 확인 시 프로젝트 + 기본 씬이 생성된다
- [ ] 생성 즉시 해당 씬의 에디터로 이동한다
- [ ] 프로젝트가 없을 때 빈 상태 안내 메시지와 "첫 프로젝트 만들기" 버튼이 표시된다

---

### FEAT-DASH-02: 씬 관리 드로어
**설명**: 프로젝트 내 씬 목록을 확인하고 추가/삭제/전환한다.

**AC:**
- [ ] 프로젝트 카드 `...` 메뉴에서 [씬 관리] 클릭 시 우측 드로어가 슬라이드인된다
- [ ] 씬 목록이 표시되며 각 씬의 [편집] 버튼 클릭 시 해당 씬 에디터로 이동한다
- [ ] `[+ 씬 추가]` 클릭 시 빈 씬이 생성되고 에디터로 이동한다
- [ ] 씬 삭제 시 확인 모달이 표시되며, 기본 씬(default_scene_id)은 삭제할 수 없다
- [ ] 에디터 상단 씬 드롭다운에서도 동일하게 씬 전환 및 추가가 가능하다

---

### FEAT-ENV-01: 환경 설정 에디터 ✅ 완료 (범위 확장, 2026-07-02)
**설명**: 에디터에서 씬의 하늘, 바닥, 경계, 안개, 조명을 실시간으로 편집한다.

> **⚠️ 설계 변경**: 원래 스펙은 ViewportToolbar `[환경]` 버튼 → 별도 EnvironmentPanel이었으나, 실제 구현은 오브젝트 미선택 시 InspectorPanel에 `EnvironmentPanel`이 표시되는 방식으로 대체됨.

**AC (변경 후):**
- [x] 캔버스에서 오브젝트를 선택하지 않은 상태면 InspectorPanel에 `EnvironmentPanel`이 표시된다
- [x] Sky 타입을 `color` / `sky`(물리 기반 하늘) / `hdr`(프리셋) 3-way로 선택할 수 있다 (상호 배타)
- [x] `color` 선택 시 컬러피커로 배경색을 선택하면 씬에 즉시 반영된다
- [x] `hdr` 선택 시 10종 프리셋(sunset/dawn/night/warehouse/forest/apartment/studio/city/park/lobby) 중 선택해 즉시 반영된다 (drei `<Environment preset>`)
- [x] **Ground**: enabled 토글 + grass/dirt/sand/stone(절차적 텍스처)/water(실시간 반사)/custom(색상 또는 업로드 URL) 프리셋 선택
- [x] **Boundary**: 값 입력 시 에디터·뷰어에 노란 와이어프레임 박스가 표시되고, 플레이 모드에서 실제 충돌 벽으로 작동한다
- [x] Fog enabled 토글 및 Color / Near / Far 값 변경이 씬에 즉시 반영된다
- [x] Ambient Intensity, Directional Position/Intensity 변경이 씬에 즉시 반영된다
- [x] 변경된 환경 설정이 씬 저장 시 `ProjectSceneSchema.environment`에 포함된다
- [x] 뷰어는 `environment` 값을 읽어 동일한 하늘/바닥/경계/안개/조명을 재현한다

---

## PHASE 1: MVP 코어

---

### FEAT-INFRA-01: WebGL 미지원 환경 폴백
**설명**: WebGL을 지원하지 않는 브라우저/기기에서 흰 화면 대신 안내 메시지를 표시한다.

**AC:**
- [ ] 뷰어 및 에디터 진입 시 WebGL 지원 여부를 감지한다
- [ ] 미지원 시 Canvas 대신 "이 브라우저는 3D를 지원하지 않습니다. Chrome 또는 Safari 최신 버전을 사용해 주세요" 화면을 표시한다
- [ ] 에디터에서 화면 너비가 1280px 미만이면 "에디터는 PC에서 이용해 주세요" 안내 화면을 표시한다

---

### FEAT-INFRA-02: 에러 상태 처리
**설명**: 씬 로드 실패, 저장 실패, 에셋 업로드 실패 시 사용자에게 명확한 피드백을 제공한다.

**AC:**
- [ ] 씬 fetch 실패(네트워크 오류 / 404) 시 뷰어에 "씬을 불러올 수 없습니다" 오류 화면이 표시된다
- [ ] 에디터 저장 실패 시 에러 토스트가 표시되고 스토어 상태는 유지된다 (데이터 손실 없음)
- [ ] 에셋 업로드 실패 시 해당 타일에 오류 아이콘과 재시도 버튼이 표시된다
- [ ] 모든 Supabase 쿼리 에러는 `uiStore.setError(message)`를 통해 일관되게 처리된다
- [ ] 에러 메시지는 기술 용어 없이 사용자 친화적 문구로 표시된다

---

### FEAT-PRIM-01: 기본 도형 스폰
**설명**: .glb 파일 없이 Three.js 기본 도형을 즉시 씬에 배치한다.

**AC:**
- [ ] AssetBrowser 상단에 "기본 도형" 탭이 존재한다
- [ ] Box / Sphere / Cylinder / Plane 도형을 클릭하면 씬 중앙에 배치된다
- [ ] 배치된 기본 도형은 ObjectNodeSchema로 저장되며 기즈모 조작이 가능하다
- [ ] 뷰어에서도 동일한 도형이 렌더링된다

---

### FEAT-UX-01: 에디터 UX 기본기
**설명**: 자주 쓰는 에디터 조작 편의 기능 묶음.

**AC:**
- [ ] **스냅**: ViewportToolbar에 스냅 토글이 있으며, 간격(0.25/0.5/1/2)을 선택하면 기즈모 이동이 해당 단위로 고정된다
- [ ] **회전 스냅**: 회전 스냅(15°/45°/90°) 선택 시 회전이 해당 각도 단위로 고정된다
- [ ] **Focus**: 오브젝트 선택 후 `F` 키 입력 시 카메라가 해당 오브젝트 앞으로 이동한다
- [ ] **이름 인라인 편집**: Hierarchy 항목 더블클릭 시 텍스트 인풋으로 전환되고, blur 시 이름이 저장된다
- [ ] **오브젝트 검색**: Hierarchy 상단 검색창 입력 시 이름이 일치하는 오브젝트만 표시된다
- [ ] **카메라 북마크**: `[뷰 저장]` 버튼으로 현재 카메라 앵글을 저장하고, 숫자키(1~5)로 복귀한다
- [ ] **그리드 설정**: ViewportToolbar에서 그리드 간격(0.5/1/5) 및 표시 on/off 토글이 동작한다

---

### FEAT-UX-02: 와이어프레임 + 콜라이더 시각화
**설명**: 오브젝트 내부 구조와 물리 경계를 에디터에서 시각적으로 확인한다.

**AC:**
- [ ] ViewportToolbar에 `[솔리드 / 와이어프레임]` 토글이 있으며 전환 시 씬 전체가 와이어프레임으로 표시된다
- [ ] `physics.enabled: true` 오브젝트에 콜라이더 경계 박스 오버레이가 표시된다
- [ ] `isSensor: false` 콜라이더는 초록색, `isSensor: true` 콜라이더는 파란색으로 구분된다
- [ ] 콜라이더 시각화는 에디터 전용이며 뷰어에는 표시되지 않는다

---

### FEAT-OBJ-01: 오브젝트 스폰 및 기즈모 연동
**설명**: 에셋 브라우저에서 아이템을 클릭하거나 드래그앤드롭하면 씬에 오브젝트가 생성되고 기즈모가 붙는다.

**AC:**
- [ ] 오브젝트 생성 시 고유 ID(`obj_` + timestamp)가 부여된다
- [ ] 생성 즉시 `selectedObjectId`에 등록되어 기즈모(TransformControls)가 화면에 나타난다
- [ ] 기즈모를 움직이면 Inspector의 Position X/Y/Z 인풋 값이 실시간으로 변경된다
- [ ] Inspector의 Position 인풋 값을 수정하면 씬의 오브젝트 위치가 즉시 반영된다
- [ ] `locked: true`인 오브젝트는 기즈모가 나타나지 않는다

---

### FEAT-HIST-01: Undo / Redo 시스템
**설명**: 사용자의 실수를 되돌리거나 다시 실행한다.

**AC:**
- [ ] 오브젝트 이동/회전/크기 조작이 끝난 시점(mouseup)에만 히스토리에 기록된다 (드래그 매 프레임 기록 금지)
- [ ] `Ctrl+Z` 입력 시 직전 조작 상태로 복구된다
- [ ] `Ctrl+Y` 또는 `Ctrl+Shift+Z` 입력 시 Undo 이전 상태로 재실행된다
- [ ] 오브젝트 추가 / 삭제도 Undo/Redo 대상에 포함된다
- [ ] Undo 후 새로운 조작을 하면 Redo 스택이 초기화된다
- [ ] Undo 스택은 최대 50개를 유지하며 초과 시 가장 오래된 항목이 제거된다

---

### FEAT-HIER-01: Hierarchy 패널
**설명**: 씬 내 오브젝트를 트리 구조로 표시하고 선택 및 계층 관리를 지원한다.

**AC:**
- [ ] 씬의 모든 오브젝트가 `parentId` 기준으로 트리 형태로 렌더링된다
- [ ] 항목 클릭 시 해당 오브젝트가 선택(selectedObjectId 변경)되고 기즈모가 활성화된다
- [ ] 선택된 항목은 파란색 배경으로 강조 표시된다
- [ ] 눈 아이콘 클릭으로 `visible` 토글이 동작하며 씬에 즉시 반영된다
- [ ] 자물쇠 아이콘 클릭으로 `locked` 토글이 동작하며, locked 오브젝트는 기즈모 비활성화된다
- [ ] 우클릭 컨텍스트 메뉴에서 복제 / 삭제가 동작한다

---

### FEAT-INSP-01: Inspector 패널
**설명**: 선택된 오브젝트의 Transform, Physics, Events 속성을 편집한다.

**AC:**
- [ ] 선택된 오브젝트가 없으면 "오브젝트를 선택하세요" 안내 문구가 표시된다
- [ ] Transform 섹션: Position / Rotation / Scale X/Y/Z 인풋이 스토어 값과 양방향 바인딩된다
- [ ] Scale Lock Proportions 체크박스 활성 시 하나의 Scale 값 변경이 나머지에 비율 적용된다
- [ ] Physics 섹션: enabled 토글, colliderType 드롭다운, isSensor 체크박스가 정상 동작한다
- [ ] Events 섹션: 이벤트 추가/삭제가 가능하며, trigger/action/value가 스토어에 저장된다

---

## PHASE 2: 퍼블리싱 파이프라인

---

### FEAT-ONBOARD-01: 신규 사용자 온보딩
**설명**: 처음 에디터를 여는 사용자에게 핵심 기능을 안내하는 튜토리얼을 제공한다.

**AC:**
- [ ] 최초 에디터 진입 시(localStorage 플래그 기준) 온보딩 오버레이가 표시된다
- [ ] 순차적으로 "에셋 추가 → 이동/회전 → 저장 → 미리보기" 4단계를 강조 표시로 안내한다
- [ ] 각 단계에서 해당 UI 요소에 포커스 링 + 말풍선 설명이 표시된다
- [ ] "건너뛰기" 버튼으로 즉시 종료 가능하다
- [ ] 온보딩 완료 또는 건너뛰기 후 localStorage에 `onboarding_done: true` 저장 → 재방문 시 미표시

---

### FEAT-OG-01: Open Graph 메타태그 + QR 코드
**설명**: 씬 URL을 SNS/메신저에 공유 시 미리보기 이미지가 표시되고, QR 코드로 모바일 접속을 유도한다.

**AC:**
- [ ] `/space/:sceneId` 페이지에 `og:title`, `og:image`(thumbnail_url), `og:description` 메타태그가 포함된다
- [ ] 카카오톡, 트위터, 슬랙 등에 URL 공유 시 썸네일 이미지와 씬 이름이 미리보기로 표시된다
- [ ] 에디터 대시보드 "공유" 버튼 클릭 시 해당 씬의 QR 코드 이미지를 다운로드할 수 있다
- [ ] QR 코드는 `/space/:sceneId` URL을 인코딩하며 PNG 형식으로 제공된다

---

### FEAT-THUMB-01: 씬 썸네일 자동 저장
**설명**: 씬 저장 시 현재 뷰포트를 캡처하여 대시보드 카드 이미지로 사용한다.

**AC:**
- [ ] `Ctrl+S` 저장 시 R3F Canvas에서 PNG 이미지가 캡처된다
- [ ] 캡처 이미지가 Supabase Storage에 업로드되고 `projects.thumbnail_url`이 갱신된다
- [ ] 대시보드 프로젝트 카드에 해당 썸네일이 표시된다
- [ ] 최초 저장 전에는 기본 플레이스홀더 이미지가 표시된다

---

### FEAT-ASSET-01: 에셋 업로드
**설명**: `.glb` 파일을 업로드하여 에셋 브라우저에 등록한다.

**AC:**
- [ ] AssetBrowser 영역에 `.glb` 파일을 드래그앤드롭하면 업로드가 시작된다
- [ ] 업로드 중 해당 타일에 진행 스피너가 표시된다
- [ ] 업로드 완료 후 Draco 압축 Edge Function이 자동 실행된다
- [ ] `draco_url`이 채워지기 전에는 에셋을 씬에 추가할 수 없다 (타일 비활성화)
- [ ] Draco 압축 완료 후 타일이 정상 활성화되며 씬에 추가 가능해진다
- [ ] 지원하지 않는 파일 형식 업로드 시 오류 메시지를 표시한다 (`.glb`만 허용)

---

### FEAT-SCENE-01: 씬 저장 및 불러오기
**설명**: 에디터 씬 상태를 Supabase에 저장하고 재진입 시 복원한다.

**AC:**
- [ ] 저장 버튼 클릭 또는 `Ctrl+S` 입력 시 현재 씬이 `ProjectSceneSchema` JSON으로 직렬화되어 Supabase에 저장된다
- [ ] 변경 사항이 있으면 저장 버튼이 활성화(강조)되고, 저장 완료 후 비활성화된다
- [ ] 에디터 페이지 재진입 시 DB에서 씬 데이터를 fetch하여 스토어를 초기화한다
- [ ] 저장 실패 시 에러 토스트를 표시하고 스토어 상태는 유지된다

---

### FEAT-DOMAIN-01: 커스텀 도메인 연결
**설명**: 사용자 소유 도메인을 특정 씬에 연결하여 자체 브랜드 URL로 3D 공간을 서비스한다.

**AC:**
- [ ] 에디터 대시보드에서 도메인 문자열을 입력하고 저장할 수 있다
- [ ] 저장 시 DNS CNAME 설정 안내 (`yourdomain.com → cname.park3d.com`) 문구가 표시된다
- [ ] Next.js 미들웨어가 요청 호스트명을 DB에서 조회하여 해당 sceneId의 뷰어로 rewrite한다
- [ ] CNAME 연결이 완료된 도메인으로 접속하면 해당 씬이 정상 렌더링된다
- [ ] 도메인이 연결되지 않은 경우 기본 `/space/:sceneId` URL로도 동일하게 접근 가능하다

---

### FEAT-EMBED-01: 기존 사이트 임베드 (페이지 대체)
**설명**: 기존 웹사이트에 script 태그 한 줄을 삽입하여 해당 영역을 3D 뷰어로 교체한다.

**AC:**
- [ ] 에디터 대시보드에서 임베드 코드 스니펫을 한 번의 클릭으로 복사할 수 있다
- [ ] 스니펫 형태: `<div id="park3d-root"></div><script src="..." data-scene="SCENE_ID"></script>`
- [ ] `embed.js`를 페이지에 포함하면 `#park3d-root` 요소 안에 뷰어 캔버스가 마운트된다
- [ ] 임베드된 뷰어는 독립 URL 뷰어와 동일한 씬 데이터를 렌더링한다
- [ ] 임베드 번들(`embed.js`) 크기가 에디터 코드를 포함하지 않아 최소화된다

---

### FEAT-BRIDGE-01: JavaScript Event Bridge (외부 액션 연동)
**설명**: 3D 뷰어 내 오브젝트 이벤트를 호스트 페이지의 JavaScript 함수와 연결한다.

**AC:**
- [ ] 에디터 Inspector의 Events 섹션에 `action: 'emit_event'` 옵션이 추가된다
- [ ] `value` 필드에 이벤트 이름(예: `add_to_cart`)을 입력할 수 있다
- [ ] 독립 URL 모드에서 이벤트 발생 시 `window.dispatchEvent(new CustomEvent('park3d:add_to_cart', { detail: payload }))` 가 실행된다
- [ ] 임베드 모드에서 이벤트 발생 시 `window.parent.postMessage({ type: 'park3d:add_to_cart', payload }, '*')` 가 실행된다
- [ ] 에디터 대시보드에서 이벤트 수신 코드 예시 스니펫을 확인할 수 있다
- [ ] `eventPayload` 필드에 JSON 키-값을 추가하면 이벤트 detail에 함께 전달된다

---

### FEAT-VIEWER-01: 런타임 뷰어
**설명**: 에디터 없이 씬 JSON만으로 3D 월드를 렌더링하는 독립 페이지.

**AC:**
- [ ] `/space/:sceneId` 접속 시 `/api/scenes/:sceneId`에서 JSON을 fetch한다
- [ ] 에디터 관련 컴포넌트(`TransformControls`, `GridHelper`, `AssetBrowser`, `HierarchyPanel` 등)가 번들에 포함되지 않는다
- [ ] JSON의 `objects` 배열을 순회하여 각 오브젝트를 렌더링한다
- [ ] `draco_url`을 가진 에셋들을 DracoDecoder로 로드한다
- [ ] 씬 로딩 중 LoadingScreen 컴포넌트가 표시된다

---

## PHASE 3: 인터랙션 및 물리 엔진

---

### FEAT-BADGE-01: "Powered by Park3D" 배지 (Free 티어 바이럴)
**설명**: Free 플랜 뷰어에 소형 배지를 표시하여 플랫폼 인지도를 높인다. Pro 이상에서 제거 가능.

**AC:**
- [ ] Free 플랜 씬 뷰어 우하단에 "Powered by Park3D" 배지가 표시된다
- [ ] 배지 클릭 시 플랫폼 마케팅 페이지로 이동한다
- [ ] Pro/Business 플랜(`hide_badge: true`)에서는 배지가 렌더링되지 않는다
- [ ] 배지는 뷰어 번들에 포함되며 embed.js에도 동일하게 적용된다

---

### FEAT-ANALYTICS-01: 씬 뷰어 통계
**설명**: 씬 소유자가 방문자 수, 오브젝트 클릭 수, 이벤트 발생 통계를 대시보드에서 확인한다.

**AC:**
- [ ] 뷰어 접속 시 `scene_events` 테이블에 `view` 이벤트가 기록된다
- [ ] 오브젝트 클릭 시 `click` 이벤트가 objectId와 함께 기록된다
- [ ] area_enter 이벤트 발생 시 기록된다
- [ ] 대시보드 프로젝트 카드에 "총 방문 N회" 통계가 표시된다
- [ ] 프로젝트 설정 페이지에 기간별 방문자 수, 오브젝트별 클릭 수 차트가 표시된다
- [ ] Pro 플랜 이상(`analytics: true`)에서만 통계가 수집되고 표시된다

---

### FEAT-GROUP-01: 그룹 선택 + 오브젝트 그룹화 ✅ 완료 (2026-07-02)
**설명**: 여러 오브젝트를 동시에 선택하여 일괄 조작하고, Ctrl+G로 그룹으로 묶는다.

**AC:**
- [x] 에디터 캔버스에서 Shift+클릭으로 여러 오브젝트를 동시 선택할 수 있다
- [x] HierarchyPanel에서 Shift+클릭으로 범위 선택이 된다 (anchorIndexRef 기반)
- [x] 다중 선택 상태에서 centroid에 기즈모가 나타나고, 이동 시 선택된 모든 오브젝트가 함께 이동한다
- [x] 다중 선택 상태에서 `Delete` 입력 시 선택된 모든 오브젝트가 삭제된다
- [x] `Ctrl+G` 입력 시 선택 오브젝트들이 그룹으로 묶이고, 자식 position이 그룹 로컬 좌표로 변환된다
- [x] `Ctrl+Shift+G` 입력 시 그룹이 해제되고 자식 position이 월드 좌표로 복원된다
- [x] 뷰포트 빈 공간 좌클릭 드래그 → 보라색 박스 범위 내 오브젝트 다중 선택 (`boxSelectState.ts`, Ctrl+드래그는 오빗)
- [x] Inspector Multi-select 패널에서 X/Y/Z 축 × min/center/max 정렬 버튼 (`alignSelected` 스토어 액션)

---

### FEAT-TEMPLATE-01: 씬 템플릿 라이브러리
**설명**: 새 씬 생성 시 미리 정의된 템플릿을 선택하여 빠르게 시작한다.

**AC:**
- [ ] 씬 추가 시 "빈 씬 / 쇼룸 / 갤러리 / 전시장 / 카페" 템플릿 선택 모달이 표시된다
- [ ] 템플릿 선택 시 해당 `ProjectSceneSchema` JSON으로 씬이 초기화된다
- [ ] "빈 씬" 선택 시 기존과 동일하게 빈 씬이 생성된다
- [ ] 템플릿 미리보기 이미지가 선택 모달에 표시된다

---

### ~~FEAT-LAYER-01: 레이어 시스템~~ → 그룹 + 트리 구조로 대체 (2026-06-30)
**변경 사유**: 레이어 탭 방식 대신 피그마/포토샵과 동일한 트리 구조 + Ctrl+G 그룹화 방식으로 구현.
레이어 탭과 `ObjectNodeSchema.layer` 필드는 현재 미사용(vestigial).

**현재 구현:**
- [x] HierarchyPanel이 `parentId` 기반 재귀 트리로 렌더링된다
- [x] Ctrl+G로 선택 오브젝트를 그룹(`isGroup: true`)으로 묶을 수 있다
- [x] Ctrl+Shift+G 또는 컨텍스트 메뉴로 그룹을 해제할 수 있다
- [x] 그룹 항목에 📁 아이콘과 ▶/▼ 펼치기/접기 토글이 있다
- [x] 그룹 삭제 시 모든 자손이 함께 삭제된다

---

### FEAT-CONTENT-01: 2D 콘텐츠 오브젝트 (텍스트 / 이미지 / 동영상)
**설명**: .glb 없이 텍스트, 이미지, 동영상을 3D 공간에 배치한다.

**AC:**
- [ ] AssetBrowser에 "콘텐츠" 탭이 있으며 Text / Image / Video 오브젝트를 배치할 수 있다
- [ ] **텍스트**: Inspector에서 내용, 폰트 크기, 색상을 편집하면 씬에 3D 텍스트가 표시된다
- [ ] **이미지**: URL 입력 시 해당 이미지가 텍스처로 적용된 평면 메쉬가 생성된다
- [ ] **동영상**: URL 입력(YouTube/MP4) 시 해당 동영상이 재생되는 평면 메쉬가 생성된다
- [ ] 모든 콘텐츠 오브젝트는 Transform 조작(이동/회전/크기) 및 Physics 설정이 가능하다
- [ ] 뷰어에서 동일하게 렌더링된다

---

### FEAT-ASSET-FOLDER-01: 에셋 폴더 + 검색
**설명**: 에셋 브라우저에서 폴더 구조 또는 태그로 에셋을 분류하고 검색한다.

**AC:**
- [ ] 에셋 브라우저 상단에 검색창이 있으며 파일명으로 필터링된다
- [ ] 에셋에 폴더(경로) 또는 태그를 부여할 수 있다
- [ ] 폴더/태그 클릭 시 해당 에셋만 필터링되어 표시된다
- [ ] 에셋 우클릭 컨텍스트 메뉴에서 태그 추가/삭제 및 폴더 이동이 가능하다

---

### FEAT-PHYSICS-01: Rapier 물리 세팅 ✅ 완료 (행동 변경 포함)
**설명**: `physics.enabled`에 따라 Rapier 콜라이더를 오브젝트에 자동 적용한다.

> **⚠️ 설계 변경 (2026-07-02)**: 원래 스펙은 `physics.enabled: false` 오브젝트는 플레이어가 통과 가능이었으나, 게임 맥락상 모든 씬 오브젝트가 기본적으로 충돌해야 한다는 결정으로 변경. `AutoCollider` 컴포넌트가 physics=false 오브젝트에도 고정 충돌체를 부여한다.

**AC (변경 후):**
- [x] `physics.enabled: false` 오브젝트도 플레이 모드에서 `AutoCollider`로 `RigidBody type="fixed"` + 자동 콜라이더가 부여되어 플레이어를 막는다 (box→cuboid, sphere→ball, 그 외→hull)
- [x] `physics.enabled: true, isSensor: false` 오브젝트는 사용자 설정 콜라이더로 플레이어를 막는다
- [x] `physics.enabled: true, isSensor: true` 오브젝트는 sensor 콜라이더가 적용되어 플레이어가 통과하지만 진입 이벤트를 감지한다
- [x] `colliderType`에 따라 box / sphere / capsule / hull / trimesh 콜라이더가 정확히 적용된다

---

### FEAT-PLAYER-01: 플레이어 컨트롤러
**설명**: 캐릭터가 씬을 이동하고 오브젝트 위로 점프할 수 있다.

**AC:**
- [ ] `W/A/S/D` 또는 방향키 입력으로 캐릭터가 이동한다
- [ ] `physics.enabled: true, isSensor: false` 오브젝트에 캐릭터가 막힌다 (통과 불가)
- [ ] `Space` 키 입력 시 캐릭터가 점프한다
- [ ] 공중에서 재점프가 불가능하다 (접지 확인 후 점프 허용)
- [ ] 높이가 있는 오브젝트 위로 점프하여 올라갈 수 있다
- [ ] 모바일에서 Virtual Joystick으로 이동, Jump 버튼으로 점프가 동작한다

---

### FEAT-CAM-01: 팔로우 카메라
**설명**: 캐릭터를 항상 중심에 두는 쿼터뷰 카메라.

**AC:**
- [x] 캐릭터 이동 시 카메라가 부드럽게 따라온다 (lerp 적용)
- [x] 카메라와 캐릭터 간 거리 및 각도가 고정 유지된다
- [x] 점프 시 카메라 Y축이 자연스럽게 보정된다
- [x] 마우스 드래그로 카메라 azimuth/elevation 회전이 가능하다

---

### FEAT-CHARACTER-01: GLB 캐릭터 시스템 ✅ 완료 (2026-07-02)
**설명**: .glb 파일을 캐릭터로 등록하여 플레이 모드에서 3D 애니메이션 캐릭터로 조종한다.

**AC:**
- [x] AssetBrowser "Character" 탭에서 캐릭터 GLB 파일을 업로드할 수 있다 (`AssetRefSchema.type: 'character'`로 저장)
- [x] Inspector → "Player" 섹션에서 씬에 사용할 캐릭터를 드롭다운으로 선택하고 Scale을 조정할 수 있다
- [x] 선택된 캐릭터가 `EnvSchema.playerCharacterId`와 `playerCharacterScale`에 저장된다
- [x] 플레이/임베드 모드에서 해당 GLB가 `SkeletonUtils.clone`으로 클론되어 캡슐 콜라이더 내부에 렌더링된다
- [x] GLB 애니메이션 클립에서 'idle'/'walk'/'run'/'jump' 키워드 자동 탐색 후 상태 전환 (0.2초 fadeIn/Out)
- [x] 이동 방향으로 캐릭터 그룹이 lerp 회전한다 (t=0.15)
- [x] 캐릭터 미설정 시 기본 보라색 캡슐 메시(`DefaultCharacter`)가 사용된다

---

### FEAT-EVENT-CLICK-01: Click 및 Hover 이벤트
**설명**: 오브젝트 클릭 / 마우스오버 시 정의된 액션을 실행한다.

**AC:**
- [ ] `trigger: 'hover_enter'` 오브젝트에 마우스를 올리면 외곽선(Outline) 이펙트가 활성화되고 커서가 `pointer`로 변경된다
- [ ] 마우스가 오브젝트를 벗어나면 Outline이 제거되고 커서가 기본으로 복원된다
- [ ] `trigger: 'click', action: 'open_url'` 오브젝트 클릭 시 `window.open(value, '_blank')`가 실행된다
- [ ] `trigger: 'click', action: 'show_popup'` 오브젝트 클릭 시 `uiStore.openPopup(value)`가 호출되어 팝업 모달이 표시된다
- [ ] 팝업 모달은 마크다운을 렌더링하며 닫기 버튼 또는 ESC 키로 닫힌다

---

### FEAT-EVENT-AREA-01: Area Enter 이벤트
**설명**: 플레이어가 특정 구역에 진입하면 이벤트를 1회 발동한다.

**AC:**
- [ ] `physics.isSensor: true` + `events[].trigger: 'area_enter'` 오브젝트에 플레이어가 진입하면 이벤트가 발동된다
- [ ] 이벤트는 1회만 발동되며, 플레이어가 구역을 나갔다가 재진입해도 재발동되지 않는다
- [ ] `action: 'open_url'` 이면 해당 URL로 이동, `action: 'show_popup'` 이면 팝업이 표시된다
- [ ] `viewerStore.resetSession()` 호출 시 발동 이력이 초기화되어 재발동 가능해진다

---

## PHASE 4: 생산성 고도화

---

### FEAT-PERF-01: InstancedMesh 자동 전환
**설명**: 동일 에셋이 3개 이상 배치되면 드로우콜을 1회로 통합한다.

**AC:**
- [ ] 씬 렌더링 전 `objects` 배열에서 동일 `assetId`를 가진 오브젝트를 그룹화한다
- [ ] 그룹 크기 3개 이상 시 `InstancedMesh`로 렌더링한다 (개별 `<primitive>` 사용 금지)
- [ ] 그룹 크기 2개 이하 시 기존 `<primitive>` 방식을 유지한다
- [ ] InstancedMesh 적용 여부에 관계없이 각 오브젝트의 Transform이 정확히 유지된다

---

### FEAT-MAT-01: Material 커스텀 에디터
**설명**: Inspector에서 선택 오브젝트의 재질을 실시간으로 조정한다.

**AC:**
- [ ] Inspector에 Material 섹션이 추가되며 color, roughness, metalness, emissive 속성을 편집할 수 있다
- [ ] 값 변경 시 씬의 오브젝트 재질이 실시간으로 반영된다
- [ ] 변경된 material 속성은 `ObjectNodeSchema`의 `material` 필드에 저장되어 씬 JSON에 포함된다
- [ ] 뷰어는 `material` 필드가 존재하면 해당 값으로 재질을 적용하고, 없으면 원본 재질을 사용한다

---

### FEAT-PREFAB-01: 프리팹 시스템
**설명**: 오브젝트 또는 그룹을 프리팹으로 등록하고 여러 씬에서 재사용한다. 원본 수정 시 모든 인스턴스가 일괄 반영된다.

**AC:**
- [ ] Hierarchy에서 오브젝트(또는 그룹) 우클릭 → "프리팹으로 저장" 메뉴가 표시된다
- [ ] 저장된 프리팹이 AssetBrowser의 "프리팹" 탭에 표시된다
- [ ] 프리팹 배치 시 ObjectNodeSchema에 `prefabId`가 기록된다
- [ ] 프리팹 원본 편집 저장 시 해당 씬 내 모든 인스턴스가 일괄 업데이트된다
- [ ] 프리팹 인스턴스에서 개별 override(Transform 등)가 가능하다

---

### FEAT-VERSION-01: 버전 히스토리 (씬 롤백) ✅ 완료 (2026-07-02)
**설명**: 씬의 저장 이력을 보관하고 특정 시점으로 롤백한다.

**AC:**
- [x] 씬 저장마다 `scene_versions` 테이블에 스냅샷이 자동 저장된다 (최대 30개)
- [x] 에디터 상단에 "히스토리" 버튼이 있으며 저장 이력 목록(날짜/시간)이 표시된다
- [x] 특정 이력 항목 선택 후 "이 버전으로 복구" 클릭 시 해당 씬 데이터로 복원된다
- [x] 복구 전 확인 다이얼로그가 표시된다
- [x] 30개 초과 시 가장 오래된 버전이 자동 삭제된다
- [x] 복구 후 `markModified()` 호출로 저장 버튼이 즉시 활성화된다

---

### FEAT-VIEWPORT-01: 뷰포트 분할 (에디터 + 플레이어 시점)
**설명**: 에디터 화면을 좌우 분할하여 편집과 동시에 플레이어 시점을 미리 볼 수 있다.

**AC:**
- [ ] ViewportToolbar에 `[분할 뷰]` 토글 버튼이 있다
- [ ] 활성화 시 뷰포트가 좌우로 분할된다 (좌: 에디터 OrbitControls, 우: 플레이어 시점)
- [ ] 분할 경계선을 드래그하여 비율을 조절할 수 있다
- [ ] 우측 플레이어 뷰는 Physics 없이 씬을 렌더링한다 (읽기 전용 미리보기)

---

### FEAT-PARTICLE-01: 파티클 이미터 ✅ 완료 (2026-06-30)
**설명**: Three.js Points 기반 파티클 효과를 씬에 배치한다.

**AC:**
- [x] AssetBrowser **"파티클" 전용 탭**에 fire / dust / light / snow 프리셋 버튼이 있으며 씬에 배치할 수 있다
- [x] Inspector에서 파티클 수, 크기, 색상, 속도, Spread, 프리셋을 편집할 수 있다
- [x] 불꽃(fire) / 먼지(dust) / 빛(light) / 눈(snow) 4가지 프리셋이 제공된다
- [x] 파티클 설정은 ObjectNodeSchema의 `particle` 필드에 저장된다 (필드명: `particle`, 타입: `ParticleConfig`)
- [x] 뷰어에서 동일한 파티클 효과가 재생된다 (`ParticleEmitter` 컴포넌트, `src/components/three/ParticleEmitter.tsx`)
- [x] `useFrame`으로 파티클 위치 애니메이션, 수명 초과 시 재방출

---

### FEAT-INTEGRATION-01: Event Bridge 통합 프리셋
**설명**: Shopify, WooCommerce, 카페24 등 주요 커머스 플랫폼과의 Event Bridge 연결 코드를 자동 생성한다.

**AC:**
- [ ] 에디터 대시보드 "Event Bridge" 섹션에 플랫폼 선택 드롭다운이 표시된다 (Shopify / WooCommerce / 카페24 / 직접 입력)
- [ ] 플랫폼 선택 시 해당 플랫폼에 맞는 연결 코드 스니펫이 자동 생성된다
- [ ] 생성된 스니펫은 클립보드 복사 버튼과 함께 표시된다
- [ ] 각 프리셋에 "이 코드를 어디에 붙여넣으면 되나요?" 안내 링크가 포함된다

---

### FEAT-SHORTCUT-01: 단축키 커스터마이징
**설명**: 에디터 주요 액션의 단축키를 사용자가 직접 지정한다.

**AC:**
- [ ] 에디터 설정 패널에 단축키 목록이 표시된다
- [ ] 항목 클릭 후 키 입력 시 해당 단축키가 변경된다
- [ ] 충돌하는 단축키 입력 시 경고 메시지가 표시된다
- [ ] 설정값은 `localStorage`에 저장되며 새로고침 후에도 유지된다
- [ ] "기본값으로 초기화" 버튼으로 전체 단축키를 리셋할 수 있다

---

### FEAT-COMMENT-01: 댓글 / 피드백 모드
**설명**: 3D 공간 내 특정 위치에 텍스트 메모를 남겨 팀원과 피드백을 주고받는다.

**AC:**
- [ ] ViewportToolbar에 `[리뷰 모드]` 토글이 있다
- [ ] 리뷰 모드에서 씬 클릭 시 해당 3D 위치에 메모 마커가 생성된다
- [ ] 마커 클릭 시 텍스트 입력창이 표시되며 코멘트를 저장할 수 있다
- [ ] 코멘트는 `scene_comments` 테이블에 저장되며 작성자/날짜가 기록된다
- [ ] 코멘트 URL을 공유하면 같은 씬에 접속한 팀원이 동일 마커를 확인할 수 있다
- [ ] 코멘트 해결 시 "완료" 체크로 마커를 닫을 수 있다

---

## PHASE 5: 엔터프라이즈 / AI

---

### FEAT-MARKET-01: 3D 에셋 마켓플레이스
**설명**: 플랫폼 내 공용 .glb 에셋 라이브러리를 제공하여 진입 장벽을 낮춘다.

**AC:**
- [ ] 에셋 브라우저에 "마켓플레이스" 탭이 표시된다
- [ ] 카테고리(가구, 건물, 자연, 소품 등) 및 검색으로 에셋을 탐색할 수 있다
- [ ] 에셋 클릭 시 프로젝트에 추가(다운로드)되고 즉시 씬에 배치 가능하다
- [ ] 무료 에셋과 유료 에셋이 구분 표시된다
- [ ] Business 플랜에서 자신의 에셋을 마켓플레이스에 등록(판매)할 수 있다

---

### FEAT-COLLAB-01: 실시간 협업 (Multi-user Editing)
**설명**: 여러 사용자가 동시에 같은 씬을 편집한다.

**AC:**
- [ ] 같은 씬에 접속한 여러 에디터 유저의 커서와 선택 오브젝트가 실시간으로 표시된다
- [ ] 동시 편집 시 CRDT 방식으로 충돌이 자동 해결된다
- [ ] 다른 유저가 편집 중인 오브젝트는 잠금 표시가 된다
- [ ] 에디터 상단에 현재 접속 중인 유저 아바타 목록이 표시된다

---

### FEAT-AI-01: AI 자동 배치
**설명**: 텍스트 프롬프트 입력으로 AI가 에셋 배치를 제안한다.

**AC:**
- [ ] 에디터에 텍스트 입력창이 있으며 "카페 분위기의 공간 만들어줘" 같은 자연어를 입력할 수 있다
- [ ] AI가 현재 프로젝트의 에셋 목록을 컨텍스트로 받아 배치 JSON을 생성한다
- [ ] 제안 결과가 씬에 미리보기로 표시되며 "적용" 또는 "취소"로 확정한다
- [ ] 적용된 AI 배치는 일반 오브젝트와 동일하게 편집/삭제/Undo가 가능하다
