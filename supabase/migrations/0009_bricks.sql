-- brick_chunks: 브릭 월드를 청크 단위로 저장 (doc/BRICK_SYSTEM.md §3.5)
--
-- ★ 순수 추가 마이그레이션이다 — 기존 테이블을 하나도 건드리지 않는다.
--   브릭을 안 쓰는 씬은 이 테이블에 행이 없고, 기존 동작에 아무 영향이 없다.
--
-- ★ 희소 저장: **비어 있지 않은 청크만** 행으로 존재한다.
--   그래서 무한 맵의 빈 공간은 저장 비용이 0이고, 로드는 카메라 주변 좌표 범위만 조회한다.
--
-- ★ data가 bytea가 아니라 text(base64)인 이유:
--   PostgREST/supabase-js에서 bytea는 `\x...` 16진 문자열로 오가서 인코딩 실수가 나기 쉽다.
--   base64는 클라이언트에 이미 있는 경로(serialize.ts)를 그대로 쓴다. 용량은 약 33% 더 들지만
--   청크 하나가 수 KB라 실사용에서 문제되지 않는다. 나중에 bytea로 옮기려면 포맷 버전을 올린다.

create table if not exists public.brick_chunks (
  scene_id   uuid not null references public.scenes(id) on delete cascade,
  cx         int not null,
  cy         int not null,
  cz         int not null,
  data       text not null,
  updated_at timestamptz not null default now(),
  primary key (scene_id, cx, cy, cz)
);

-- 카메라 주변 청크 조회(scene_id + 좌표 범위)용
create index if not exists brick_chunks_scene_xz_idx
  on public.brick_chunks(scene_id, cx, cz);

alter table public.brick_chunks enable row level security;

-- ★ 정책은 `create policy if not exists`가 없다 → 다시 돌려도 되게 drop을 먼저 한다.
--   (첫 실행이 중간에 실패하면 일부만 만들어져 재실행이 막힌다)
drop policy if exists "brick_chunks: owner manages" on public.brick_chunks;
drop policy if exists "brick_chunks: public read for published scenes" on public.brick_chunks;

-- 소유자는 전부 가능 (scene_versions와 같은 패턴)
create policy "brick_chunks: owner manages"
  on public.brick_chunks for all
  using (
    exists (
      select 1 from public.scenes s
      join public.projects p on p.id = s.project_id
      where s.id = brick_chunks.scene_id
        and p.owner_id = auth.uid()
    )
  );

-- 게시된 것은 누구나 읽을 수 있어야 한다(뷰어가 브릭을 그려야 하므로)
--
-- ★ `is_published`는 **`projects`에 있다. `scenes`엔 없다.**
--   `scenes`의 공개 읽기 정책도 프로젝트를 조인해서 판정한다(0001_init.sql) — 같은 패턴을 쓴다.
create policy "brick_chunks: public read for published scenes"
  on public.brick_chunks for select
  using (
    exists (
      select 1 from public.scenes s
      join public.projects p on p.id = s.project_id
      where s.id = brick_chunks.scene_id
        and p.is_published = true
    )
  );
