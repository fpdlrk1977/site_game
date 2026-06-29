-- =============================================================
-- Storage: assets 버킷 + RLS
-- =============================================================

insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

-- 소유자만 업로드/수정/삭제
create policy "assets: owner upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'assets');

create policy "assets: owner update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'assets' and owner = auth.uid());

create policy "assets: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'assets' and owner = auth.uid());

-- 인증된 유저라면 읽기 허용 (에디터/뷰어 모두 signed URL 사용)
create policy "assets: authenticated read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'assets');
