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

// 큰 텍스처 다운스케일 — 최대 변이 maxDim(2048) 넘으면 canvas로 축소. VRAM/대역폭 상한(성능).
//   포맷은 원본 유지(노멀맵 PNG는 무손실 보존). 이미 작으면 원본 그대로(재인코딩 안 함).
const MAX_TEXTURE_DIM = 2048;
async function downscaleImage(file: File): Promise<Blob> {
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (Math.max(width, height) <= MAX_TEXTURE_DIM) { bitmap.close(); return file; }
    const scale = MAX_TEXTURE_DIM / Math.max(width, height);
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    // PNG는 무손실 유지(노멀맵 등), 그 외는 JPEG 고품질.
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, outType, 0.92));
    return blob ?? file;
  } catch {
    return file; // 실패 시 원본 업로드(안전 폴백)
  }
}

// 이미지 텍스처 업로드 → Storage + assets DB 행 → AssetRefSchema(type:'texture').
// 재질(map)·ground·boundary 등 표면 이미지가 이 경로를 공유 → 에셋 라이브러리(Textures 탭)에서 재사용 가능.
// 썸네일은 이미지 자체(thumbnailUrl = 원본 URL). 업로드 전 2K로 다운스케일(성능).
export async function uploadImageTexture(file: File, projectId: string): Promise<AssetRefSchema> {
  const supabase = createBrowserSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const body = await downscaleImage(file);
  const assetId = crypto.randomUUID();
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'jpg').toLowerCase();
  const path = `textures/${projectId}/${assetId}.${ext}`;
  const mime = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const { error: storageErr } = await supabase.storage
    .from('assets')
    .upload(path, body, { contentType: mime, upsert: false });
  if (storageErr) throw storageErr;

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
  const name = file.name.replace(/\.[a-z0-9]+$/i, '');
  const { error: dbErr } = await supabase.from('assets').insert({
    id: assetId, project_id: projectId, owner_id: user.id,
    name,
    file_url: publicUrl, draco_url: publicUrl,
    mime_type: mime, size_bytes: body.size,
  });
  if (dbErr) { await supabase.storage.from('assets').remove([path]); throw dbErr; }

  return { id: assetId, name, dracoUrl: publicUrl, type: 'texture', thumbnailUrl: publicUrl };
}
