// 실행: npx tsx src/lib/brick/world.test.ts
//
// BrickWorld는 파생 인덱스를 **증분으로** 갱신한다(가시성·기둥 높이·청크·리전).
// 증분 갱신은 틀려도 에러가 안 난다 — 브릭이 조용히 안 그려지거나, 엉뚱한 높이에 얹힌다.
//
// 그래서 잠그는 불변식은 하나로 요약된다:
//   **증분으로 갱신한 결과 == 처음부터 전부 계산한 결과**

import { BRICK_CELLS_Y, chunkCoordOf, chunkKey, regionKeyOf, type Rot } from './grid';
import { PART_LIST, PARTS, PLATE_CELLS_Y, TERRAIN_STEP, type MatClass, type PartId } from './parts';
import { deepenAround, SURFACE_Y } from './terrain';
import { BrickWorld } from './world';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const PART_IDS: PartId[] = PART_LIST.map((p) => p.id);
const ROTS: Rot[] = [0, 1, 2, 3];
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

// 면 밝기: 하늘을 향한 윗면이 파묻힌 밑면보다 밝다
{
  const w = new BrickWorld();
  const id = w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque')!;
  w.recomputeLight();
  const f = new Float32Array(6);
  w.faceLight(w.bricks.get(id)!, f);
  ok(f[2] > f[3], `윗면(${f[2].toFixed(2)})이 바닥에 닿은 밑면(${f[3].toFixed(2)})보다 밝다`);
  ok(f[2] === 1, '뻥 뚫린 윗면은 최대 밝기');
}

// ★ 면 방향 고정 배율 — 마인크래프트처럼 **태양 방향이 없다**.
//   사방이 트인 브릭은 카메라·시간과 무관하게 항상 같은 배율이어야 한다.
//   (실시간 방향광을 되살리면 이 고정성이 깨지고 "블록에 그림자가 진다")
{
  const w = new BrickWorld();
  const id = w.place('b1x1', 0, 300, 0, 0, '#fff', 'opaque')!; // 허공 — 여섯 면 모두 트임
  w.recomputeLight();
  const f = new Float32Array(6);
  w.faceLight(w.bricks.get(id)!, f);
  // Float32Array라 정확히 같진 않다. 아래 브릭 없는 칸은 하늘빛이 한 단계 낮아 0.5×0.97.
  const near = (a: number, b: number) => Math.abs(a - b) < 0.03;
  ok(near(f[2], 1.0), `윗면 1.0 — got ${f[2].toFixed(2)}`);
  ok(near(f[3], 0.5), `밑면 0.5 — got ${f[3].toFixed(2)}`);
  ok(near(f[4], 0.8) && f[4] === f[5], `앞뒤(z) 0.8 · 좌우 대칭 — got ${f[4].toFixed(2)}/${f[5].toFixed(2)}`);
  ok(near(f[0], 0.6) && f[0] === f[1], `동서(x) 0.6 · 좌우 대칭 — got ${f[0].toFixed(2)}/${f[1].toFixed(2)}`);
  ok(f[2] > f[4] && f[4] > f[0] && f[0] > f[3], '윗면 > 남북 > 동서 > 밑면 (네 면이 균일하면 입체감이 죽는다)');
}

// ★ 걸쳐 놓은 브릭이 아래 타일 전체를 어둡게 만들면 안 된다 (= "그림자처럼 보인다")
//   면 하나에 밝기 하나뿐이라, 막힌 칸을 평균에 넣으면 절반만 덮였는데 전체가 어두워진다.
{
  const w = new BrickWorld();
  // 지형 타일(2×2)을 깐다 — 각 타일은 셀 [x, x+1] × [z, z+1]
  for (let x = -2; x <= 4; x += 2) for (let z = -2; z <= 4; z += 2)
    w.place('terrain', x, -3, z, 0, '#6b5233', 'opaque');
  const tileA = w.at(0, -3, 0)!, tileB = w.at(2, -3, 0)!;
  const bare = new Float32Array(6), f2 = new Float32Array(6);
  w.recomputeLight();
  w.faceLight(w.bricks.get(tileA)!, bare);
  ok(bare[2] === 1, `깔린 지형 윗면은 최대 밝기 — got ${bare[2].toFixed(2)}`);

  // ★ 타일 경계에 **걸치도록** 놓는다 — 셀 x=1,2 → A타일 절반 + B타일 절반
  w.place('b2x2', 1, 0, 0, 0, '#fff', 'opaque');
  w.recomputeLight();
  w.faceLight(w.bricks.get(tileA)!, f2);
  ok(f2[2] === bare[2], `걸친 브릭이 왼쪽 타일을 어둡게 하지 않는다 — ${bare[2].toFixed(2)} → ${f2[2].toFixed(2)}`);
  w.faceLight(w.bricks.get(tileB)!, f2);
  ok(f2[2] === bare[2], `걸친 브릭이 오른쪽 타일을 어둡게 하지 않는다 — ${bare[2].toFixed(2)} → ${f2[2].toFixed(2)}`);

  // 완전히 덮인 타일은 어차피 안 그려진다 — 규칙(전부 막힘 = 어둠)만 확인
  const covered = w.at(4, -3, 4)!;
  w.place('b2x2', 4, 0, 4, 0, '#fff', 'opaque');
  w.recomputeLight();
  w.faceLight(w.bricks.get(covered)!, f2);
  ok(f2[2] < bare[2], '완전히 덮인 타일 윗면은 어둡다(안 보이는 면)');
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

console.log(`\n브릭 월드(파생 인덱스 + 빛 + 스트리밍 + 파기) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails.slice(0, 12)) console.log('  ✗ ' + f);
  if (fails.length > 12) console.log(`  … 외 ${fails.length - 12}건`);
  process.exit(1);
}
