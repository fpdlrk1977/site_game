// GLB Blob → Storage 업로드 + assets DB 행 생성 + 썸네일 → AssetRefSchema 반환.
// AssetBrowser의 파일 업로드와 Merge/Boolean 등 '구운(bake) GLB' 등록이 이 경로를 공유한다.
import { createBrowserSupabase } from '@/lib/supabase';
import { generateGlbThumbnail } from '@/lib/glbThumbnail';
import type { AssetRefSchema } from '@/types/scene';

export async function uploadGlbBlob(
  body: Blob | File,
  name: string,
  projectId: string,
  assetType: AssetRefSchema['type'] = 'model',
): Promise<AssetRefSchema> {
  const supabase = createBrowserSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const assetId = crypto.randomUUID();
  const path = `assets/${projectId}/${assetId}.glb`;
  const { error: storageErr } = await supabase.storage
    .from('assets')
    .upload(path, body, { contentType: 'model/gltf-binary', upsert: false });
  if (storageErr) throw storageErr;

  // 공개 버킷의 만료 없는 public URL (0006 마이그레이션)
  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
  const { error: dbErr } = await supabase.from('assets').insert({
    id: assetId, project_id: projectId, owner_id: user.id,
    name,
    file_url: publicUrl, draco_url: publicUrl,
    mime_type: 'model/gltf-binary', size_bytes: body.size,
  });
  if (dbErr) { await supabase.storage.from('assets').remove([path]); throw dbErr; }

  // 썸네일 (실패해도 업로드 자체는 성공)
  let thumbnailUrl: string | undefined;
  try {
    const thumbBlob = await generateGlbThumbnail(body);
    if (thumbBlob) {
      const thumbPath = `assets/${projectId}/${assetId}_thumb.png`;
      const { error: thumbErr } = await supabase.storage
        .from('assets')
        .upload(thumbPath, thumbBlob, { contentType: 'image/png', upsert: false });
      if (!thumbErr) {
        thumbnailUrl = supabase.storage.from('assets').getPublicUrl(thumbPath).data.publicUrl;
      }
    }
  } catch { /* non-critical */ }

  return { id: assetId, name, dracoUrl: publicUrl, type: assetType, thumbnailUrl };
}

// 오디오 파일 업로드 → Storage + assets DB 행 → AssetRefSchema(type:'audio'). 썸네일/변환 없음.
export async function uploadAudioFile(file: File, projectId: string): Promise<AssetRefSchema> {
  const supabase = createBrowserSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const assetId = crypto.randomUUID();
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mp3').toLowerCase();
  const path = `assets/${projectId}/${assetId}.${ext}`;
  const mime = file.type || `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
  const { error: storageErr } = await supabase.storage
    .from('assets')
    .upload(path, file, { contentType: mime, upsert: false });
  if (storageErr) throw storageErr;

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
  const { error: dbErr } = await supabase.from('assets').insert({
    id: assetId, project_id: projectId, owner_id: user.id,
    name: file.name.replace(/\.[a-z0-9]+$/i, ''),
    file_url: publicUrl, draco_url: publicUrl,
    mime_type: mime, size_bytes: file.size,
  });
  if (dbErr) { await supabase.storage.from('assets').remove([path]); throw dbErr; }

  return { id: assetId, name: file.name.replace(/\.[a-z0-9]+$/i, ''), dracoUrl: publicUrl, type: 'audio' };
}

// 이미지 텍스처 업로드 → Storage + assets DB 행 → AssetRefSchema(type:'texture').
// 재질(map)·ground·boundary 등 표면 이미지가 이 경로를 공유 → 에셋 라이브러리(Textures 탭)에서 재사용 가능.
// 썸네일은 이미지 자체(thumbnailUrl = 원본 URL).
export async function uploadImageTexture(file: File, projectId: string): Promise<AssetRefSchema> {
  const supabase = createBrowserSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const assetId = crypto.randomUUID();
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'jpg').toLowerCase();
  const path = `textures/${projectId}/${assetId}.${ext}`;
  const mime = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const { error: storageErr } = await supabase.storage
    .from('assets')
    .upload(path, file, { contentType: mime, upsert: false });
  if (storageErr) throw storageErr;

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
  const name = file.name.replace(/\.[a-z0-9]+$/i, '');
  const { error: dbErr } = await supabase.from('assets').insert({
    id: assetId, project_id: projectId, owner_id: user.id,
    name,
    file_url: publicUrl, draco_url: publicUrl,
    mime_type: mime, size_bytes: file.size,
  });
  if (dbErr) { await supabase.storage.from('assets').remove([path]); throw dbErr; }

  return { id: assetId, name, dracoUrl: publicUrl, type: 'texture', thumbnailUrl: publicUrl };
}
