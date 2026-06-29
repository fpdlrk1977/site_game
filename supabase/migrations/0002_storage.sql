-- =============================================================
-- Storage: thumbnails 버킷 + RLS
-- =============================================================

-- 버킷 생성 (public read)
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

-- 인증 유저: 업로드/수정/삭제 허용
create policy "thumbnails: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'thumbnails');

create policy "thumbnails: authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'thumbnails');

create policy "thumbnails: authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'thumbnails');

-- 누구나 읽기 허용 (public bucket)
create policy "thumbnails: public read"
  on storage.objects for select
  using (bucket_id = 'thumbnails');
