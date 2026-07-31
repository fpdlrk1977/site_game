// 실행: npx tsx src/lib/brick/strokeLock.test.ts
//
// 드래그 한 획의 안전장치(놓기·지우기 공용).
// **이게 없으면 커서가 지나간 자리가 거리와 무관하게 지워진다** —
// 실제로 "바닥 위 브릭을 지우며 아래로 끌었더니 지나간 자리의 바닥까지 사라지는" 사고가 났다.

import { beginEraseStroke, canEraseInStroke, beginPlaceStroke, canPlaceInStroke, strokeAnchor, dominantAxis, axisSteps, ERASE_REACH_M } from './strokeLock';
import { CELL_X } from './grid';
import type { Brick } from './world';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };
const eq = (a: unknown, b: unknown, label: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${label} — ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

let seq = 1;
const brick = (part: Brick['part'], x: number, y: number, z: number): Brick =>
  ({ id: seq++, part, x, y, z, rot: 0, color: '#fff', mat: 'opaque' });

// 축: 0=x, 1=y, 2=z
{
  // ── ★ 보고된 사고: 브릭에서 시작한 획이 지형을 지우면 안 된다 ──
  const wall = brick('b2x4', 0, 6, 0);
  const lock = beginEraseStroke(wall, 2); // 앞면(z)을 짚고 시작
  const ground = brick('terrain', 0, -3, 0);
  ok(!canEraseInStroke(lock, ground), '★ 브릭 획은 지형을 안 지운다 (보고된 사고)');

  // 지형 획은 반대로 브릭을 안 건드린다
  const digLock = beginEraseStroke(brick('terrain', 0, -3, 0), 1);
  ok(!canEraseInStroke(digLock, brick('b2x4', 0, 0, 0)), '지형 획은 브릭을 안 지운다');
}

{
  // ── 같은 층만 (벽 앞면 훑기) ──
  const lock = beginEraseStroke(brick('b2x4', 0, 6, 5), 2); // z=5 층
  ok(canEraseInStroke(lock, brick('b2x4', 4, 6, 5)), '같은 z층의 옆 브릭은 지워진다');
  ok(canEraseInStroke(lock, brick('b1x2', 8, 12, 5)), '★ 층만 같으면 높이·파츠가 달라도 지워진다');
  ok(!canEraseInStroke(lock, brick('b2x4', 0, 6, 7)), '★ 뒤쪽(다른 z층)은 안 지워진다 — 한 겹만');
}

{
  // ── 바닥 걷어내기 (윗면을 짚어 y층 잠금) ──
  const lock = beginEraseStroke(brick('b2x4', 0, 0, 0), 1); // y=0 층
  ok(canEraseInStroke(lock, brick('b2x4', 4, 0, 4)), '같은 y층 바닥은 훑어 지워진다');
  ok(!canEraseInStroke(lock, brick('b2x4', 4, 3, 4)), '★ 그 위에 얹힌 브릭은 안 지워진다');
  ok(!canEraseInStroke(lock, brick('b2x4', 4, -3, 4)), '★ 아래층도 안 지워진다');
}

{
  // ── 도달 거리 ──
  const lock = beginEraseStroke(brick('b2x4', 0, 0, 0), 1);
  const near = Math.floor((ERASE_REACH_M * 0.5) / CELL_X);
  const far = Math.ceil((ERASE_REACH_M * 2) / CELL_X);
  ok(canEraseInStroke(lock, brick('b2x4', near, 0, 0)), '가까운 것은 지워진다');
  ok(!canEraseInStroke(lock, brick('b2x4', far, 0, 0)), '★ 화면 저 끝(도달 거리 밖)은 안 지워진다');
}

{
  // ── 앵커 기준 판정 (히트 지점이 아니라) ──
  //   이웃을 지우면 그 옆 브릭의 **노출된 옆면**이 잡힌다. 히트 지점으로 층을 재면
  //   같은 층인데 걸러져 획이 중간에 멈춘다(카메라 각도에 따라 되다 안 되다 한다).
  const lock = beginEraseStroke(brick('b2x4', 0, 0, 0), 1);
  ok(canEraseInStroke(lock, brick('b2x4', 2, 0, 0)), '★ 옆면을 짚어도 같은 층이면 계속 지워진다');
}

// ── 놓기 획 ───────────────────────────────────────────────
const B2x4: [number, number, number] = [2, 3, 4]; // 2×4 브릭(폭2·높이3칸·길이4)

{
  // 바닥 한 층 깔기 — 같은 층만, 도달 거리 안에서
  const lock = beginPlaceStroke([0, 0, 0], 1, B2x4, [0, 2]);
  ok(canPlaceInStroke(lock, [4, 0, 4]), '같은 층의 옆 칸엔 계속 놓인다');
  ok(!canPlaceInStroke(lock, [4, 3, 4]), '★ 위층엔 안 놓인다 — 훑다가 계단이 생기지 않는다');
  ok(!canPlaceInStroke(lock, [4, -3, 4]), '★ 아래층에도 안 놓인다');
  const far = Math.ceil((ERASE_REACH_M * 2) / CELL_X);
  ok(!canPlaceInStroke(lock, [far, 0, 0]), '★ 도달 거리 밖엔 안 놓인다');
}

{
  // ★ 놓기는 **갈래를 보지 않는다** — 지우기와 다른 점.
  //   바닥(지형) 위를 훑든 방금 놓은 브릭 옆을 훑든, 놓일 자리의 층만 맞으면 이어져야 한다.
  const lock = beginPlaceStroke([0, 6, 0], 2, B2x4, [0]);
  ok(canPlaceInStroke(lock, [2, 12, 0]), '★ 같은 z층이면 높이가 달라도 이어진다(벽 한 면 채우기)');
  ok(!canPlaceInStroke(lock, [2, 12, 2]), '다른 z층은 끊긴다');
}

{
  // ── ★ 벽면 획은 **수평 한 축만** 움직인다 (사용자 보고: "X방향이 아니라 Y방향으로 추가된다") ──
  //   `anchorFromFace`가 주는 `slide`가 이미 그 규칙이다(벽면 = 그 벽을 따라 수평 하나).
  //   이걸 안 쓰고 "면 축만 빼고 전부 자유"로 두면 **세로까지 열려** 커서가 조금만 흔들려도 위 칸에 놓인다.
  const lock = beginPlaceStroke([0, 0, 0], 2, B2x4, [0]); // 앞면(z) — 움직일 축은 x뿐
  eq(strokeAnchor(lock, [0, 1, 9]), [0, 0, 0], '★ 커서가 위로 흔들려도 세로는 안 움직인다');
  eq(strokeAnchor(lock, [0, 9, 9]), [0, 0, 0], '★ 한참 위를 짚어도 같은 줄 — 벽은 한 켜씩 훑는다');
  eq(strokeAnchor(lock, [1, 5, 9]), [0, 0, 0], '★ 가로는 파츠 폭(2칸) 단위로 스냅');
  eq(strokeAnchor(lock, [2, 5, 9]), [2, 0, 0], '가로 다음 칸');
  eq(strokeAnchor(lock, [-1, 5, 9]), [-2, 0, 0], '★ 음수 쪽도 격자를 지킨다(내림)');
}

{
  // 윗면 획은 XZ 두 축이 열린다(바닥 깔기)
  const lock = beginPlaceStroke([0, 0, 0], 1, B2x4, [0, 2]);
  eq(strokeAnchor(lock, [3, 9, 5]), [2, 0, 4], '★ 윗면은 가로·세로(XZ) 둘 다 움직인다');
  eq(strokeAnchor(lock, [3, 9, 5])[1], 0, '★ 높이는 잠긴 층 그대로');
}

{
  // 첫 브릭이 원점이 아니어도 그 브릭 기준으로 격자가 잡힌다
  const lock = beginPlaceStroke([5, 7, 2], 1, B2x4, [0, 2]);
  eq(strokeAnchor(lock, [6, 99, 3], ), [5, 7, 2], '★ 격자 원점은 첫 브릭이다');
  eq(strokeAnchor(lock, [7, 99, 6]), [7, 7, 6], '한 칸(폭2·길이4) 건너뛴 자리');
}

// ── 줄 긋기(수직면) — 끄는 방향 한 축 ───────────────────────
{
  ok(dominantAxis(1, 0.2, 0.3) === 0, '오른쪽으로 많이 끌면 X축');
  ok(dominantAxis(0.1, 0.9, 0.2) === 1, '위로 많이 끌면 Y축');
  ok(dominantAxis(0.1, 0.2, -0.8) === 2, '★ 뒤로 끌면 Z축(부호 무관, 크기로 고른다)');
  ok(dominantAxis(0, 0, 0) === 0, '움직임이 없으면 X(호출부가 최소 거리로 먼저 거른다)');
}

{
  // 2×4 브릭을 X축(폭 2칸 = 1.0m)으로 끌 때
  const stepX = 2 * CELL_X;
  ok(axisSteps(stepX * 3, 2, CELL_X) === 3, '세 걸음');
  ok(axisSteps(-stepX * 2, 2, CELL_X) === -2, '★ 반대 방향은 음수');
  ok(axisSteps(stepX * 0.6, 2, CELL_X) === 1, '★ 절반 넘게 가면 한 걸음(반올림)');
  ok(axisSteps(stepX * 0.4, 2, CELL_X) === 0, '★ 절반 못 가면 제자리 — 손 떨림에 줄이 늘었다 줄었다 하지 않는다');
}

console.log(`\n획 잠금(놓기·지우기) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
