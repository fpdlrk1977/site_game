# PROJECT_PLAN: No-Code 3D Canvas Map Editor & Publisher

## 1. 프로젝트 비전 및 목적
본 프로젝트는 웹 브라우저에서 구동되는 "노코드 3D 가상 공간 및 웹사이트 제작 플랫폼"이다. 사용자는 코딩 없이 GUI 에디터를 통해 3D 에셋을 배치하고 이벤트를 연결하며, 이를 배포(Publish)하여 최종 유저에게 인터랙티브 3D 뷰어로 제공한다.

### 핵심 배포 시나리오 3가지
1. **독립 URL 배포**: 플랫폼이 제공하는 `/space/:sceneId` URL로 바로 접근 가능한 독립 3D 페이지.
2. **커스텀 도메인 배포**: 사용자가 소유한 도메인(예: `game.myshop.com`)을 CNAME으로 연결하여 자체 브랜드 URL로 제공.
3. **기존 사이트 임베드 (Page Replacement)**: 기존 웹사이트의 특정 페이지에 `<script>` 태그 한 줄을 삽입하여 해당 페이지를 3D 월드로 교체. 기존 사이트의 버튼 액션(장바구니 추가, 결제 등)을 3D 월드 내 오브젝트 이벤트와 연결하는 **JavaScript Event Bridge**를 통해 기존 비즈니스 로직을 유지한 채 3D UX로 업그레이드 가능.

## 2. 시스템 핵심 대원칙 (AI 개발 시 절대 준수 사항)
- **Data-Driven Architecture**: 모든 3D 씬(Scene) 정보는 단일 JSON 스키마로 표현되어야 하며, 뷰어는 이 JSON 외에 어떠한 추가 비즈니스 로직 코드 없이 씬을 완벽히 재현해야 한다.
- **State Separation**: UI 상태(Zustand)와 3D 렌더링 컨텍스트(Three.js/R3F Scene Graph)는 철저히 단방향 데이터 흐름으로 동기화되어야 한다.
- **Strict Performance Boundary**: 모바일 브라우저 구동을 기본 전제로 하며, 초기 로딩 속도 및 60FPS 유지를 최우선 가치로 둔다.

## 3. 핵심 도메인 용어 정의
- **Project (프로젝트)**: 하나의 독립된 서비스 단위. 여러 씬과 전용 에셋 라이브러리를 가짐.
- **Scene (씬)**: 독립된 단일 3D 공간(예: 마을, 상점 내부).
- **Asset (에셋)**: 원본 3D 소스 파일(.glb) 및 메타데이터.
- **Object (오브젝트)**: 씬 내에 배치된 에셋의 인스턴스. 고유한 ID와 Transform 값을 가짐.
- **Prefab (프리팹)**: 계층 구조를 가진 오브젝트 군집의 재사용 가능한 템플릿.
- **Custom Domain (커스텀 도메인)**: 사용자 소유 도메인을 플랫폼 씬에 연결하는 기능. DNS CNAME + Next.js 미들웨어로 구현.
- **Embed Mode (임베드 모드)**: 기존 사이트에 `<script>` 태그로 3D 뷰어를 삽입하는 배포 방식.
- **Event Bridge (이벤트 브리지)**: 3D 뷰어 내 오브젝트 이벤트를 호스트 페이지의 JavaScript로 전달하는 통신 채널. `window.postMessage` 기반.