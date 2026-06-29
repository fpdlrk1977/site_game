-- scene_versions: 씬 저장 이력 (최대 30개)
create table if not exists public.scene_versions (
  id          uuid primary key default gen_random_uuid(),
  scene_id    uuid not null references public.scenes(id) on delete cascade,
  scene_data  jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists scene_versions_scene_id_created_at_idx
  on public.scene_versions(scene_id, created_at desc);

alter table public.scene_versions enable row level security;

create policy "scene_versions: owner manages"
  on public.scene_versions for all
  using (
    exists (
      select 1 from public.scenes s
      join public.projects p on p.id = s.project_id
      where s.id = scene_versions.scene_id
        and p.owner_id = auth.uid()
    )
  );
