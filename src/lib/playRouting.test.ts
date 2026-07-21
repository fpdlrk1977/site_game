// 플레이 라우팅 결정론 테스트 — `npx tsx src/lib/playRouting.test.ts`
//
// 이 파일의 존재 이유: 라우팅이 흩어진 filter 체인이던 동안 **같은 종류의 버그가 4번** 났다.
// 전부 "조건 하나를 빠뜨려도 에러 없이 조용히 틀리는" 형태였으므로, 아래 두 불변식과
// 실제로 났던 4개 버그를 회귀 케이스로 고정한다.
//   불변식 A — 상호배타: 한 오브젝트는 정확히 한 버킷.
//   불변식 B — 전수커버: 분류에서 빠지는 오브젝트가 없다.
import { classifyPlayObjects, type PlayBucket } from './playRouting';
import type { ObjectNodeSchema } from '@/types/scene';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

function obj(o: Partial<ObjectNodeSchema> & { id: string }): ObjectNodeSchema {
  return {
    name: o.id, assetId: null, parentId: null, layer: 'default',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
    visible: true, locked: false,
    physics: { enabled: false, mass: 0, isSensor: false, restitution: 0, friction: 0.5 } as ObjectNodeSchema['physics'],
    events: [],
    ...o,
  } as ObjectNodeSchema;
}
const ACT = (collider = false) => ({ kind: 'rotate' as const, axis: 'y' as const, min: 0, max: 90, drive: 'oscillate' as const, collider });
const MOT = (collider = false) => ({ type: 'spin' as const, speed: 1, collider } as ObjectNodeSchema['motion']);

function bucket(objects: ObjectNodeSchema[], id: string, opts = {}): PlayBucket | undefined {
  return classifyPlayObjects(objects, opts).get(id);
}

// ── 불변식 A·B — 모든 조합에서 정확히 한 버킷 ───────────────────────
console.log('\n1. 불변식 — 상호배타 + 전수커버 (조합 매트릭스)');
{
  const variants: ObjectNodeSchema[] = [];
  let n = 0;
  for (const isGroup of [false, true])
    for (const isActuator of [false, true])
      for (const act of [undefined, ACT(false), ACT(true)])
        for (const mot of [undefined, MOT(false), MOT(true)])
          for (const physics of [false, true])
            for (const visible of [true, false]) {
              n += 1;
              variants.push(obj({
                id: `v${n}`, isGroup, isActuator: isActuator || undefined,
                actuator: act, motion: mot, visible,
                physics: { enabled: physics, mass: 0, isSensor: false, restitution: 0, friction: 0.5 } as ObjectNodeSchema['physics'],
              }));
            }
  const map = classifyPlayObjects(variants);
  check(`전수커버 — ${variants.length}개 전부 분류됨`, map.size === variants.length,
    `분류 ${map.size} / 전체 ${variants.length}`);
  check('상호배타 — Map이므로 id당 버킷 1개', new Set(map.keys()).size === map.size);
  const undef = variants.filter((v) => !map.get(v.id));
  check('버킷 미지정 0건', undef.length === 0, undef.map((v) => v.id).join(','));
}

// ── 회귀 ① 유령 콜라이더 — 움직이는데 콜라이더가 원래 자리에 남던 것 ──
console.log('\n2. 회귀① 유령 콜라이더 — 모션/관절(콜라이더 OFF)은 정적 콜라이더를 받지 않는다');
{
  const os = [
    obj({ id: 'motion', motion: MOT(false) }),
    obj({ id: 'act', actuator: ACT(false) }),
    obj({ id: 'plain' }),
  ];
  check('모션(콜라이더 OFF) → 시각 전용', bucket(os, 'motion') === 'visual-motion', bucket(os, 'motion'));
  check('관절(콜라이더 OFF) → 시각 전용', bucket(os, 'act') === 'actuator-visual', bucket(os, 'act'));
  check('평범한 오브젝트 → 정적 콜라이더', bucket(os, 'plain') === 'auto', bucket(os, 'plain'));
}

// ── 회귀 ② 이중 렌더 — physics + 관절이 두 버킷에 동시에 들어가던 것 ──
console.log('\n3. 회귀② 이중 렌더 — physics를 켠 관절 오브젝트도 버킷은 하나');
{
  const os = [obj({ id: 'p', actuator: ACT(false), physics: { enabled: true, mass: 1, isSensor: false, restitution: 0, friction: 0.5 } as ObjectNodeSchema['physics'] })];
  const b = bucket(os, 'p');
  check('관절이 physics보다 우선(한 버킷)', b === 'actuator-visual', b);
}

// ── 회귀 ③ 중첩 모터가 콜라이더를 못 받던 것 (루트 전용 필터) ──────
console.log('\n4. 회귀③ 중첩 — 그룹 안 모터/관절도 콜라이더를 받는다');
{
  const os = [
    obj({ id: 'g', isGroup: true }),
    obj({ id: 'motorIn', parentId: 'g', isGroup: true, isActuator: true, actuator: ACT(true) }),
    obj({ id: 'actIn', parentId: 'g', actuator: ACT(true) }),
    obj({ id: 'motionIn', parentId: 'g', motion: MOT(true) }),
    obj({ id: 'plainIn', parentId: 'g' }),
  ];
  check('중첩 모터(콜라이더 ON) → 최상위로 끌어올림', bucket(os, 'motorIn') === 'actuator-collider', bucket(os, 'motorIn'));
  check('중첩 관절(콜라이더 ON) → 최상위로 끌어올림', bucket(os, 'actIn') === 'actuator-collider', bucket(os, 'actIn'));
  check('중첩 모션(콜라이더 ON) → 최상위로 끌어올림', bucket(os, 'motionIn') === 'moving-collider', bucket(os, 'motionIn'));
  check('평범한 중첩 자식 → 부모 그룹이 그림', bucket(os, 'plainIn') === 'child', bucket(os, 'plainIn'));
  check('부모 그룹 → 정적 GroupWithCollision', bucket(os, 'g') === 'group-static', bucket(os, 'g'));
}

// ── 회귀 ④ 평범한 그룹의 관절이 얼어붙던 것 (`!isGroup` 조건) ───────
console.log('\n5. 회귀④ 그룹 관절 — 클로너처럼 모터가 아닌 그룹도 관절이 돈다');
{
  const os = [
    obj({ id: 'cloner', isGroup: true, actuator: ACT(false) }),            // 클로너 + 관절
    obj({ id: 'clonerC', isGroup: true, actuator: ACT(true) }),            // + 콜라이더
    obj({ id: 'motor', isGroup: true, isActuator: true, actuator: ACT(false) }),
    obj({ id: 'plainGroup', isGroup: true }),
  ];
  check('그룹+관절(OFF) → 시각 구동(정적 아님)', bucket(os, 'cloner') === 'actuator-visual', bucket(os, 'cloner'));
  check('그룹+관절(ON) → kinematic 구동', bucket(os, 'clonerC') === 'actuator-collider', bucket(os, 'clonerC'));
  check('모터(OFF) → 시각 구동', bucket(os, 'motor') === 'actuator-visual', bucket(os, 'motor'));
  check('★관절 없는 평범한 그룹은 여전히 정적(벽)', bucket(os, 'plainGroup') === 'group-static', bucket(os, 'plainGroup'));
}

// ── 숨김 — 보이지 않는 것에는 콜라이더를 붙이지 않는다 ──────────────
console.log('\n6. 숨김 — 자신/조상이 숨으면 콜라이더 없음(보이지 않는 벽 방지)');
{
  const os = [
    obj({ id: 'hidden', visible: false }),
    obj({ id: 'hg', isGroup: true, visible: false }),
    obj({ id: 'childOfHidden', parentId: 'hg' }),
    obj({ id: 'colliderUnderHidden', parentId: 'hg', motion: MOT(true) }),
  ];
  check('숨긴 오브젝트', bucket(os, 'hidden') === 'hidden', bucket(os, 'hidden'));
  check('숨긴 그룹의 자식', bucket(os, 'childOfHidden') === 'hidden', bucket(os, 'childOfHidden'));
  check('숨긴 그룹 아래의 이동 콜라이더도 제외', bucket(os, 'colliderUnderHidden') === 'hidden', bucket(os, 'colliderUnderHidden'));
}

// ── 통과(set_passable) — 콜라이더만 제거, 시각은 유지 ────────────────
console.log('\n7. 통과(set_passable) — 콜라이더 제거·시각 유지');
{
  const os = [
    obj({ id: 'door', actuator: ACT(true) }),
    obj({ id: 'wall' }),
    obj({ id: 'g', isGroup: true }),
  ];
  const opts = { passableIds: new Set(['door', 'wall', 'g']) };
  check('통과 관절 → 콜라이더 안 붙음', bucket(os, 'door', opts) === 'passable-visual', bucket(os, 'door', opts));
  check('통과 벽 → 시각만', bucket(os, 'wall', opts) === 'passable-visual', bucket(os, 'wall', opts));
  check('통과 그룹 → 시각만', bucket(os, 'g', opts) === 'group-visual', bucket(os, 'g', opts));
}

// ── 움직이는 그룹 아래 — 그룹 강체에 실리므로 개별 콜라이더 없음 ─────
console.log('\n8. 움직이는 그룹 아래 자식은 개별 콜라이더를 받지 않는다(강체에 실림)');
{
  const os = [
    obj({ id: 'mg', isGroup: true, motion: MOT(true) }),
    obj({ id: 'kid', parentId: 'mg', motion: MOT(true) }),
    obj({ id: 'kidAct', parentId: 'mg', actuator: ACT(true) }),
  ];
  check('모션+콜라이더 그룹 → 하나의 강체', bucket(os, 'mg') === 'group-moving-collider', bucket(os, 'mg'));
  check('그 아래 이동 콜라이더 자식 → child', bucket(os, 'kid') === 'child', bucket(os, 'kid'));
  check('그 아래 관절 콜라이더 자식 → child', bucket(os, 'kidAct') === 'child', bucket(os, 'kidAct'));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
