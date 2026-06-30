# CHANGELOG: 변경 이력 및 빌드 스냅샷

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