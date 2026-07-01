// Supabase Edge Function: cleanup-asset
//
// 트리거: Database Webhook — public.assets 테이블 DELETE
//   (Dashboard > Database > Webhooks 에서 직접 등록 필요)
//   조건: table = assets, schema = public, event = DELETE
//
// 역할: assets 행이 삭제될 때, DB cascade만으로는 지워지지 않는 Storage 파일
//       (원본 .glb + Draco 압축본)을 함께 제거해 스토리지 비용이 계속 쌓이는 것을 방지한다.

import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'assets';

interface DeleteWebhookPayload {
  type: string;
  table: string;
  old_record: { id: string; project_id: string } | null;
}

Deno.serve(async (req) => {
  let payload: DeleteWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const row = payload.old_record;
  if (payload.type !== 'DELETE' || !row) {
    return new Response('ignored', { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const paths = [
    `assets/${row.project_id}/${row.id}.glb`,
    `assets/${row.project_id}/${row.id}.draco.glb`,
  ];

  // 둘 중 하나가 애초에 없어도(압축 전 삭제 등) 에러 없이 넘어간다 — remove()는 존재하지 않는
  // 경로를 조용히 무시하므로 별도 존재 확인 없이 항상 두 경로 모두 시도해도 안전하다.
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error('cleanup-asset 실패:', error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, removed: paths }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
