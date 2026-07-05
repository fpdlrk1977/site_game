-- =============================================================
-- assets 버킷 공개 전환 + 기존 signed URL → public URL 마이그레이션
--
-- 배경: 기존에는 업로드 시점에 1년짜리 signed URL을 발급해 그 문자열을
-- DB(assets.file_url/draco_url)와 scenes.scene_data에 그대로 저장했다.
-- 토큰 재발급 로직이 없어 1년 뒤 모든 에셋 링크가 일괄 만료되는 구조였음.
-- 공개 씬(/space, /embed)은 어차피 비로그인 방문자에게 에셋 URL이 노출되므로
-- 버킷을 공개로 전환하고 만료 없는 public URL을 사용한다 (thumbnails 버킷과 동일).
-- =============================================================

-- 1. 버킷 공개 전환
update storage.buckets set public = true where id = 'assets';

-- 2. 공개 읽기 정책 (thumbnails와 동일 패턴 — 기존 authenticated read 정책과 병존)
create policy "assets: public read"
  on storage.objects for select
  using (bucket_id = 'assets');

-- 3. assets 테이블의 signed URL → public URL 변환
--    .../storage/v1/object/sign/assets/<path>?token=... → .../storage/v1/object/public/assets/<path>
update public.assets
set
  file_url  = regexp_replace(file_url,  '/storage/v1/object/sign/assets/([^?]+)(\?.*)?$', '/storage/v1/object/public/assets/\1'),
  draco_url = regexp_replace(draco_url, '/storage/v1/object/sign/assets/([^?]+)(\?.*)?$', '/storage/v1/object/public/assets/\1')
where file_url  like '%/storage/v1/object/sign/assets/%'
   or draco_url like '%/storage/v1/object/sign/assets/%';

-- 4. scenes.scene_data(jsonb) 내부의 URL 변환
--    (assets[].dracoUrl, assets[].thumbnailUrl, environment.ground.textureUrl 등
--     JSON 문자열 값 안의 URL — 토큰은 base64url이라 따옴표를 포함하지 않아 안전)
update public.scenes
set scene_data = regexp_replace(
    scene_data::text,
    '/storage/v1/object/sign/assets/([^"?]+)(\?[^"]*)?',
    '/storage/v1/object/public/assets/\1',
    'g'
  )::jsonb
where scene_data::text like '%/storage/v1/object/sign/assets/%';

-- 5. scene_versions.scene_data(jsonb)도 동일하게 변환 (버전 복원 시 깨지지 않도록)
update public.scene_versions
set scene_data = regexp_replace(
    scene_data::text,
    '/storage/v1/object/sign/assets/([^"?]+)(\?[^"]*)?',
    '/storage/v1/object/public/assets/\1',
    'g'
  )::jsonb
where scene_data::text like '%/storage/v1/object/sign/assets/%';
