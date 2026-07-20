// 카메라 제한 결정론 테스트 — `npx tsx src/lib/cameraLimits.test.ts`
//   설정 UI(exploreCamera)는 제거됐고, 남은 관심사는 하나: **저장한 시작 뷰가 잘리지 않는가.**
import { cameraLimits, DEFAULT_MAX_POLAR, DEFAULT_MAX_DISTANCE } from './cameraLimits';
import type { EnvSchema } from '@/types/scene';

const R2D = 180 / Math.PI;
let pass = 0, fail = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;
const env = (partial: Partial<EnvSchema>): EnvSchema => ({ ...(partial as EnvSchema) });

// 정면 시점: 수평 10m + 높이 2m → polar ≈ 78.7°, 거리 ≈ 10.2m
const FRONT = { position: { x: 0, y: 2, z: 10 }, target: { x: 0, y: 0, z: 0 } };

console.log('\n[1] 시작 뷰 없음 → 기본 제한');
{
  const r = cameraLimits(env({}));
  check('maxPolar = 기본(≈88.9°)', near(r.effective.maxPolar, DEFAULT_MAX_POLAR));
  check('거리 1~200m', r.effective.minDistance === 1 && r.effective.maxDistance === 200);
  check('widened=false', !r.widened && r.startView === null);
}

console.log('\n[2] 일반적인 정면 시작 뷰 → 기본 제한 안에 들어가므로 그대로');
{
  const r = cameraLimits(env({ startView: FRONT }));
  check('startView polar ≈ 78.7°', near(r.startView!.polar * R2D, 78.69, 0.05));
  check('기본 제한 유지(넓힐 필요 없음)', !r.widened);
  check('maxPolar 기본값', near(r.effective.maxPolar, DEFAULT_MAX_POLAR));
}

console.log('\n[3] ★ 기본 거리 한도(200m)보다 멀리서 저장 → 거리 제한이 넓어짐');
{
  const far = { position: { x: 0, y: 50, z: 400 }, target: { x: 0, y: 0, z: 0 } };
  const r = cameraLimits(env({ startView: far }));
  const d = r.startView!.distance;
  check('거리 > 200m', d > DEFAULT_MAX_DISTANCE);
  check('maxDistance가 시작 뷰까지 확장', near(r.effective.maxDistance, d));
  check('widened=true', r.widened);
}

console.log('\n[4] ★ 아주 가까이(1m 미만)서 저장 → 가까이 한도가 내려감');
{
  const close = { position: { x: 0, y: 0.2, z: 0.4 }, target: { x: 0, y: 0, z: 0 } };
  const r = cameraLimits(env({ startView: close }));
  check('거리 < 1m', r.startView!.distance < 1);
  check('minDistance가 시작 뷰까지 내려감', near(r.effective.minDistance, r.startView!.distance));
  check('widened=true', r.widened);
}

console.log('\n[5] 피사체보다 아래에서 저장(polar > 90°) → 지평선 아래로는 열지 않음');
{
  const below = { position: { x: 0, y: -5, z: 5 }, target: { x: 0, y: 0, z: 0 } };
  const r = cameraLimits(env({ startView: below }));
  check('startView polar > 90°', r.startView!.polar * R2D > 90);
  check('maxPolar는 기본 상한을 넘지 않음', r.effective.maxPolar <= DEFAULT_MAX_POLAR + 1e-9,
    `got ${(r.effective.maxPolar * R2D).toFixed(2)}`);
}

console.log('\n[6] 카메라와 타겟이 같은 지점(퇴화) → 기본값으로 안전 폴백');
{
  const degenerate = { position: { x: 1, y: 1, z: 1 }, target: { x: 1, y: 1, z: 1 } };
  const r = cameraLimits(env({ startView: degenerate }));
  check('startView = null 처리', r.startView === null);
  check('기본 제한 유지', near(r.effective.maxPolar, DEFAULT_MAX_POLAR) && !r.widened);
}

console.log(`\n결과: ${pass}/${pass + fail} 통과${fail ? ` (실패 ${fail})` : ''}\n`);
process.exit(fail ? 1 : 0);
