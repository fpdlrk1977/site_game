// 실행: npx tsx src/lib/brick/props.test.ts
//
// 소품 라이브러리(`BRICK_PLAN.md` §22)를 잠근다.
//
// ★ 이 파일이 지키는 핵심은 **회전이 강체(rigid)인가**다.
//   소품 안쪽 배치를 잘못된 회전 기준으로 돌리면 **좌우가 거울처럼 뒤집힌다**(D-6) —
//   의자 등받이가 반대쪽에 붙는데 **에러가 안 나고**, 대칭 소품에서는 티도 안 난다.
//   그래서 **실제로 그려지는 메시**를 돌려서 점구름끼리 비교한다.

import * as THREE from 'three';
import { brickGeometry } from './brickGeometry';
import type { Rot } from './grid';
import { extentOf, PARTS, unitOf } from './parts';
import { anchorCenterWorld } from './placement';
import { rotMatrixVisual } from './rotation';
import { bricksOfProp, PROP_LIST, propBox, type PropId } from './props';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const SPINS: Rot[] = [0, 1, 2, 3];

// ── 소품은 **바깥 상자 안**에 들어가고, 조각끼리 겹치지 않는다 ──────────────
// 삐져나오면 옆 브릭을 파고들고, 겹치면 그 조각이 조용히 안 놓인다(둘 다 에러가 안 난다).
{
  let outside = 0, overlap = 0, notUnit = 0;
  for (const p of PROP_LIST) {
    for (const rot of SPINS) {
      const e = extentOf(propBox(p.id), rot);
      const used = new Set<string>();
      for (const b of bricksOfProp(p.id, 0, 0, 0, rot)) {
        if (unitOf(b.part) !== b.part) notUnit++; // §20: 월드엔 1×1 단위만 들어간다
        const be = extentOf(PARTS[b.part], b.rot);
        for (let dx = 0; dx < be.ex; dx++)
          for (let dy = 0; dy < be.ey; dy++)
            for (let dz = 0; dz < be.ez; dz++) {
              const x = b.x + dx, y = b.y + dy, z = b.z + dz;
              if (x < 0 || x >= e.ex || y < 0 || y >= e.ey || z < 0 || z >= e.ez) outside++;
              const k = `${x},${y},${z}`;
              if (used.has(k)) overlap++;
              used.add(k);
            }
      }
    }
  }
  ok(outside === 0, `★ 소품 조각이 바깥 상자를 안 벗어난다 — 벗어난 칸 ${outside}개`);
  ok(overlap === 0, `★ 소품 조각끼리 안 겹친다 — 겹친 칸 ${overlap}개`);
  ok(notUnit === 0, `★ 소품도 1×1 단위로만 놓인다(§20) — 어긋난 조각 ${notUnit}개`);
}

// ── 소품마다 조각이 있고, 상자가 실제 크기와 맞는가 ─────────────────────────
{
  for (const p of PROP_LIST) {
    ok(bricksOfProp(p.id, 0, 0, 0, 0).length > 0, `${p.label}: 조각이 있다`);
    const box = propBox(p.id);
    ok(box.sx === p.sx && box.h === p.h && box.sz === p.sz, `${p.label}: 바깥 상자가 정의와 같다`);
  }
  ok(PROP_LIST.length === 7, `1차 소품 7종 — 지금 ${PROP_LIST.length}종`);
}

// ── ★★★ 회전이 **강체**인가 — 실제 메시 점구름으로 확인 ────────────────────
//
// `rot 0`으로 놓은 소품의 정점을 전부 모아 **화면 기준으로 돌린 것**이,
// `rot r`로 놓은 소품의 정점 집합과 **같아야** 한다.
// 거울로 뒤집히면 점 개수는 같고 **자리만 달라지므로**, 집합 비교가 유일하게 잡아낸다.
{
  const M4 = (rot: Rot): THREE.Matrix4 => {
    const m = rotMatrixVisual(rot);
    return new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
  };

  /** 소품을 그 방향으로 놓았을 때 화면에 그려지는 **월드 정점 전부** */
  function cloud(id: PropId, rot: Rot): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const b of bricksOfProp(id, 0, 0, 0, rot)) {
      // 'line' = 민짜 상자 — 모따기가 정점 수를 늘려도 비교엔 상관없지만 가볍게 간다
      const pos = brickGeometry(PARTS[b.part], false, 'line').getAttribute('position');
      const m = M4(b.rot);
      const [cx, cy, cz] = anchorCenterWorld({ x: b.x, y: b.y, z: b.z }, PARTS[b.part], b.rot);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        out.push(new THREE.Vector3(v.x + cx, v.y + cy, v.z + cz));
      }
    }
    return out;
  }

  /** 최소 모서리를 원점으로 옮긴 뒤, 반올림해 문자열 집합으로 */
  function normalized(pts: THREE.Vector3[]): Set<string> {
    const lo = [Infinity, Infinity, Infinity];
    for (const p of pts) {
      lo[0] = Math.min(lo[0], p.x); lo[1] = Math.min(lo[1], p.y); lo[2] = Math.min(lo[2], p.z);
    }
    const r = (v: number) => (Math.round(v * 1e4) / 1e4).toFixed(4);
    return new Set(pts.map((p) => `${r(p.x - lo[0])},${r(p.y - lo[1])},${r(p.z - lo[2])}`));
  }

  let bad = 0, checked = 0;
  const mismatched: string[] = [];
  for (const p of PROP_LIST) {
    const base = cloud(p.id, 0);
    for (const rot of SPINS) {
      if (rot === 0) continue;
      // rot 0의 점구름을 화면 기준으로 돌린다 → rot r로 놓은 것과 같아야 한다
      const m = M4(rot);
      const turned = base.map((v) => v.clone().applyMatrix4(m));
      const a = normalized(turned);
      const b = normalized(cloud(p.id, rot));
      checked++;
      if (a.size !== b.size || [...a].some((k) => !b.has(k))) { bad++; mismatched.push(`${p.label}/rot${rot}`); }
    }
  }
  ok(checked === PROP_LIST.length * 3, `강체 검사가 실제로 돌았다 — ${checked}건`);
  ok(bad === 0, `★★★ 소품을 돌려도 모양이 그대로다(거울 뒤집힘 없음) — 어긋난 것 ${mismatched.join(' ')}`);
}

// ── 비대칭 소품이 있어야 위 검사가 의미가 있다 ──────────────────────────────
// 전부 대칭이면 거울 뒤집힘을 **원리적으로 못 잡는다**(F-6 계열).
{
  const asym = PROP_LIST.filter((p) => {
    const a = new Set(bricksOfProp(p.id, 0, 0, 0, 0).map((b) => `${b.x},${b.y},${b.z},${b.part}`));
    const b = new Set(bricksOfProp(p.id, 0, 0, 0, 1).map((c) => `${c.x},${c.y},${c.z},${c.part}`));
    return a.size !== b.size || [...a].some((k) => !b.has(k));
  });
  ok(asym.length > 0, `★ 돌리면 실제로 달라지는 소품이 있다 — ${asym.map((p) => p.label).join(',')}`);
}

console.log(`\n소품 라이브러리 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
