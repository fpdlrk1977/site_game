<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 작업 진행 상황 (핸드오프 노트)

아래 파일에 프로젝트 현재 상태·핵심 아키텍처 결정·남은 작업이 정리돼 있다. 새 세션/다른 컴퓨터에서 작업을 이어갈 때 참고하고, 중요한 변경이 생기면 갱신할 것.

@doc/PROGRESS.md

## 브릭 조립 시스템 (2026-07-28~, 별도 관리)

격자 기반 브릭 조립이 새 주력 경로다. **이 작업의 진행 기록은 위 PROGRESS.md가 아니라 아래 두 문서에만 쓴다.**

- `doc/BRICK_SYSTEM.md` — 설계서(확정 수치·채택/미채택 사유·데이터 모델·로드맵)
- `doc/BRICK_PROGRESS.md` — 진행 기록 + **기능 누락 검증 체크리스트**. 작업 중간중간 이 체크리스트로 누락을 점검할 것
