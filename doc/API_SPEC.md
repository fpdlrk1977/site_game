# API_SPEC: Supabase 데이터베이스 및 API 명세

---

## 1. 데이터베이스 테이블 (PostgreSQL)

### projects

```sql
-- custom_domain, default_scene_id는 처음부터 포함 (ALTER TABLE 없음)
-- default_scene_id: 커스텀 도메인 접속 시 열리는 씬. 첫 씬 생성 후 UPDATE로 세팅.
CREATE TABLE projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  custom_domain     TEXT UNIQUE,         -- 사용자 연결 도메인 (예: shop.mysite.com)
  default_scene_id  UUID,                -- 외래키는 scenes 생성 후 추가 (아래 참조)
  thumbnail_url     TEXT,                -- 씬 저장 시 WebGL 캡처 이미지 URL
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### scenes

```sql
CREATE TABLE scenes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Scene 1',
  scene_data  JSONB NOT NULL,           -- ProjectSceneSchema 전체를 저장
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### assets

```sql
CREATE TABLE assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  original_url  TEXT NOT NULL,          -- Supabase Storage 원본 .glb URL
  draco_url     TEXT,                   -- Draco 압축 완료 후 채워짐
  thumbnail_url TEXT,                   -- AssetBrowser 타일 표시용 미리보기 이미지 URL
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- projects.default_scene_id 외래키는 scenes 테이블 생성 후 추가
ALTER TABLE projects
  ADD CONSTRAINT fk_default_scene
  FOREIGN KEY (default_scene_id) REFERENCES scenes(id) ON DELETE SET NULL;

-- Phase 3: 씬 뷰어 통계 이벤트
CREATE TABLE scene_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id   UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'click', 'area_enter')),
  object_id  TEXT,              -- click/area_enter 시 해당 objectId
  visitor_ip TEXT,              -- 익명 통계용 (해시 처리 권장)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 4: 씬 버전 히스토리 (최대 30개)
CREATE TABLE scene_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id    UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  scene_data  JSONB NOT NULL,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 4: 댓글/피드백
CREATE TABLE scene_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id    UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  position    JSONB NOT NULL,   -- { x, y, z } 3D 위치
  content     TEXT NOT NULL,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### users_plan

```sql
-- 플랜 정보. 결제 웹훅(서비스 역할)이 업데이트, 유저는 자신 것만 조회 가능
CREATE TABLE users_plan (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier   TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'business')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 2. Row Level Security (RLS)

```sql
-- projects: 소유자만 CRUD
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON projects
  USING (owner_id = auth.uid());

-- scenes: 프로젝트 소유자만 CRUD
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON scenes
  USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- scenes: 공개 읽기 허용 (배포된 뷰어가 인증 없이 접근 가능)
CREATE POLICY "public_read" ON scenes
  FOR SELECT USING (true);

-- assets: 프로젝트 소유자만 CRUD
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all" ON assets
  USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );

-- users_plan: 본인만 조회, 수정은 서비스 역할(결제 웹훅)만
ALTER TABLE users_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self_read" ON users_plan FOR SELECT USING (user_id = auth.uid());
```

---

## 3. Storage 버킷

| 버킷명 | 용도 | 접근 |
|---|---|---|
| `assets-raw` | 유저가 업로드한 원본 `.glb` 파일 | 인증 필요 (소유자만) |
| `assets-draco` | Draco 압축 완료 파일 | 공개 읽기 허용 |

```sql
-- assets-draco 버킷 공개 정책
INSERT INTO storage.buckets (id, name, public) VALUES ('assets-draco', 'assets-draco', true);
```

---

## 4. Next.js API Routes

### GET /api/scenes/[sceneId]

**파일**: `src/app/api/scenes/[sceneId]/route.ts`

**목적**: 런타임 뷰어가 인증 없이 씬 JSON을 fetch하는 공개 엔드포인트.

**응답:**
```typescript
// 200 OK
{
  sceneId: string;
  scene_data: ProjectSceneSchema;
}

// 404 Not Found
{ error: 'Scene not found' }
```

**구현 패턴:**
```typescript
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request, { params }: { params: { sceneId: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data, error } = await supabase
    .from('scenes')
    .select('id, scene_data')
    .eq('id', params.sceneId)
    .single();

  if (error || !data) return Response.json({ error: 'Scene not found' }, { status: 404 });
  return Response.json({ sceneId: data.id, scene_data: data.scene_data });
}
```

---

## 5. 에디터 클라이언트 Supabase 쿼리

모든 쿼리는 `src/lib/supabase.ts`의 클라이언트를 통해서만 호출한다.

### 씬 저장 (upsert)
```typescript
await supabase
  .from('scenes')
  .upsert({
    id: sceneId,
    project_id: projectId,
    scene_data: serializedScene,
    version: currentVersion + 1,
    updated_at: new Date().toISOString(),
  });
```

### 씬 불러오기
```typescript
const { data } = await supabase
  .from('scenes')
  .select('*')
  .eq('id', sceneId)
  .single();
```

### 에셋 목록 조회
```typescript
const { data } = await supabase
  .from('assets')
  .select('*')
  .eq('project_id', projectId)
  .order('created_at', { ascending: false });
```

---

## 6. Edge Function: process-asset

**파일**: `supabase/functions/process-asset/index.ts`

**트리거**: `assets-raw` 버킷에 파일 업로드 완료 시 자동 실행

**처리 흐름:**
1. `assets-raw` 버킷에서 원본 `.glb` 파일 다운로드
2. `gltf-pipeline`으로 Draco 압축 실행
3. 압축 결과물을 `assets-draco` 버킷에 동일 경로로 업로드
4. `assets` 테이블의 `draco_url` 컬럼 업데이트

**환경 변수 (Supabase Dashboard에서 설정):**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

---

## 7. Next.js 미들웨어 (`src/middleware.ts`)

**두 가지 역할을 담당한다:**

### 7-A. 인증 보호 (대시보드 / 에디터 접근 제한)

```typescript
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN!; // 환경 변수 필수

const PROTECTED_PATHS = ['/dashboard', '/editor'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const host = req.headers.get('host') ?? '';
  const pathname = req.nextUrl.pathname;

  // ── 커스텀 도메인 처리 ──────────────────────────────────────────
  if (!host.endsWith(PLATFORM_DOMAIN)) {
    const apiRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/projects?custom_domain=eq.${host}&select=default_scene_id`,
      { headers: { apikey: process.env.SUPABASE_SERVICE_KEY! } }
    );
    const [project] = await apiRes.json();
    if (!project?.default_scene_id) return NextResponse.next();
    return NextResponse.rewrite(new URL(`/space/${project.default_scene_id}`, req.url));
  }

  // ── 인증 보호 (플랫폼 도메인일 때만) ──────────────────────────
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (isProtected) {
    const supabase = createMiddlewareClient({ req, res });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
```

### 7-B. 환경 변수 추가 (섹션 9 참조)
`NEXT_PUBLIC_PLATFORM_DOMAIN` 환경 변수를 반드시 설정해야 한다 (`park3d.com` 등).

---

## 8. 임베드 번들 (`embed.js`) 빌드 전략

- Next.js 앱과 **별도의 Vite 번들**로 관리 (`embed/` 디렉토리)
- 진입점: `embed/main.tsx` — `document.querySelector('#park3d-root')`에 React 앱 마운트
- `data-scene` 어트리뷰트에서 sceneId를 읽어 씬 fetch
- 에디터 코드(`components/editor/`) 완전 배제
- 빌드 결과물: `public/embed.js` (CDN 배포)

**Event Bridge 구현 (`components/viewer/EventHandler.tsx` 내):**
```typescript
function emitBridgeEvent(eventName: string, payload: Record<string, unknown>) {
  const fullName = `park3d:${eventName}`;

  // 임베드 모드: 부모 프레임으로 postMessage
  if (window.parent !== window) {
    window.parent.postMessage({ type: fullName, payload }, '*');
  }

  // 모든 모드: 자체 window에도 CustomEvent 발행
  window.dispatchEvent(new CustomEvent(fullName, { detail: payload }));
}
```

---

## 9. 환경 변수 (.env.local)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...             # API Route 및 미들웨어 전용 (클라이언트 번들 금지)

# 플랫폼 도메인 — 미들웨어에서 커스텀 도메인 판별에 사용
NEXT_PUBLIC_PLATFORM_DOMAIN=park3d.com  # 로컬: localhost:3000
```

---

## 10. 프로젝트 + 씬 생성 트랜잭션 (순환 참조 해결)

`projects.default_scene_id`가 `scenes`를 참조하므로 동시에 INSERT할 수 없다.
항상 아래 순서를 따른다:

```typescript
// Step 1: 프로젝트 먼저 생성 (default_scene_id = null)
const { data: project } = await supabase
  .from('projects')
  .insert({ name: projectName, owner_id: userId })
  .select()
  .single();

// Step 2: 첫 씬 생성
const emptyScene = createEmptyScene(project.id, crypto.randomUUID());
const { data: scene } = await supabase
  .from('scenes')
  .insert({ project_id: project.id, name: 'Scene 1', scene_data: emptyScene, version: 1 })
  .select()
  .single();

// Step 3: default_scene_id 업데이트
await supabase
  .from('projects')
  .update({ default_scene_id: scene.id })
  .eq('id', project.id);

// Step 4: 에디터로 이동
router.push(`/editor/${project.id}/${scene.id}`);
```

---

## 11. CORS 설정 (공개 API)

`/api/scenes/:sceneId`는 `embed.js`가 어떤 외부 도메인에서든 호출하므로 CORS 허용이 필수다.

```typescript
// src/app/api/scenes/[sceneId]/route.ts
export async function GET(req: Request, { params }) {
  // ... 기존 로직 ...
  return Response.json(data, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
```

---

## 12. Rate Limiting (공개 API 보호)

인증 없는 공개 엔드포인트 남용 방지. Vercel Edge Config 또는 Upstash Redis 기반 구현.

**전략**: IP당 분당 60회 요청 제한

```typescript
// src/app/api/scenes/[sceneId]/route.ts 상단에 추가
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),
});

export async function GET(req: Request, { params }) {
  const ip = req.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  if (!success) return Response.json({ error: 'Too many requests' }, { status: 429 });
  // ... 기존 로직 ...
}
```

**환경 변수 추가:**
```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

---

## 13. 에셋 삭제 시 Storage 정리

프로젝트 또는 에셋 삭제 시 Supabase Storage의 실제 파일도 함께 삭제해야 한다.  
DB cascade만으로는 Storage 파일이 남아 비용이 계속 발생한다.

**처리 방식**: `process-asset` Edge Function에 삭제 핸들러 추가, 또는 별도 `cleanup-asset` Edge Function.

```typescript
// supabase/functions/cleanup-asset/index.ts
// DB의 assets 행 삭제 직전 Webhook으로 호출 (Supabase Database Webhook 사용)
export default async function handler(req: Request) {
  const { record } = await req.json(); // 삭제될 assets 행
  const supabase = createClient(...);

  // assets-raw, assets-draco 버킷에서 파일 삭제
  const path = `${record.project_id}/${record.id}.glb`;
  await supabase.storage.from('assets-raw').remove([path]);
  await supabase.storage.from('assets-draco').remove([path]);
}
```

---

## 14. embed.js 버전 관리 전략

CDN에 올라간 `embed.js` 업데이트 시 기존 사용자 사이트에 Breaking Change가 전파되는 것을 방지한다.

**규칙**:
- 메이저 버전은 URL에 포함: `embed.v1.js`, `embed.v2.js`
- `embed.js`는 항상 최신 메이저 버전으로 redirect (하위 호환 깨질 때만 메이저 올림)
- 에디터 대시보드에서 복사되는 스니펫은 항상 버전 명시 URL 사용

```html
<!-- 에디터에서 제공하는 스니펫 (버전 명시) -->
<script src="https://cdn.park3d.com/embed.v1.js" data-scene="SCENE_ID"></script>
```

**환경 변수 추가:**
```bash
NEXT_PUBLIC_EMBED_VERSION=v1   # 현재 지원 메이저 버전
```
