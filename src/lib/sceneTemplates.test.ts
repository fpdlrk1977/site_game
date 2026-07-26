// 템플릿 빌드 검증 — `npx tsx src/lib/sceneTemplates.check.ts`
// 씬 데이터가 스키마를 통과하는지(normalize 후에도 오브젝트·환경이 유지되는지) 확인한다.
import { SCENE_TEMPLATES } from './sceneTemplates';
import { SCENE_TEMPLATE_META } from './sceneTemplateMeta';
import { normalizeSceneData } from '@/types/scene';

let fail = 0;

// 대시보드가 쓰는 경량 메타(sceneTemplateMeta)가 실제 템플릿과 어긋나지 않는지.
// 어긋나면 "존재하지 않는 템플릿" 카드가 대시보드에 떠서 빈 씬이 만들어진다.
for (const m of SCENE_TEMPLATE_META) {
  const t = SCENE_TEMPLATES.find((x) => x.id === m.id);
  if (!t) { fail++; console.error(`✗ meta '${m.id}' 에 해당하는 템플릿 없음`); continue; }
  if (t.name !== m.name) { fail++; console.error(`✗ meta '${m.id}' 이름 불일치: ${m.name} vs ${t.name}`); }
}
for (const t of SCENE_TEMPLATES) {
  if (!SCENE_TEMPLATE_META.some((m) => m.id === t.id)) {
    fail++; console.error(`✗ 템플릿 '${t.id}' 가 메타 목록에 없음(대시보드에 안 뜸)`);
  }
}

for (const t of SCENE_TEMPLATES) {
  const built = t.build('p-test', 's-test');
  const norm = normalizeSceneData(built as unknown as Record<string, unknown>, 'p-test', 's-test');
  const lights = norm.objects.filter((o) => o.light).length;
  const shadowCasters = norm.objects.filter((o) => o.render?.castShadow).length;
  const ids = new Set(norm.objects.map((o) => o.id));
  const dup = ids.size !== norm.objects.length;
  const badParent = norm.objects.some((o) => o.parentId && !ids.has(o.parentId));

  if (dup || badParent || norm.objects.length !== built.objects.length) fail++;
  console.log(
    `${dup || badParent ? '✗' : '✓'} ${t.id.padEnd(10)} obj=${String(norm.objects.length).padStart(2)} ` +
    `light=${lights} shadowCast=${shadowCasters} ` +
    `sky=${norm.environment.sky.type} sun=${norm.environment.lights.sunEnabled !== false ? 'on' : 'off'} ` +
    `startView=${norm.environment.startView ? 'yes' : '-'}`,
  );
}
console.log(fail === 0 ? '\n✅ 전 템플릿 정상' : `\n❌ ${fail}개 실패`);
process.exit(fail === 0 ? 0 : 1);
