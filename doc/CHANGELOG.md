# CHANGELOG: 변경 이력 및 빌드 스냅샷

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