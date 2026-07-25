-- ============================================================
-- 0007_community — 커뮤니티/갤러리 소셜 레이어
--   프로필 · 좋아요 · 댓글 · 팔로우 · 태그 · 리믹스
-- ============================================================

-- ── 프로필 (공개 표시용: 사용자명·아바타·소개) ──────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  display_name text,
  avatar_url   text,
  bio          text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function set_updated_at();

-- 신규 가입 시 프로필 자동 생성(사용자명 = 이메일 앞부분 + id 조각으로 유일성 보장)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    split_part(coalesce(new.email, 'user'), '@', 1) || '_' || substr(new.id::text, 1, 4),
    split_part(coalesce(new.email, 'user'), '@', 1)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 기존 사용자 백필
insert into public.profiles (id, username, display_name)
select u.id,
       split_part(coalesce(u.email, 'user'), '@', 1) || '_' || substr(u.id::text, 1, 4),
       split_part(coalesce(u.email, 'user'), '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ── 프로젝트 확장: 태그 · 리믹스 출처 ────────────────────────
alter table public.projects add column if not exists tags text[] not null default '{}';
alter table public.projects add column if not exists remixed_from uuid references public.projects(id) on delete set null;
create index if not exists idx_projects_remixed_from on public.projects(remixed_from);
create index if not exists idx_projects_published on public.projects(is_published) where is_published = true;

-- ── 좋아요 ──────────────────────────────────────────────────
create table if not exists public.project_likes (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists idx_project_likes_project on public.project_likes(project_id);

-- ── 댓글 ────────────────────────────────────────────────────
create table if not exists public.project_comments (
  id         uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_project_comments_project on public.project_comments(project_id, created_at desc);

-- ── 팔로우 ──────────────────────────────────────────────────
create table if not exists public.user_follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists idx_user_follows_following on public.user_follows(following_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles         enable row level security;
alter table public.project_likes    enable row level security;
alter table public.project_comments enable row level security;
alter table public.user_follows     enable row level security;

-- 프로필: 누구나 조회, 본인만 수정
create policy "profiles read"   on public.profiles for select using (true);
create policy "profiles update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles insert" on public.profiles for insert with check (auth.uid() = id);

-- 좋아요: 누구나 조회, 본인 것만 추가/삭제
create policy "likes read"   on public.project_likes for select using (true);
create policy "likes insert" on public.project_likes for insert with check (auth.uid() = user_id);
create policy "likes delete" on public.project_likes for delete using (auth.uid() = user_id);

-- 댓글: 공개 프로젝트 댓글은 누구나 조회, 본인만 작성/삭제
create policy "comments read" on public.project_comments for select
  using (exists (select 1 from public.projects p where p.id = project_id and (p.is_published or p.owner_id = auth.uid())));
create policy "comments insert" on public.project_comments for insert with check (auth.uid() = user_id);
create policy "comments delete" on public.project_comments for delete using (auth.uid() = user_id);

-- 팔로우: 누구나 조회, 본인이 거는 것만
create policy "follows read"   on public.user_follows for select using (true);
create policy "follows insert" on public.user_follows for insert with check (auth.uid() = follower_id);
create policy "follows delete" on public.user_follows for delete using (auth.uid() = follower_id);
