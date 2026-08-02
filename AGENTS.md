<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 프로젝트 한 줄 요약

코드 없이 GUI로 3D 공간/웹사이트를 만들고 배포하는 노코드 SaaS. **격자 기반 브릭(레고형) 조립이 주력 경로**다.

## 기술 스택 · 실행

- **에디터/뷰어**: Next.js 16(App Router) + React 19 + React Three Fiber + Three.js
- **상태**: Zustand · **물리**: Rapier · **백엔드**: Supabase(Postgres + Storage + Auth)
- `npm run dev` → http://localhost:3000. **`.env.local`(Supabase URL/키) 필수** — `.gitignore`라 다른 컴퓨터에선 직접 복사해야 한다.
- 마이그레이션 `supabase/migrations/` (현재 0009까지). 새 환경은 순서대로 실행.

## 변경 주의 (인프라)

- **Next.js 16**: 미들웨어 파일은 `src/proxy.ts`, 함수명 `proxy`(not middleware).
- **@supabase/ssr**: `getUser()` 사용 — `getSession()`은 보안 취약.
- **뷰어 RLS 우회**: `createServiceSupabase()` + 수동 소유자 체크. `is_published` 씬만 외부 노출.
- **저장 낙관적 잠금**: `scenes.version` 행 리비전으로 멀티탭 덮어쓰기 방지(`src/lib/saveScene.ts`).

---

# 🧱 브릭 조립 시스템 — 여기가 본진

**진입점은 `doc/BRICK_PROGRESS.md`**(현재 상태 · 다음 할 일 · 문서 지도). 브릭 작업 기록은 전부 `BRICK_*` 문서에만 쓴다.

| 문서 | 언제 |
|---|---|
| `doc/BRICK_PROGRESS.md` | 이어서 작업할 때 **먼저** — 현재 상태·다음 할 일 |
| **`doc/BRICK_PITFALLS.md`** | **브릭 코드를 건드리기 전에 매번** — 반복해서 터진 함정 |
| `doc/BRICK_PLAN.md` | 남은 작업 계획. **여기 안 적힌 건 안 만든다** — 하고 싶어지면 문서를 먼저 고치고 확인을 받는다 |
| `doc/BRICK_SYSTEM.md` | 설계(확정 수치·채택/미채택 사유·데이터 모델) |
| `doc/BRICK_CHECKLIST.md` | 기능 누락 점검 |

### 🔴 브릭 작업을 시작하기 전에

1. **`doc/BRICK_PITFALLS.md`를 먼저 읽는다.** 같은 계열 버그(청크 세로 층·빈 청크의 두 가지 뜻·파생 인덱스·구운 빛)가 반복해서 터져 모아 둔 것이다. 새 코드보다 **이미 있는 것을 건드릴 때** 터진다.
2. 작업이 끝나면 **거기서 배운 함정을 그 파일에 추가**한다. 진행 기록만 쓰고 함정을 안 남기면 다음에 또 밟는다.
3. `doc/BRICK_CHECKLIST.md`로 중간중간 점검한다.
4. 끝나면 `doc/BRICK_PROGRESS.md`의 현재 상태·다음 할 일을 갱신한다. **세션 서사를 길게 쌓지 말 것** — 길어지면 `doc/archive/`로 뺀다.

> 아카이브(평소 읽지 않는다): `doc/archive/BRICK_LOG_2026-07.md` — 07-28~07-31 세션 로그 전문.
>
> **브릭 전환 이전 문서는 전부 삭제했다.** 구 오브젝트·이벤트·애니메이션·기즈모 시스템은 코드에서 사라졌는데 설계서만 남아 오해를 만들던 것이다(`src/types/scene.ts`가 옛 필드를 읽지 않고 버린다). 옛 기록이 필요하면 git 이력에 있다. **`doc/`에는 `BRICK_*`만 둔다.**
