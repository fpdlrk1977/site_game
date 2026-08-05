// 실행: npx tsx src/lib/brick/demoRoom.test.ts
//
// 데모 방(`BRICK_PLAN.md` §23) + 걷기(§6)를 **함께** 잠근다.
//
// ★ 이 파일이 진짜 확인하는 건 하나다: **그 방 안을 실제로 걸어 다닐 수 있는가.**
//   방이 지어졌는지(브릭 개수)만 보면 "벽에 끼여 못 움직인다"·"벽을 뚫고 나간다"를 못 잡는다.
//   그래서 순수 함수 둘을 붙여서 **가상으로 걸어 본다** — 화면 없이 한 바퀴가 검증된다.

import { demoRoom, roomSpawn, ROOM_D, ROOM_W } from './demoRoom';
import { CELL_X, CELL_Y, CELL_Z } from './grid';
import { unitOf } from './parts';
import { spawnAt, walk, type Solid, type WalkState } from './walk';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const OX = 0, OY = 0, OZ = 0;
const bricks = demoRoom(OX, OY, OZ);

/** 방 + 평평한 지면 */
const cells = new Set(bricks.map((b) => `${b.x},${b.y},${b.z}`));
const solid: Solid = (x, y, z) => y < 0 || cells.has(`${x},${y},${z}`);

// ── 지어지긴 하는가 ──────────────────────────────────────────────────────
{
  ok(bricks.length > 200, `방이 실제로 지어진다 — 브릭 ${bricks.length}개`);
  ok(bricks.every((b) => unitOf(b.part) === b.part), '★ 방도 1×1 단위로만 지어진다(§20)');
  ok(bricks.some((b) => b.mat === 'transparent'), '창문(반투명)이 있다');
  ok(bricks.some((b) => b.mat === 'emissive'), '★ 실내 조명(발광)이 있다 — 없으면 방 안이 캄캄하다');
}

// ── 문이 뚫려 있는가 (남쪽 벽 가운데) ────────────────────────────────────
{
  const wallZ = OZ + ROOM_D - 1;
  let openAtDoor = 0, closedElsewhere = 0;
  for (let x = 0; x < ROOM_W; x++) {
    const filled = cells.has(`${OX + x},${OY + 1},${wallZ}`);
    const mid = x >= Math.floor((ROOM_W - 2) / 2) && x < Math.floor((ROOM_W - 2) / 2) + 2;
    if (mid && !filled) openAtDoor++;
    if (!mid && filled) closedElsewhere++;
  }
  ok(openAtDoor === 2, `★ 문이 2칸 뚫려 있다 — ${openAtDoor}칸`);
  ok(closedElsewhere === ROOM_W - 2, `문 말고는 벽이 막혀 있다 — ${closedElsewhere}/${ROOM_W - 2}`);
}

// ── ★★ 방 안에 서고, 걸어도 벽 밖으로 안 나간다 ────────────────────────
{
  const [sx, sy, sz] = roomSpawn(OX, OY, OZ);
  const start = spawnAt(solid, (sx + 0.5) * CELL_X, (sz + 0.5) * CELL_Z, (sy + 8) * CELL_Y);

  ok(Math.abs(start.y - CELL_Y) < 1e-6, `★ 방바닥(플레이트 한 겹) 위에 선다 — y=${start.y}`);

  /** 방 안(벽 안쪽)인가 — 여유 없이 벽 칸 바깥이면 나간 것 */
  const inside = (s: WalkState) =>
    s.x > (OX + 1) * CELL_X - 0.3 && s.x < (OX + ROOM_W - 1) * CELL_X + 0.3
    && s.z > (OZ + 1) * CELL_Z - 0.3 && s.z < (OZ + ROOM_D - 1) * CELL_Z + 0.3;

  // 여덟 방향으로 3초씩 걸어 본다. 문(남쪽 가운데)으로는 나갈 수 있으니 그 방향만 뺀다.
  const dirs: [number, number, string][] = [
    [1, 0, '동'], [-1, 0, '서'], [0, -1, '북'],
    [1, -1, '북동'], [-1, -1, '북서'], [1, 1, '남동'], [-1, 1, '남서'],
  ];
  let escaped = 0, stuck = 0;
  for (const [fx, fz, name] of dirs) {
    let s = start;
    for (let i = 0; i < 180; i++) s = walk(solid, s, 4.2, fx, fz, 1 / 60);
    if (!inside(s)) { escaped++; fails.push(`★★ ${name}쪽 벽을 뚫고 나갔다 — (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`); }
    // 벽에 부딪히기 전까지는 실제로 움직여야 한다(제자리에서 끼면 안 된다)
    if (Math.hypot(s.x - start.x, s.z - start.z) < 0.5) { stuck++; fails.push(`★★ ${name}쪽으로 아예 못 움직인다(끼임)`); }
  }
  ok(escaped === 0, `★★ 벽 일곱 방향을 다 막는다 — 뚫린 방향 ${escaped}개`);
  ok(stuck === 0, `★★ 어느 방향으로도 끼이지 않는다 — 끼인 방향 ${stuck}개`);

  // 바닥을 뚫고 내려가지 않는다
  let down = start;
  for (let i = 0; i < 300; i++) down = walk(solid, down, 4.2, 0, 0, 1 / 60);
  ok(down.y >= 0, `★ 가만히 있어도 바닥을 안 뚫는다 — y=${down.y}`);
}

// ── ★ 문으로는 나갈 수 있다 (방이 감옥이면 안 된다) ──────────────────────
{
  const doorX = OX + Math.floor((ROOM_W - 2) / 2);
  // 문 한가운데에서 남쪽(+Z)으로 걸어 나간다
  const at = spawnAt(solid, (doorX + 1) * CELL_X, (OZ + ROOM_D - 4) * CELL_Z, 8);
  let s = at;
  for (let i = 0; i < 240; i++) s = walk(solid, s, 4.2, 0, 1, 1 / 60);
  ok(s.z > (OZ + ROOM_D) * CELL_Z, `★★ 문으로 걸어 나갈 수 있다 — z=${s.z.toFixed(2)}`);
}

console.log(`\n데모 방 + 걷기(한 바퀴) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
