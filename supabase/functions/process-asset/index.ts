// Supabase Edge Function: process-asset
//
// 트리거: Database Webhook — storage.objects 테이블 INSERT
//   (Dashboard > Database > Webhooks 에서 직접 등록 필요, 이 코드만으로는 자동 연결되지 않음)
//   조건: table = objects, schema = storage, event = INSERT
//
// 역할: `assets` 버킷에 새 .glb가 업로드되면 원본을 내려받아 Draco 압축을 시도하고,
//       압축 결과를 같은 버킷의 형제 경로(*.draco.glb)에 올린 뒤 assets.draco_url을 갱신한다.
//
// 주의: WASM 기반 Draco 인코더(draco3dgltf)를 Deno의 npm: 스펙로 import한다.
//       이 부분은 로컬에서 실행/검증이 불가능했으므로 배포 후 실제 업로드로 확인이 필요하다.
//       압축이 실패해도 draco_url은 건드리지 않아, 클라이언트가 이미 설정해둔
//       원본 파일 URL(fallback)이 그대로 유지되어 기존 동작을 깨트리지 않는다.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { WebIO } from 'npm:@gltf-transform/core@4';
import { draco } from 'npm:@gltf-transform/functions@4';
import draco3d from 'npm:draco3dgltf@1';

const BUCKET = 'assets';

interface StorageWebhookPayload {
  type: string;
  table: string;
  record: { bucket_id: string; name: string } | null;
}

function parseAssetPath(objectPath: string): { projectId: string; assetId: string } | null {
  // 기대 형식: assets/<projectId>/<assetId>.glb  (AssetBrowser.tsx 업로드 경로와 일치)
  const match = objectPath.match(/^assets\/([^/]+)\/([^/.]+)\.glb$/i);
  if (!match) return null;
  return { projectId: match[1], assetId: match[2] };
}

Deno.serve(async (req) => {
  let payload: StorageWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const record = payload.record;
  if (!record || record.bucket_id !== BUCKET || !/\.glb$/i.test(record.name)) {
    return new Response('ignored', { status: 200 });
  }
  // 압축 결과물 자신의 업로드 이벤트는 무시 (무한 루프 방지)
  if (/\.draco\.glb$/i.test(record.name)) {
    return new Response('ignored (already compressed output)', { status: 200 });
  }

  const parsed = parseAssetPath(record.name);
  if (!parsed) {
    return new Response('unrecognized path, ignored', { status: 200 });
  }
  const { projectId, assetId } = parsed;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { data: original, error: downloadErr } = await supabase.storage
      .from(BUCKET)
      .download(record.name);
    if (downloadErr || !original) throw downloadErr ?? new Error('원본 다운로드 실패');

    const originalBuffer = new Uint8Array(await original.arrayBuffer());

    // Draco 압축 시도 — 실패해도 함수 전체가 죽지 않고 여기서만 그친다 (draco_url 미변경)
    const io = new WebIO();
    const document = await io.readBinary(originalBuffer);
    await document.transform(
      draco({ encoder: await draco3d.createEncoderModule() }),
    );
    const compressedBytes = await io.writeBinary(document);

    const compressedPath = `assets/${projectId}/${assetId}.draco.glb`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(compressedPath, compressedBytes, {
        contentType: 'model/gltf-binary',
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    const { data: signedData, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(compressedPath, 60 * 60 * 24 * 365);
    if (signErr || !signedData?.signedUrl) throw signErr ?? new Error('signed URL 생성 실패');

    const { error: dbErr } = await supabase
      .from('assets')
      .update({ draco_url: signedData.signedUrl })
      .eq('id', assetId);
    if (dbErr) throw dbErr;

    return new Response(
      JSON.stringify({ ok: true, assetId, compressedPath, originalSize: originalBuffer.byteLength, compressedSize: compressedBytes.byteLength }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    // 실패해도 원본 draco_url(=원본 파일 URL)이 그대로 남아있으므로 에셋 사용에는 지장 없음
    console.error('process-asset 실패:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 200, // 웹훅 재시도 폭주 방지를 위해 200으로 응답 (에러는 로그로만 남김)
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
