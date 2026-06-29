-- =============================================================
-- Park3D  ·  Migration 0001 — Initial Schema
-- Run in Supabase Dashboard → SQL Editor → New query
-- =============================================================

-- ─── Extensions ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Helper: updated_at trigger ────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================
-- 1. users_plan
-- =============================================================
create table if not exists public.users_plan (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  plan_tier   text not null default 'free' check (plan_tier in ('free', 'pro', 'business')),
  started_at  timestamptz not null default now(),
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_users_plan_updated_at
  before update on public.users_plan
  for each row execute function set_updated_at();

-- auto-create free plan row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users_plan (user_id, plan_tier)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.users_plan enable row level security;

create policy "users_plan: user reads own"
  on public.users_plan for select
  using (auth.uid() = user_id);

create policy "users_plan: user updates own"
  on public.users_plan for update
  using (auth.uid() = user_id);

-- =============================================================
-- 2. projects
-- =============================================================
create table if not exists public.projects (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  name             text not null default '새 프로젝트',
  slug             text unique,                         -- URL slug (optional)
  description      text,
  thumbnail_url    text,
  custom_domain    text unique,
  default_scene_id uuid,                                -- FK added after scenes table
  is_published     boolean not null default false,
  meta             jsonb not null default '{}',          -- SEO, OG tags, etc.
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function set_updated_at();

create index idx_projects_owner on public.projects(owner_id);
create index idx_projects_custom_domain on public.projects(custom_domain) where custom_domain is not null;

-- RLS
alter table public.projects enable row level security;

create policy "projects: owner full access"
  on public.projects for all
  using (auth.uid() = owner_id);

create policy "projects: public read if published"
  on public.projects for select
  using (is_published = true);

-- =============================================================
-- 3. scenes
-- =============================================================
create table if not exists public.scenes (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null default '메인 씬',
  scene_data  jsonb not null default '{}',  -- full SceneJSON (see DATA_SCHEMA.md)
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_scenes_updated_at
  before update on public.scenes
  for each row execute function set_updated_at();

create index idx_scenes_project on public.scenes(project_id);

-- RLS  (owner access checked via project join)
alter table public.scenes enable row level security;

create policy "scenes: owner full access"
  on public.scenes for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = scenes.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "scenes: public read if project published"
  on public.scenes for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = scenes.project_id
        and p.is_published = true
    )
  );

-- =============================================================
-- 4. Back-fill: projects.default_scene_id FK
-- =============================================================
alter table public.projects
  add constraint fk_projects_default_scene
  foreign key (default_scene_id) references public.scenes(id)
  on delete set null
  deferrable initially deferred;

-- =============================================================
-- 5. assets
-- =============================================================
create table if not exists public.assets (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  file_url     text not null,
  draco_url    text,          -- compressed version (set after Draco job)
  mime_type    text not null,
  size_bytes   bigint not null default 0,
  meta         jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_assets_updated_at
  before update on public.assets
  for each row execute function set_updated_at();

create index idx_assets_project on public.assets(project_id);

-- RLS
alter table public.assets enable row level security;

create policy "assets: owner full access"
  on public.assets for all
  using (auth.uid() = owner_id);

-- =============================================================
-- 6. scene_versions  (for version history — Pro+)
-- =============================================================
create table if not exists public.scene_versions (
  id          uuid primary key default uuid_generate_v4(),
  scene_id    uuid not null references public.scenes(id) on delete cascade,
  version     integer not null,
  scene_data  jsonb not null,
  saved_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index idx_scene_versions_scene on public.scene_versions(scene_id, version desc);

alter table public.scene_versions enable row level security;

create policy "scene_versions: owner full access"
  on public.scene_versions for all
  using (
    exists (
      select 1 from public.scenes s
      join public.projects p on p.id = s.project_id
      where s.id = scene_versions.scene_id
        and p.owner_id = auth.uid()
    )
  );

-- =============================================================
-- 7. scene_events  (analytics — Pro+)
-- =============================================================
create table if not exists public.scene_events (
  id          bigserial primary key,
  scene_id    uuid not null references public.scenes(id) on delete cascade,
  event_type  text not null,  -- 'view' | 'click' | 'object_interact'
  object_id   text,
  visitor_id  text,           -- anonymous fingerprint
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index idx_scene_events_scene on public.scene_events(scene_id, created_at desc);

alter table public.scene_events enable row level security;

create policy "scene_events: owner reads own"
  on public.scene_events for select
  using (
    exists (
      select 1 from public.scenes s
      join public.projects p on p.id = s.project_id
      where s.id = scene_events.scene_id
        and p.owner_id = auth.uid()
    )
  );

-- anon can INSERT events (viewer tracking)
create policy "scene_events: anon can insert"
  on public.scene_events for insert
  with check (true);
