// 실행: npx tsx src/lib/brick/world.test.ts
//
// BrickWorld는 파생 인덱스를 **증분으로** 갱신한다(가시성·기둥 높이·청크·리전).
// 증분 갱신은 틀려도 에러가 안 난다 — 브릭이 조용히 안 그려지거나, 엉뚱한 높이에 얹힌다.
//
// 그래서 잠그는 불변식은 하나로 요약된다:
//   **증분으로 갱신한 결과 == 처음부터 전부 계산한 결과**

import { BRICK_CELLS_Y, chunkCoordOf, chunkKey, regionKeyOf, type Rot } from './grid';
import { extentOf, PART_LIST, PARTS, PLATE_CELLS_Y, TERRAIN_STEP, type MatClass, type PartId } from './parts';
import { ROT_COUNT } from './rotation';
import { screenShade } from './shading';
import { deepenAround, SURFACE_Y } from './terrain';
import { BrickWorld } from './world';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

/**
 * 하늘빛 × 그늘을 합친 값 — 예전 `cornerLight`이 한 배열로 내주던 것.
 *
 * ★ 지금은 **따로 낸다**(합치면 셰이더 곡선이 하늘빛까지 밝혀 실내 그늘이 사라진다).
 *   아래 테스트들은 "밝다/어둡다"를 보는 것이라 합친 값으로 보는 게 맞다.
 *   분리 자체와 곡선 모양은 `shading.test.ts`가 본다.
 */
const _sky = new Float32Array(8), _ao = new Float32Array(8);
function combined(w: BrickWorld, b: Parameters<BrickWorld['cornerLight']>[0], out: Float32Array): void {
  w.cornerLight(b, _sky, _ao);
  for (let i = 0; i < 8; i++) out[i] = _sky[i] * _ao[i];
}

const PART_IDS: PartId[] = PART_LIST.map((p) => p.id);
/** ★ 24방향 전부 — 세우면 **높이도 바뀌므로**(1×4를 세우면 4칸) 파생 인덱스가 여기서 갈린다 */
const ROTS: Rot[] = Array.from({ length: ROT_COUNT }, (_, i) => i as Rot);
const MATS: MatClass[] = ['opaque', 'transparent', 'emissive'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** 리전 멤버십을 (리전키 → 정렬된 id 목록) 문자열로 */
function regionFingerprint(w: BrickWorld): string {
  return w.regionSnapshot()
    .map((r) => `${r.key}:${[...(w.regionBrickIds(r.key) ?? [])].sort((a, b) => a - b).join(',')}`)
    .sort()
    .join('|');
}

const setFingerprint = (s: Set<number>) => [...s].sort((a, b) => a - b).join(',');

// ── 무작위 편집(놓기·지우기) 후, 증분 결과 == 전량 재계산 결과 ────────────
{
  const rand = rng(20260729);
  const w = new BrickWorld();
  const placed: number[] = [];

  for (let i = 0; i < 900; i++) {
    // 20%는 지우기 — 증분 경로의 양쪽(추가/삭제)을 모두 태운다
    if (placed.length > 20 && rand() < 0.2) {
      const idx = Math.floor(rand() * placed.length);
      w.remove(placed[idx]);
      placed.splice(idx, 1);
      continue;
    }
    const p = PART_IDS[Math.floor(rand() * PART_IDS.length)];
    const r = ROTS[Math.floor(rand() * ROTS.length)];
    const x = Math.floor(rand() * 40) - 20;
    const z = Math.floor(rand() * 40) - 20;
    const id = w.place(p, x, w.restY(p, x, z, r), z, r, '#d01012', MATS[i % 3]);
    if (id !== null) placed.push(id);
  }

  ok(w.count > 400, `월드가 충분히 찼는가 (${w.count}개)`);
  ok(w.regionSnapshot().length > 1, `여러 리전에 걸쳤는가 (${w.regionSnapshot().length}개)`);

  // 증분 결과를 떠 놓고
  const visBefore = setFingerprint(w.visible);
  const studBefore = setFingerprint(w.studless);
  const regBefore = regionFingerprint(w);

  // 전량 재계산과 비교
  w.recomputeAll();
  ok(setFingerprint(w.visible) === visBefore, '가시성: 증분 == 전량 재계산');
  ok(setFingerprint(w.studless) === studBefore, '스터드 컬링: 증분 == 전량 재계산');
  ok(regionFingerprint(w) === regBefore, '리전 멤버십: 증분 == 전량 재계산');

  // 기둥 높이(restY)도 무차별 스캔과 일치해야 한다
  let colOk = true;
  for (let x = -22; x <= 22; x++) {
    for (let z = -22; z <= 22; z++) {
      let brute = 0;
      for (let y = 500; y >= 0; y--) if (w.at(x, y, z) !== undefined) { brute = y + 1; break; }
      if (w.topOfColumn(x, z) !== brute) colOk = false;
    }
  }
  ok(colOk, '기둥 꼭대기: 증분 캐시 == 무차별 스캔');

  // 리전 집합은 "보이는 브릭"과 정확히 같아야 한다 (하나라도 새면 조용히 안 그려진다)
  const inRegions = new Set<number>();
  let dup = false;
  for (const r of w.regionSnapshot()) {
    for (const id of w.regionBrickIds(r.key) ?? []) {
      if (inRegions.has(id)) dup = true;
      inRegions.add(id);
    }
  }
  ok(!dup, '한 브릭이 두 리전에 들어가지 않는다');
  ok(setFingerprint(inRegions) === setFingerprint(w.visible), '리전에 담긴 것 == 보이는 브릭 전부');

  // 각 브릭은 자기 좌표가 속한 리전에 있어야 한다
  let placedRight = true;
  for (const id of w.visible) {
    const b = w.bricks.get(id)!;
    if (!w.regionBrickIds(regionKeyOf(b.x, b.y, b.z))?.has(id)) placedRight = false;
  }
  ok(placedRight, '브릭이 자기 좌표의 리전에 담긴다');
}

// ── 리비전: 렌더가 바뀔 때만 올라간다 ───────────────────────────────────
{
  const w = new BrickWorld();
  const revOf = (x: number, y: number, z: number) => {
    const k = regionKeyOf(x, y, z);
    return w.regionSnapshot().find((r) => r.key === k)?.rev ?? 0;
  };

  w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque');
  const r1 = revOf(0, 0, 0);
  ok(r1 > 0, '브릭을 놓으면 리전 리비전이 올라간다');

  // 아주 멀리 놓으면 다른 리전 — 원래 리전은 그대로여야 한다(헛된 재갱신 방지)
  w.place('b2x2', 300, 0, 300, 0, '#fff', 'opaque');
  ok(revOf(0, 0, 0) === r1, '다른 리전 편집은 이 리전 리비전을 안 건드린다');

  // 위에 덮으면 아래 브릭이 스터드를 잃는다 → 같은 리전 리비전이 올라가야 한다
  w.place('b2x2', 0, 3, 0, 0, '#fff', 'opaque');
  ok(revOf(0, 0, 0) > r1, '스터드가 가려지면(그리는 메시가 바뀌면) 리비전이 올라간다');

  // 지우면 리전에서 빠지고 리비전이 올라간다
  const r2 = revOf(0, 0, 0);
  const top = [...w.visible].map((id) => w.bricks.get(id)!).find((b) => b.y === 3)!;
  w.remove(top.id);
  ok(revOf(0, 0, 0) > r2, '지우면 리비전이 올라간다');
  ok(!(w.regionBrickIds(regionKeyOf(0, 3, 0))?.has(top.id) ?? false), '지운 브릭은 리전에서 빠진다');
}

// ── 완전히 묻힌 브릭은 리전에 안 들어간다 (= 안 그린다) ──────────────────
{
  const w = new BrickWorld();
  // 1×1 하나를 6방향에서 감싼다
  const mid = w.place('b1x1', 0, 3, 0, 0, '#fff', 'opaque')!;
  w.place('b1x1', 0, 0, 0, 0, '#fff', 'opaque');    // 아래
  w.place('b1x1', 0, 6, 0, 0, '#fff', 'opaque');    // 위
  w.place('b1x1', -1, 3, 0, 0, '#fff', 'opaque');   // -x
  w.place('b1x1', 1, 3, 0, 0, '#fff', 'opaque');    // +x
  w.place('b1x1', 0, 3, -1, 0, '#fff', 'opaque');   // -z
  w.place('b1x1', 0, 3, 1, 0, '#fff', 'opaque');    // +z

  ok(!w.visible.has(mid), '6면이 막힌 브릭은 보이지 않는다');
  ok(!(w.regionBrickIds(regionKeyOf(0, 3, 0))?.has(mid) ?? false), '묻힌 브릭은 리전에도 없다');

  // 한 면을 열면 다시 보이고 리전에 들어온다
  const above = [...w.bricks.values()].find((b) => b.y === 6)!;
  w.remove(above.id);
  ok(w.visible.has(mid), '한 면이 열리면 다시 보인다');
  ok(w.regionBrickIds(regionKeyOf(0, 3, 0))?.has(mid) ?? false, '다시 리전에 들어온다');
}

// ── 빛 전파 (P3-b) ───────────────────────────────────────────────────────
// 빛은 틀려도 에러가 안 난다 — 그냥 어둡거나 밝을 뿐이라 눈으로만 알 수 있다.
// 그래서 "이건 반드시 이래야 한다"만 골라 잠근다.
{
  const w = new BrickWorld();

  // 3×3 바닥 위에 벽을 둘러 지붕을 덮은 방 — 한쪽에 문 구멍을 낸다
  // (셀 기준: 바닥 y=0..2, 벽 y=3..8, 지붕 y=9..11)
  const put = (x: number, y: number, z: number) => w.place('b1x1', x, y, z, 0, '#fff', 'opaque');
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) { put(x, 0, z); put(x, 9, z); }   // 바닥·지붕
  for (let y = 3; y <= 6; y += 3) {
    for (let x = 0; x < 5; x++) { put(x, y, 0); put(x, y, 4); }
    for (let z = 1; z < 4; z++) { put(0, y, z); put(4, y, z); }
  }
  w.recomputeLight();

  const inside = w.lightAt(2, 4, 2);      // 방 한가운데(밀폐)
  const outsideTop = w.lightAt(2, 12, 2); // 지붕 위 열린 하늘
  ok(outsideTop === 1, `열린 하늘은 최대 밝기 — got ${outsideTop.toFixed(2)}`);
  ok(inside < 0.5, `밀폐된 방 안은 어둡다 — got ${inside.toFixed(2)}`);

  // ★ 문을 뚫으면 빛이 옆에서 들어와야 한다 — P3-a가 못 하던 것
  const wallIds = [...w.bricks.values()].filter((b) => b.z === 0 && b.x === 2 && (b.y === 3 || b.y === 6));
  ok(wallIds.length === 2, '문 자리 벽 브릭을 찾았다');
  for (const b of wallIds) w.remove(b.id);
  w.recomputeLight();

  const litThroughDoor = w.lightAt(2, 4, 2);
  ok(litThroughDoor > inside, `문을 뚫으면 방 안이 밝아진다 — ${inside.toFixed(2)} → ${litThroughDoor.toFixed(2)}`);

  // 문에서 멀어질수록 어두워진다(감쇠)
  const near = w.lightAt(2, 4, 1);
  const far = w.lightAt(2, 4, 3);
  ok(near > far, `문에서 멀수록 어둡다 — 가까이 ${near.toFixed(2)} > 멀리 ${far.toFixed(2)}`);
}

// 발광 브릭은 주변을 밝힌다
{
  const w = new BrickWorld();
  // 밀폐 상자 안에 발광 브릭 하나
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) { w.place('b1x1', x, 0, z, 0, '#fff', 'opaque'); w.place('b1x1', x, 9, z, 0, '#fff', 'opaque'); }
  for (let y = 3; y <= 6; y += 3) {
    for (let x = 0; x < 5; x++) { w.place('b1x1', x, y, 0, 0, '#fff', 'opaque'); w.place('b1x1', x, y, 4, 0, '#fff', 'opaque'); }
    for (let z = 1; z < 4; z++) { w.place('b1x1', 0, y, z, 0, '#fff', 'opaque'); w.place('b1x1', 4, y, z, 0, '#fff', 'opaque'); }
  }
  w.recomputeLight();
  const dark = w.lightAt(2, 4, 2);

  w.place('b1x1', 1, 3, 1, 0, '#ffcc00', 'emissive');
  w.recomputeLight();
  const lit = w.lightAt(2, 4, 2);
  ok(lit > dark, `발광 브릭이 밀폐 공간을 밝힌다 — ${dark.toFixed(2)} → ${lit.toFixed(2)}`);
}

// 꼭짓점 밝기: 하늘을 향한 위쪽 꼭짓점이 바닥에 닿은 아래쪽보다 밝다
{
  const w = new BrickWorld();
  const id = w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque')!;
  w.recomputeLight();
  const c = new Float32Array(8);
  combined(w,w.bricks.get(id)!, c);
  const top = (c[2] + c[3] + c[6] + c[7]) / 4;   // j=1 (위쪽 네 꼭짓점)
  const bot = (c[0] + c[1] + c[4] + c[5]) / 4;   // j=0 (아래쪽 네 꼭짓점)
  ok(top > bot, `위쪽 꼭짓점(${top.toFixed(2)})이 바닥에 닿은 아래쪽(${bot.toFixed(2)})보다 밝다`);
  ok(top === 1, '뻥 뚫린 위쪽은 최대 밝기');
}

// ★ 면 방향 배율은 이제 **셰이더**가 곱한다(꼭짓점을 세 면이 공유하므로).
//   여기선 꼭짓점 값이 **배율 없는 순수 하늘빛**인지만 본다 — 배율이 섞여 들어오면
//   같은 꼭짓점이 면마다 달라야 하는데 그럴 수 없어 조용히 틀어진다.
{
  const w = new BrickWorld();
  const id = w.place('b1x1', 0, 300, 0, 0, '#fff', 'opaque')!; // 허공 — 사방이 트임
  w.recomputeLight();
  const c = new Float32Array(8);
  combined(w,w.bricks.get(id)!, c);
  for (let i = 0; i < 8; i++) ok(c[i] > 0.9, `허공 브릭의 꼭짓점 ${i}는 배율 없이 밝다 — ${c[i].toFixed(2)}`);
}

// ★ 걸쳐 놓은 브릭이 아래 타일을 통째로 어둡게 만들면 안 된다 (= "그림자처럼 보인다")
//   막힌 칸을 평균에 넣으면 절반만 덮였는데 전체가 어두워진다.
//   ⚠️ 꼭짓점 단위가 되면서 **덮인 쪽 꼭짓점만** 어두워지는 게 정상이다(그게 부드러운 조명의 목적).
//      그래서 "먼 쪽 꼭짓점은 그대로"를 본다.
{
  const w = new BrickWorld();
  for (let x = -2; x <= 4; x += 2) for (let z = -2; z <= 4; z += 2)
    w.place('terrain', x, -3, z, 0, '#6b5233', 'opaque');
  const tileA = w.at(0, -3, 0)!;
  const bare = new Float32Array(8), c2 = new Float32Array(8);
  w.recomputeLight();
  combined(w,w.bricks.get(tileA)!, bare);
  ok(bare[2] === 1 && bare[6] === 1, `깔린 지형의 위쪽 꼭짓점은 최대 밝기 — ${bare[2].toFixed(2)}`);

  // 타일 경계에 **걸치도록** 놓는다 — 셀 x=1,2 → A타일 절반 + B타일 절반
  w.place('b2x2', 1, 0, 0, 0, '#fff', 'opaque');
  w.recomputeLight();
  combined(w,w.bricks.get(tileA)!, c2);
  // 꼭짓점 인덱스 i + 2j + 4k. 덮이지 않은 −x 쪽(i=0) 위쪽 꼭짓점은 그대로여야 한다
  ok(c2[2] === bare[2], `걸친 브릭이 **먼 쪽 꼭짓점**을 어둡게 하지 않는다 — ${bare[2].toFixed(2)} → ${c2[2].toFixed(2)}`);
}

// ── 플레이트(높이 1칸) — 브릭과 다른 높이 계열이 섞여도 쌓기가 맞아야 한다 ────
// ★ 얇은 파츠는 **높이 계산이 틀려도 에러가 안 난다** — 살짝 떠 있거나 파묻힐 뿐이다.
{
  const w = new BrickWorld();
  ok(PARTS.p2x2.h === PLATE_CELLS_Y && PLATE_CELLS_Y === 1, '플레이트는 1칸');
  ok(PARTS.b2x2.h === BRICK_CELLS_Y && BRICK_CELLS_Y === 3, '브릭은 3칸');

  // 플레이트 3장 = 브릭 1개 높이 (레고와 같은 규칙)
  let y = w.restY('p2x2', 0, 0, 0);
  ok(y === 0, `첫 플레이트는 y=0 — got ${y}`);
  for (let i = 0; i < 3; i++) {
    y = w.restY('p2x2', 0, 0, 0);
    ok(y === i, `${i + 1}번째 플레이트는 y=${i} — got ${y}`);
    w.place('p2x2', 0, y, 0, 0, '#fff', 'opaque');
  }
  ok(w.topOfColumn(0, 0) === BRICK_CELLS_Y, `플레이트 3장 = 브릭 한 개 높이 — got ${w.topOfColumn(0, 0)}`);

  // 섞어 쌓기: 브릭 위에 플레이트, 플레이트 위에 브릭
  const bY = w.restY('b2x2', 10, 10, 0);
  w.place('b2x2', 10, bY, 10, 0, '#fff', 'opaque');
  ok(w.restY('p2x2', 10, 10, 0) === bY + BRICK_CELLS_Y, '브릭 위 플레이트는 브릭 꼭대기에');
  w.place('p2x2', 10, bY + BRICK_CELLS_Y, 10, 0, '#fff', 'opaque');
  ok(w.restY('b2x2', 10, 10, 0) === bY + BRICK_CELLS_Y + 1, '플레이트 위 브릭은 한 칸만 더 위에');

  // 플레이트가 브릭 옆면 한 칸에 딱 들어간다(겹치지 않는다)
  ok(w.canPlace('p2x2', 12, bY, 10, 0), '브릭 옆 빈 자리에 플레이트가 놓인다');
  ok(!w.canPlace('p2x2', 10, bY, 10, 0), '브릭이 차지한 칸엔 플레이트도 못 놓는다');
}

// ── 증분 가시성: refreshPending == recomputeAll ──────────────────────────
// ★ 스트리밍·파기가 이제 전량 재계산 대신 **주변만** 다시 굽는다(전량은 24~33ms).
//   틀려도 에러가 안 난다 — 브릭이 조용히 안 그려지거나 없어진 벽이 계속 보인다.
{
  const rand = rng(775533);
  const w = new BrickWorld();

  // placeFast로 대량 생성 — 서로 맞닿고 묻히도록 빽빽이 쌓는다
  for (let i = 0; i < 700; i++) {
    const p = PART_IDS[Math.floor(rand() * PART_IDS.length)];
    const r = ROTS[Math.floor(rand() * ROTS.length)];
    const x = Math.floor(rand() * 12) - 6;
    const z = Math.floor(rand() * 12) - 6;
    w.placeFast(p, x, w.restY(p, x, z, r), z, r, '#2266cc', MATS[i % 3]);
  }
  w.refreshPending();

  const vis = setFingerprint(w.visible);
  const stud = setFingerprint(w.studless);
  const reg = regionFingerprint(w);
  ok(w.visible.size > 50, `보이는 브릭이 충분한가 (${w.visible.size}개)`);
  ok(w.studless.size > 0, `덮인 브릭이 생겼는가 (${w.studless.size}개)`);

  w.recomputeAll();
  ok(setFingerprint(w.visible) === vis, '가시성: refreshPending == 전량 재계산');
  ok(setFingerprint(w.studless) === stud, '스터드 컬링: refreshPending == 전량 재계산');
  ok(regionFingerprint(w) === reg, '리전 멤버십: refreshPending == 전량 재계산');

  // 이어서 한 개 더 — 새 브릭이 아래 브릭의 돌기를 덮는 것까지 잡히는가
  // ★ 확정적으로 만든다 — 무작위 월드에 기대면 파츠 목록이 바뀔 때 단언이 **조용히 사라진다**
  //   (실제로 파츠를 16종으로 늘리자 `if`가 안 걸려 테스트 하나가 소리 없이 없어졌다)
  const baseY = w.restY('b2x2', 40, 40, 0);
  const under = w.placeFast('b2x2', 40, baseY, 40, 0, '#fff', 'opaque')!;
  w.refreshPending();
  ok(!w.studless.has(under), '위가 비면 돌기가 살아 있다');
  w.placeFast('b2x2', 40, baseY + BRICK_CELLS_Y, 40, 0, '#fff', 'opaque');
  w.refreshPending();
  ok(w.studless.has(under), '새로 덮인 아래 브릭의 돌기가 함께 꺼진다');
  const vis2 = setFingerprint(w.visible), stud2 = setFingerprint(w.studless), reg2 = regionFingerprint(w);
  w.recomputeAll();
  ok(setFingerprint(w.visible) === vis2, '한 개 추가 후 가시성 일치');
  ok(setFingerprint(w.studless) === stud2, '한 개 추가 후 스터드 컬링 일치');
  ok(regionFingerprint(w) === reg2, '한 개 추가 후 리전 멤버십 일치');
}

// ── ★ 반투명 이음매 — 가려진 면 마스크 (BRICK_PLAN §17) ──────────────────
//
// 유리를 붙여 놓으면 맞닿은 자리에 면이 두 겹 남아 **띠**로 보인다. 그 면을 셰이더가 지우도록
// 월드가 비트마스크를 넘긴다. **틀려도 에러가 안 나고 화면만 이상해진다** —
// 너무 많이 지우면 구멍, 덜 지우면 그대로 띠. 그래서 여기서 수치로 못 박는다.
{
  const FX = 0, FNX = 1, FY = 2, FZ = 4; // DIRS 순서: +x −x +y −y +z −z
  const bit = (d: number) => 1 << d;

  // ① 반투명 둘을 X로 붙이면 **맞닿은 두 면이 서로** 가려진다
  {
    const w = new BrickWorld();
    const a = w.place('b2x2', 0, 30, 0, 0, '#fff', 'transparent')!;
    const b = w.place('b2x2', 2, 30, 0, 0, '#fff', 'transparent')!;
    const ma = w.faceHidden.get(a) ?? 0, mb = w.faceHidden.get(b) ?? 0;
    ok((ma & bit(FX)) !== 0, `★ 왼쪽 유리의 +x 면이 가려진다 — 마스크 ${ma}`);
    ok((mb & bit(FNX)) !== 0, `★ 오른쪽 유리의 −x 면이 가려진다 — 마스크 ${mb}`);
    // 바깥쪽 면은 살아 있어야 한다(다 지우면 유리가 통째로 사라진다)
    ok((ma & bit(FNX)) === 0 && (mb & bit(FX)) === 0, '바깥으로 향한 면은 안 지운다');
    ok((ma & bit(FY)) === 0 && (ma & bit(FZ)) === 0, '트인 옆·윗면은 안 지운다');
  }

  // ② ★★ 불투명은 **언제나 0** — 이게 무너지면 유리 뒤 브릭에 구멍이 뚫린다
  {
    const w = new BrickWorld();
    const solid = w.place('b2x2', 0, 30, 0, 0, '#fff', 'opaque')!;
    w.place('b2x2', 2, 30, 0, 0, '#fff', 'transparent');       // 유리를 옆에 붙여도
    w.place('b2x2', 0, 30 + BRICK_CELLS_Y, 0, 0, '#fff', 'opaque'); // 불투명이 위를 덮어도
    ok((w.faceHidden.get(solid) ?? 0) === 0,
      `★★ 불투명 브릭의 마스크는 항상 0 — 지금 ${w.faceHidden.get(solid) ?? 0}`);

    // 반대로 유리 쪽은 불투명 이웃에 가려진 면을 지운다(그 면은 어차피 안 보인다)
    const glass = w.place('b2x2', -2, 30, 0, 0, '#fff', 'transparent')!;
    ok(((w.faceHidden.get(glass) ?? 0) & bit(FX)) !== 0, '유리는 불투명 이웃 쪽 면을 지운다');
  }

  // ③ 혼자 있는 유리는 아무 면도 안 지운다
  {
    const w = new BrickWorld();
    const lone = w.place('b1x1', 0, 30, 0, 0, '#fff', 'transparent')!;
    ok((w.faceHidden.get(lone) ?? 0) === 0, '이웃 없는 유리는 마스크 0');
  }

  // ④ **부분만 가려지면 안 지운다** — 한 칸이라도 트이면 그 면은 보인다
  {
    const w = new BrickWorld();
    const wide = w.place('b2x4', 0, 30, 0, 0, '#fff', 'transparent')!; // +z 면이 2칸 폭
    w.place('b1x1', 0, 30, 4, 0, '#fff', 'transparent');               // 그중 한 칸만 막는다
    ok(((w.faceHidden.get(wide) ?? 0) & bit(FZ)) === 0,
      '★ 면이 일부만 가려지면 안 지운다 (부분만 지우면 브릭이 뜯겨 보인다)');
  }

  // ⑤ ★ 증분 == 전량 (C-2) · 이웃을 지우면 마스크가 되돌아온다
  {
    const w = new BrickWorld();
    const a = w.place('b2x2', 0, 30, 0, 0, '#fff', 'transparent')!;
    const b = w.place('b2x2', 2, 30, 0, 0, '#fff', 'transparent')!;
    const fp = (ww: BrickWorld) => [...ww.faceHidden.entries()].sort((p, q) => p[0] - q[0]).join('|');
    const before = fp(w);
    w.recomputeAll();
    ok(fp(w) === before, '★ 마스크: 증분 갱신 == 전량 재계산');

    w.remove(b);
    ok((w.faceHidden.get(a) ?? 0) === 0, '★ 이웃을 지우면 가렸던 면이 되돌아온다');
    const after = fp(w);
    w.recomputeAll();
    ok(fp(w) === after, '지운 뒤에도 증분 == 전량');
  }

  // ⑥ ★★ 마스크가 바뀌면 **리전 리비전이 올라야** 한다 (G-6)
  //    안 올리면 값은 맞는데 화면은 옛 이음매 그대로다 — 데이터가 틀렸다고 착각하기 딱 좋다.
  //
  // ⚠️ **같은 리전에 브릭을 하나 더 놓는 방식으로는 못 잡는다** — 새 브릭이 리전에 들어오면서
  //    어차피 리비전이 오르기 때문이다(처음에 그렇게 썼다가 사보타주를 통과시켰다, F-6).
  //    → 이웃을 **다른 리전**에 놓아서, 이쪽 리전은 **마스크 변화로만** 오르게 만든다.
  {
    const w = new BrickWorld();
    const RB = 64; // 리전 경계(셀) — REGION_X = CHUNK_X × REGION_CHUNKS
    const a = w.place('b2x2', RB - 2, 30, 0, 0, '#fff', 'transparent')!;
    const keyA = regionKeyOf(RB - 2, 30, 0);
    const revOf = (k: number) => w.regionSnapshot().find((r) => r.key === k)?.rev ?? -1;
    const before = revOf(keyA);

    w.place('b2x2', RB, 30, 0, 0, '#fff', 'transparent'); // 경계 너머 = 다른 리전
    ok(regionKeyOf(RB, 30, 0) !== keyA, '전제: 두 브릭이 서로 다른 리전에 있다');
    ok((w.faceHidden.get(a) ?? 0) !== 0, '전제: 이웃이 생겨 A의 면이 가려졌다');
    ok(revOf(keyA) > before, `★★ 이음매가 바뀌면 그 리전의 리비전이 오른다 — ${before} → ${revOf(keyA)}`);
  }

  // ⑦ 경사는 대상이 아니다 — 면이 대각선이라 축에 안 떨어지고, 애초에 이웃을 안 가린다
  {
    const w = new BrickWorld();
    const slope = w.place('s1x2', 0, 30, 0, 0, '#fff', 'transparent')!;
    w.place('b2x2', 1, 30, 0, 0, '#fff', 'transparent');
    ok((w.faceHidden.get(slope) ?? 0) === 0, '경사는 마스크를 만들지 않는다');
  }
}

// 언로드도 **이웃 브릭**의 가시성을 되살려야 한다 (가리던 게 사라졌으니 다시 드러난다)
// 스트리밍이 바로 이 경우다 — 옆 청크가 내려가면 경계에 있던 브릭의 면이 열린다.
{
  const w = new BrickWorld();
  // 청크 세로 경계(y=32)를 사이에 두고 위아래로 붙인다 → 서로 다른 청크
  const below = w.place('b2x2', 0, 29, 0, 0, '#fff', 'opaque')!; // 29..31 → 아래 청크
  w.place('b2x2', 0, 32, 0, 0, '#fff', 'opaque');                // 32..34 → 위 청크
  ok(w.studless.has(below), '위가 덮이면 아래 브릭의 돌기가 꺼진다');

  const uc = chunkCoordOf(0, 32, 0);
  const upperKey = chunkKey(uc.cx, uc.cy, uc.cz);
  ok(w.hasChunk(upperKey), '위 청크가 따로 잡혔다');
  w.unloadChunk(upperKey);
  ok(!w.studless.has(below), '위 청크를 내리면 아래 브릭의 돌기가 되살아난다');

  const visAfter = setFingerprint(w.visible), studAfter = setFingerprint(w.studless);
  w.recomputeAll();
  ok(setFingerprint(w.visible) === visAfter, '언로드 후 가시성: 증분 == 전량 재계산');
  ok(setFingerprint(w.studless) === studAfter, '언로드 후 스터드 컬링: 증분 == 전량 재계산');
}

// ── 스트리밍 언로드 (P2-b) ───────────────────────────────────────────────
// ★ 언로드는 **실수하면 데이터가 지워지는** 경로다.
//   메모리에서 내리는 것뿐인데 dirty로 표시하면 "빈 청크"로 저장돼 실제로 삭제된다.
{
  const w = new BrickWorld();
  w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque');
  w.place('b2x2', 400, 0, 400, 0, '#fff', 'opaque'); // 멀리 떨어진 청크
  ok(w.dirtyChunks().some((c) => c.coord.cx > 10), '먼 청크가 생겼다');
  w.clearDirty();

  const before = w.count;
  const keys = w.loadedChunkKeys();
  ok(keys.length === 2, `청크 2개가 로드돼 있다 — got ${keys.length}`);

  // 하나를 내린다
  const removed = w.unloadChunk(keys[0]);
  ok(removed > 0, '언로드가 브릭을 내렸다');
  ok(w.count === before - removed, `남은 브릭 수가 맞다 — ${before} - ${removed} = ${w.count}`);

  // ★ 핵심: 언로드는 편집이 아니다 → 저장 대상이 되면 안 된다
  ok(!w.hasUnsaved, '언로드는 dirty를 만들지 않는다 (만들면 빈 청크로 저장돼 데이터가 지워진다)');
  ok(w.dirtyChunks().length === 0, '언로드 후 저장할 청크가 없다');

  // 파생 인덱스도 같이 정리됐는가
  ok(!w.hasChunk(keys[0]), '내린 청크는 목록에서 빠진다');
  let leaked = false;
  for (const r of w.regionSnapshot()) {
    for (const id of w.regionBrickIds(r.key) ?? []) if (!w.bricks.has(id)) leaked = true;
  }
  ok(!leaked, '내린 브릭이 리전에 남지 않는다(남으면 유령 렌더)');

  // 다시 올리면(=재로드) 원래대로
  w.placeFast('b2x2', 0, 0, 0, 0, '#fff', 'opaque');
  w.recomputeAll();
  ok(w.count === before, '재로드하면 원래 개수로 돌아온다');
}

// 언로드하면 그 자리의 기둥 높이도 사라져야 한다 (안 그러면 허공에 얹힌다)
{
  const w = new BrickWorld();
  w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque');
  w.place('b2x2', 0, 3, 0, 0, '#fff', 'opaque');
  ok(w.restY('b2x2', 0, 0, 0) === 6, '쌓인 상태에서 다음은 y=6');
  for (const k of w.loadedChunkKeys()) w.unloadChunk(k);
  ok(w.restY('b2x2', 0, 0, 0) === 0, '전부 내리면 기둥 높이도 0으로 (허공 배치 방지)');
}

// ── 바닥 파기 (지형) ─────────────────────────────────────────────────────
// ★ 파기의 핵심은 **음수 높이**다. 예전엔 y=0을 바닥으로 가정해 기둥 높이를 0에서 잘랐는데,
//   그러면 판 구멍 안에 브릭이 못 얹히고 지면 높이에 떠 버린다.
{
  const w = new BrickWorld();
  // 지형 표면 한 겹 (y = -3..-1, 윗면이 y=0)
  for (let x = 0; x < 8; x += TERRAIN_STEP)
    for (let z = 0; z < 8; z += TERRAIN_STEP)
      w.place('terrain', x, SURFACE_Y, z, 0, '#6b5233', 'opaque');

  ok(w.topOfColumn(0, 0) === 0, `지형 윗면이 지면(0) — got ${w.topOfColumn(0, 0)}`);
  ok(w.restY('b2x2', 0, 0, 0) === 0, '지형 위에 브릭을 놓으면 y=0');

  // 지형 한 칸을 판다 — 파기 전에 아래를 채워야 구멍에 바닥이 생긴다
  const target = [...w.bricks.values()].find((b) => b.x === 0 && b.z === 0)!;
  deepenAround(w, target.x, target.y, target.z);
  w.remove(target.id);
  w.recomputeAll();

  const dug = w.topOfColumn(0, 0);
  ok(dug < 0, `판 자리의 기둥 높이가 음수여야 한다 — got ${dug}`);
  ok(dug === SURFACE_Y, `한 겹 팠으니 바로 아래 지형 윗면 — got ${dug}, want ${SURFACE_Y}`);

  // ★ 구멍 안에 브릭이 얹힌다(지면에 뜨지 않는다)
  const inHole = w.restY('b2x2', 0, 0, 0);
  ok(inHole === SURFACE_Y, `구멍 안에 얹힌다 — got ${inHole}, want ${SURFACE_Y}`);
  ok(w.canPlace('b2x2', 0, inHole, 0, 0), '구멍 안 자리에 실제로 놓을 수 있다');

  // 옆 기둥은 그대로 지면 높이
  ok(w.topOfColumn(2, 0) === 0, '안 판 옆자리는 여전히 지면(0)');

  // 계속 파 내려갈 수 있다 — 구멍 바닥은 한 겹 더 아래(SURFACE_Y × 2)에 미리 채워져 있다
  const below = [...w.bricks.values()].find((b) => b.x === 0 && b.z === 0 && b.y === SURFACE_Y * 2);
  ok(!!below, `구멍 바닥이 미리 채워져 있다 (y=${SURFACE_Y * 2})`);
  if (below) {
    deepenAround(w, below.x, below.y, below.z);
    w.remove(below.id);
    w.recomputeAll();
    // 한 겹 더 파면 그 아래 블록(y=-9, -9..-7 차지)의 윗면인 -6이 꼭대기가 된다
    ok(w.topOfColumn(0, 0) === SURFACE_Y * 2, `두 겹 파면 더 내려간다 — got ${w.topOfColumn(0, 0)}, want ${SURFACE_Y * 2}`);
  }
}

// ── ★ 경사는 이웃을 감추지 않는다 (non-occluding) ────────────────────────
//   경사는 칸을 차지하면서도 **대각선이 뚫려 있다.** 감춤으로 치면 그 너머 브릭이 안 그려져
//   뚫린 쪽으로 **구멍**이 보인다. 화면에서만 드러나는 종류라 여기서 잠근다.
{
  /**
   * 1×1 브릭(칸 (0,0..2,0))을 여섯 방향에서 막고, 가운데가 그려지는지 본다.
   * `front`만 갈아끼운다 — 경사는 1×2라 여섯 면을 다 경사로 감싸면 **서로 겹쳐 배치가 실패**한다
   * (처음에 그렇게 짰더니 사보타주를 넣어도 테스트가 통과했다).
   */
  const surround = (front: 'b1x1' | 's1x2'): boolean => {
    const w = new BrickWorld();
    const mid = w.place('b1x1', 0, 0, 0, 0, '#fff', 'opaque')!;
    const box: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 3, 0], [0, -3, 0], [0, 0, -1]];
    for (const [x, y, z] of box) ok(w.place('b1x1', x, y, z, 0, '#fff', 'opaque') !== null, `감싸기 배치 (${x},${y},${z})`);
    ok(w.place(front, 0, 0, 1, 0, '#fff', 'opaque') !== null, `앞면 막기 (${front})`);
    return w.isVisible(mid);
  };
  ok(!surround('b1x1'), '여섯 면이 상자로 막히면 안 그린다(기존 규칙 유지)');
  ok(surround('s1x2'), '★ 한 면이라도 **경사**면 여전히 그린다 — 경사 틈으로 보이기 때문');
}

// ── ★ 다시 구운 빛이 **렌더러에 닿는가** ────────────────────────────────
//
//   렌더러는 리전 리비전이 바뀔 때만 인스턴스 버퍼를 다시 쓴다. 예전엔 recomputeLight가
//   리비전을 안 올려서 **빛 지도는 맞는데 화면은 옛 값**이었다(브릭을 놓으면 그때 리빌드된
//   리전만 우연히 갱신 → "어떤 건 바뀌고 어떤 건 안 바뀐다"). 눈으로만 보면 원인을 못 찾는다.
{
  const w = new BrickWorld();
  for (let x = -2; x <= 2; x += 2) for (let z = -2; z <= 2; z += 2)
    w.place('terrain', x, -3, z, 0, '#6b5233', 'opaque');
  w.recomputeLight();

  const before = new Map(w.regionSnapshot().map((r) => [r.key, r.rev]));
  ok(before.size > 0, '리전이 있다(전제)');
  w.recomputeLight();
  const after = w.regionSnapshot();
  const stale = after.filter((r) => (before.get(r.key) ?? -1) === r.rev);
  ok(stale.length === 0, `★ 빛을 다시 구우면 **모든 리전**의 리비전이 오른다 — 안 오른 리전 ${stale.length}개`);
}

// ── ★ 구석 그늘(AO) ─────────────────────────────────────────────────────
//
//   규칙: 평평한 면·볼록 모서리는 **그대로**, 오목한 안쪽 구석만 어두워진다.
//   (밝아지는 곳이 있으면 전역 밝기가 흔들려 "룩이 통째로 바뀌었다"가 된다)
{
  const w = new BrickWorld();
  for (let x = -6; x <= 8; x += 2) for (let z = -6; z <= 8; z += 2)
    w.place('terrain', x, -3, z, 0, '#6b5233', 'opaque');
  w.recomputeLight();

  const c = new Float32Array(8);
  const cornersOf = (x: number, z: number) => { combined(w,w.bricks.get(w.at(x, -3, z)!)!, c); return Array.from(c); };

  const flat = cornersOf(6, 6);
  ok(flat[2] === 1 && flat[3] === 1 && flat[6] === 1 && flat[7] === 1,
    `★ 평평한 바닥의 윗면 꼭짓점은 그대로 1.0 — ${flat[2].toFixed(2)}`);

  // 벽을 세운다 — 벽에 닿은 바닥 꼭짓점이 오목한 구석이다
  const near = cornersOf(0, 0);                       // 벽이 설 자리 바로 옆 타일
  for (let y = 0; y < 6; y += 3) w.place('b2x2', 2, y, 0, 0, '#fff', 'opaque');
  w.recomputeLight();
  const withWall = cornersOf(0, 0);

  // +x(i=1) 위쪽 꼭짓점 = 벽에 닿은 쪽 / −x(i=0) 위쪽 = 먼 쪽
  ok(withWall[3] < near[3], `★ 벽에 닿은 바닥 꼭짓점이 어두워진다 — ${near[3].toFixed(2)} → ${withWall[3].toFixed(2)}`);
  ok(withWall[2] === near[2], `먼 쪽 꼭짓점은 그대로 — ${near[2].toFixed(2)} → ${withWall[2].toFixed(2)}`);

  // 벽 자신의 바깥(볼록) 위쪽 꼭짓점은 안 어두워진다
  const wallTop = new Float32Array(8);
  combined(w,w.bricks.get(w.at(2, 3, 0)!)!, wallTop);
  ok(wallTop[3] === 1 || wallTop[7] === 1, `볼록한 벽 꼭대기 바깥 꼭짓점은 1.0 — ${wallTop[3].toFixed(2)}/${wallTop[7].toFixed(2)}`);
}

// ── ★★★ 세계 좌표 꼭짓점 == 브릭 꼭짓점 (칸 단위 조명의 안전장치) ──────────
//
// `cornerValueAt`은 조명 해상도를 **브릭 → 칸**으로 올리기 위한 재료다(§18-2).
// 갈아타는 순간 **화면이 통째로 바뀌면 안 되므로**, 같은 자리에서 **같은 값**이 나와야 한다.
//
// ⚠️ 세는 방식이 다르다: 브릭 쪽은 자기 몸을 빼고 7칸, 세계 쪽은 주인이 없어 8칸.
//    기준(FLAT)을 하나 올려 맞춰 놨는데, **그게 실제로 맞는지**를 여기서 못 박는다.
{
  const w = new BrickWorld();
  const rand = rng(4242);
  for (let x = -10; x <= 10; x += 2) for (let z = -10; z <= 10; z += 2)
    w.placeFast('terrain', x, -3, z, 0, '#fff', 'opaque');
  // 벽·계단·구석이 섞이도록 무작위로 쌓는다 — 평평한 곳만 보면 차이가 안 드러난다
  for (let i = 0; i < 120; i++) {
    const p = PART_IDS[Math.floor(rand() * PART_IDS.length)];
    const x = Math.floor(rand() * 8) - 4, z = Math.floor(rand() * 8) - 4;
    w.placeFast(p, x, w.restY(p, x, z, 0), z, 0, '#fff', 'opaque');
  }
  w.refreshPending();
  w.recomputeLight();

  const sky = new Float32Array(8), ao = new Float32Array(8), pair = new Float32Array(2);
  let same = 0, total = 0;
  let worstSky = 0, worstAO = 0;
  for (const b of w.bricks.values()) {
    if (!w.isVisible(b.id)) continue;
    w.cornerLight(b, sky, ao);
    const e = extentOf(PARTS[b.part], b.rot);
    // 꼭짓점 순서: i + 2j + 4k (i=+x, j=+y, k=+z) — 브릭 AABB의 여덟 모서리
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const idx = i + 2 * j + 4 * k;
      w.cornerValueAt(b.x + i * e.ex, b.y + j * e.ey, b.z + k * e.ez, pair);
      total++;
      const ds = Math.abs(pair[0] - sky[idx]), da = Math.abs(pair[1] - ao[idx]);
      if (ds < 1e-9 && da < 1e-9) same++;
      worstSky = Math.max(worstSky, ds); worstAO = Math.max(worstAO, da);
    }
  }
  ok(total > 300, `충분한 표본인가 — ${total}개 꼭짓점`);
  ok(same === total,
    `★★★ 세계 좌표 계산이 브릭 계산과 **같은 값**을 낸다 — ${same}/${total} (최대 차이 하늘빛 ${worstSky.toFixed(6)} · 그늘 ${worstAO.toFixed(6)})`);
}

// ── ★ AO 응답 곡선 — 첫 접촉이 세고 그 뒤는 완만 (마인크래프트 밑동 그늘) ──────
//
//   선형으로 깎으면 **세기를 낮추면 밑동이 안 보이고, 올리면 깊은 구석이 새까매진다** — 둘 다 실제로 겪었다.
//   `√` 응답이면 첫 칸에서 확 떨어지고 그 뒤는 완만해 둘 다 피한다. 값이 아니라 **곡선 모양**을 잠근다.
{
  const floorCorner = (walls: [number, number][]) => {
    const w = new BrickWorld();
    for (let x = -8; x <= 10; x += 2) for (let z = -8; z <= 10; z += 2)
      w.place('terrain', x, -3, z, 0, '#6b5233', 'opaque');
    for (const [wx, wz] of walls)
      for (let y = 0; y < 9; y += 3) w.place('b2x2', wx, y, wz, 0, '#fff', 'opaque');
    w.recomputeLight();
    const c = new Float32Array(8);
    combined(w,w.bricks.get(w.at(0, -3, 0)!)!, c);
    return c[7]; // +x·+z 쪽 위 꼭짓점 — 벽을 붙이는 방향
  };

  const flat = floorCorner([]);
  const one = floorCorner([[2, 0]]);                 // 한 면이 벽
  const two = floorCorner([[2, 0], [0, 2]]);         // ㄱ자 구석
  const three = floorCorner([[2, 0], [0, 2], [2, 2]]); // 대각까지 막힘

  ok(flat === 1, `평면은 1.0 — ${flat.toFixed(2)}`);

  // ★★★ **단계가 살아 있어야 한다 — 여기가 이번 버그의 핵심이다.**
  //
  // 🔴 예전 테스트는 `three <= two`를 허용했다("깊은 쪽은 하한에서 포화"). 그래서
  //    막힌 칸이 2·3·4개인 자리가 **전부 같은 값**이 되는 걸 통과시켰고,
  //    화면에서는 오목한 자리가 **단계 없는 납작한 얼룩**으로 보였다
  //    (사용자 신고: "바닥에 브릭을 놓으면 맞닿은 경계에 그림자가 어색하게 생긴다").
  //    → 이제 **엄격한 부등호**로 잠근다. 포화하면 여기서 걸린다.
  ok(one < flat, `막히면 어두워진다 — ${flat.toFixed(2)} → ${one.toFixed(2)}`);
  ok(two < one, `★ 2칸 막힘이 1칸보다 어둡다 — ${one.toFixed(3)} → ${two.toFixed(3)}`);
  ok(three < two, `★★★ 3칸 막힘이 2칸보다 **더** 어둡다(포화 금지) — ${two.toFixed(3)} → ${three.toFixed(3)}`);

  ok((flat - one) > (one - two),
    `★ 첫 접촉이 가장 크게 떨어진다 — 낙차 ${(flat - one).toFixed(2)} > ${(one - two).toFixed(3)}`);
  // ⚠️ 이 값들은 **곡선을 먹기 전의 원값**이다. 숫자를 여기 박아 두면 곡선을 바꿀 때마다 깨지고,
  //    그때 "테스트가 틀렸나 코드가 틀렸나"를 매번 다시 따져야 한다.
  //    → **화면에 나오는 값**으로 본다. 세기·곡선·거리별 모양은 `shading.test.ts`가 전담한다.
  ok(screenShade(one) > 0.52 && screenShade(one) < 0.72,
    `★ 접촉면의 화면 밝기가 제 범위 — ${screenShade(one).toFixed(3)}`);
  ok(screenShade(three) < screenShade(two),
    `깊은 구석이 화면에서도 더 어둡다 — ${screenShade(two).toFixed(3)} → ${screenShade(three).toFixed(3)}`);
}

console.log(`\n브릭 월드(파생 인덱스 + 빛 + 스트리밍 + 파기) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails.slice(0, 12)) console.log('  ✗ ' + f);
  if (fails.length > 12) console.log(`  … 외 ${fails.length - 12}건`);
  process.exit(1);
}
