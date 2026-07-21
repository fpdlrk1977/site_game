// 템플릿 빌드 검증 — `npx tsx src/lib/sceneTemplates.check.ts`
// 씬 데이터가 스키마를 통과하는지(normalize 후에도 오브젝트·환경이 유지되는지) 확인한다.
import { SCENE_TEMPLATES } from './sceneTemplates';
import { normalizeSceneData } from '@/types/scene';

let fail = 0;
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
