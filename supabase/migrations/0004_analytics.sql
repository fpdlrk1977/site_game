-- scene_events: 뷰어 방문 / 오브젝트 클릭 이벤트 수집
create table if not exists public.scene_events (
  id          uuid primary key default gen_random_uuid(),
  scene_id    uuid not null references public.scenes(id) on delete cascade,
  event_type  text not null check (event_type in ('view', 'click', 'area_enter')),
  object_id   text,
  object_name text,
  created_at  timestamptz not null default now()
);

create index if not exists scene_events_scene_id_idx on public.scene_events(scene_id);
create index if not exists scene_events_created_at_idx on public.scene_events(created_at);

-- RLS: 누구나 insert (익명 뷰어도 수집), 소유자만 select
alter table public.scene_events enable row level security;

create policy "scene_events: anyone inserts"
  on public.scene_events for insert
  with check (true);

create policy "scene_events: owner reads"
  on public.scene_events for select
  using (
    exists (
      select 1 from public.scenes s
      join public.projects p on p.id = s.project_id
      where s.id = scene_events.scene_id
        and p.owner_id = auth.uid()
    )
  );
