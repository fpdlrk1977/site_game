// 실행: npx tsx src/lib/brick/walk.test.ts
//
// 걷기 충돌(`BRICK_PLAN.md` §6)을 잠근다.
//
// ★ 여기가 **순수 함수 테스트가 진짜 값어치를 하는 자리**다. 캐릭터가 벽에 끼거나 바닥을 뚫는 건
//   화면에서 재현하기 어렵고(운 나쁜 각도에서만 난다) 눈으로는 원인을 못 짚는다.
//   월드도 카메라도 없이 "이 칸이 막혔나"만 주면 전부 여기서 확인된다.

import { BODY_H, blocked, spawnAt, STEP_UP, stepWalk, walk, type Solid, type WalkState } from './walk';
import { CELL_X, CELL_Y, CELL_Z } from './grid';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };
const near = (a: number, b: number, label: string, eps = 1e-6) =>
  ok(Math.abs(a - b) < eps, `${label} — ${a} vs ${b}`);

/** 칸 집합으로 만든 월드 */
function worldOf(cells: [number, number, number][]): Solid {
  const set = new Set(cells.map(([x, y, z]) => `${x},${y},${z}`));
  return (x, y, z) => set.has(`${x},${y},${z}`);
}

/** y<0인 칸이 전부 막힌 평평한 땅 */
const flat: Solid = (_x, y) => y < 0;

/** 평지 + 추가 칸 */
function flatWith(cells: [number, number, number][]): Solid {
  const extra = worldOf(cells);
  return (x, y, z) => y < 0 || extra(x, y, z);
}

/** 1초 동안 그 방향으로 걷는다 */
function walkFor(solid: Solid, s: WalkState, fx: number, fz: number, seconds: number, speed = 4): WalkState {
  let out = s;
  for (let i = 0; i < Math.round(seconds * 60); i++) out = walk(solid, out, speed, fx, fz, 1 / 60);
  return out;
}

// ── 바닥에 선다 (뚫고 안 내려간다) ────────────────────────────────────────
{
  const s = walkFor(flat, { x: 1, y: 3, z: 1, vy: 0, onGround: false }, 0, 0, 2);
  near(s.y, 0, '★ 떨어지면 지면(y=0)에 선다');
  ok(s.onGround, '바닥에 닿은 것을 안다');
  near(s.vy, 0, '착지하면 세로 속도가 0');
}

// ── 빈 공간에서는 떨어진다 ────────────────────────────────────────────────
{
  const empty: Solid = () => false;
  const s = walkFor(empty, { x: 0, y: 10, z: 0, vy: 0, onGround: false }, 0, 0, 1);
  ok(s.y < 5, `★ 아무것도 없으면 떨어진다 — y=${s.y.toFixed(2)}`);
  ok(!s.onGround, '떨어지는 중엔 onGround가 아니다');
}

// ── 벽에 막힌다 (통과 못 한다) ────────────────────────────────────────────
{
  // x=4 칸에 높은 벽
  const wall: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) for (let z = -4; z <= 4; z++) wall.push([4, y, z]);
  const w = flatWith(wall);

  const s = walkFor(w, spawnAt(w, 0.25, 0.25), 1, 0, 3); // +x로 3초
  ok(s.x < 4 * CELL_X, `★★ 벽을 통과하지 못한다 — x=${s.x.toFixed(3)} < ${4 * CELL_X}`);
  ok(s.x > 1, `벽 앞까지는 갔다 — x=${s.x.toFixed(3)}`);
}

// ── ★ 빠르게 달려도 안 뚫린다 (터널링) ───────────────────────────────────
// dt가 튀거나 속도가 크면 한 프레임에 벽을 건너뛸 수 있다. `walk`가 잘라서 돌려 막는다.
{
  const wall: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) for (let z = -4; z <= 4; z++) wall.push([4, y, z]);
  const w = flatWith(wall);
  // 한 번에 0.25초 × 속도 60 = 15m를 가려고 한다(벽까지는 2m)
  const s = walk(w, spawnAt(w, 0.25, 0.25), 60, 1, 0, 0.25);
  ok(s.x < 4 * CELL_X, `★★ 한 프레임에 15m를 가려 해도 벽을 못 뚫는다 — x=${s.x.toFixed(3)}`);
}

// ── 벽을 따라 미끄러진다 (비스듬히 부딪혀도 안 멈춘다) ─────────────────────
//   ⚠️ 벽을 **충분히 길게** 만들어야 한다. 짧으면 캐릭터가 2초 만에 끝을 돌아 나가서
//      "벽을 통과했다"는 **가짜 실패**가 난다(처음에 그렇게 났다 — 코드가 아니라 테스트가 틀렸다).
{
  const wall: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) for (let z = -60; z <= 60; z++) wall.push([4, y, z]);
  const w = flatWith(wall);
  const start = spawnAt(w, 0.25, 0.25);
  const s = walkFor(w, start, 1, 1, 2); // 벽 쪽 + 옆으로 동시에
  ok(s.x < 4 * CELL_X, '벽은 여전히 못 넘는다');
  ok(s.z - start.z > 2, `★ 벽에 비스듬히 부딪혀도 옆으로는 계속 간다(안 끼인다) — z가 ${(s.z - start.z).toFixed(2)}m 이동`);
}

// ── ★★ 계단: 브릭 한 장은 오르고, 두 장은 못 오른다 ──────────────────────
{
  // ⚠️ 턱을 **넉넉히 넓게**. 좁으면 올라갔다가 반대편으로 걸어 내려와 y=0이 되어
  //    "못 올라갔다"는 가짜 실패가 난다(처음에 그렇게 났다).
  const stepCells = (heightCells: number): Solid => {
    const cells: [number, number, number][] = [];
    for (let y = 0; y < heightCells; y++) for (let z = -20; z <= 20; z++) for (let x = 4; x <= 60; x++) cells.push([x, y, z]);
    return flatWith(cells);
  };

  // 브릭 한 장 = 3칸 = 0.6m
  const one = stepCells(3);
  const a = walkFor(one, spawnAt(one, 0.25, 0.25), 1, 0, 2);
  near(a.y, 3 * CELL_Y, '★★ 브릭 한 장(0.6m) 턱은 자동으로 올라간다');
  ok(a.x > 4 * CELL_X, `올라가서 그 위로 넘어갔다 — x=${a.x.toFixed(2)}`);

  // 브릭 두 장 = 6칸 = 1.2m
  const two = stepCells(6);
  const b = walkFor(two, spawnAt(two, 0.25, 0.25), 1, 0, 3);
  near(b.y, 0, '★★ 두 장(1.2m) 턱은 못 올라간다');
  ok(b.x < 4 * CELL_X, `막혀서 앞에 선다 — x=${b.x.toFixed(2)}`);

  ok(Math.abs(STEP_UP - 3 * CELL_Y) < 1e-9, `계단 높이 = 브릭 한 장 — ${STEP_UP}`);
}

// ── ★ 한 칸짜리 문틈을 지난다 ────────────────────────────────────────────
// 몸통이 반 칸보다 크면 양쪽에 동시에 닿아 **문을 못 지난다**(실제로 흔한 버그다).
{
  const cells: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) for (let z = -6; z <= 6; z++) {
    if (z === 0) continue; // z=0 칸만 비워 문을 만든다
    cells.push([4, y, z]);
  }
  const w = flatWith(cells);
  // 문 한가운데(z = 0.25m)를 겨누고 통과
  const s = walkFor(w, spawnAt(w, 0.25, 0.25), 1, 0, 3);
  ok(s.x > 5 * CELL_X, `★★ 한 칸짜리 문을 통과한다 — x=${s.x.toFixed(2)}`);
}

// ── 몸통 상자 판정 자체 ──────────────────────────────────────────────────
{
  const one = worldOf([[0, 0, 0]]);
  ok(blocked(one, 0.25, 0, 0.25), '그 칸 안에 서 있으면 막힌 것으로 본다');
  ok(!blocked(one, 0.25, CELL_Y, 0.25), '그 칸 위에 서면 안 막힌다');
  ok(!blocked(one, 2, 0, 2), '멀리 있으면 안 막힌다');

  // 키가 반영되는가 — 머리 높이의 칸도 막는다
  const ceil = worldOf([[0, 5, 0]]);
  ok(blocked(ceil, 0.25, 5 * CELL_Y - BODY_H + 0.05, 0.25), '★ 머리 위 칸도 막힘으로 친다(키를 본다)');
}

// ── 천장에 부딪히면 세로 속도가 죽는다 ───────────────────────────────────
{
  const cells: [number, number, number][] = [];
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) cells.push([x, 9, z]);
  const w = flatWith(cells);
  const s = stepWalk(w, { x: 0.25, y: 9 * CELL_Y - BODY_H - 0.01, z: 0.25, vy: 5, onGround: false }, 0, 0, 1 / 60);
  ok(s.vy <= 0, `★ 천장에 부딪히면 위로 밀리지 않는다 — vy=${s.vy}`);
}

// ── spawnAt: 지면 위에 세운다 ────────────────────────────────────────────
{
  const w = flatWith([[0, 0, 0], [0, 1, 0], [0, 2, 0]]); // 브릭 한 장 위
  near(spawnAt(w, 0.25, 0.25).y, 3 * CELL_Y, '★ 시작 위치는 그 자리 지면 위다');
  near(spawnAt(flat, 10.25, 10.25).z, 10.25, 'XZ는 그대로 둔다');
  near(spawnAt(flat, 10.25, 10.25).y, 0, '평지에서는 y=0');
}

// ── 칸 크기 전제 (바뀌면 위 계산이 전부 흔들린다) ────────────────────────
{
  ok(CELL_X === 0.5 && CELL_Z === 0.5 && CELL_Y === 0.2, '전제: 칸 0.5 × 0.2 × 0.5m');
}

console.log(`\n걷기(충돌·계단·중력) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
