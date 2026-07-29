// 실행: npx tsx src/lib/brick/world.test.ts
//
// BrickWorld는 파생 인덱스를 **증분으로** 갱신한다(가시성·기둥 높이·청크·리전).
// 증분 갱신은 틀려도 에러가 안 난다 — 브릭이 조용히 안 그려지거나, 엉뚱한 높이에 얹힌다.
//
// 그래서 잠그는 불변식은 하나로 요약된다:
//   **증분으로 갱신한 결과 == 처음부터 전부 계산한 결과**

import { regionKeyOf, type Rot } from './grid';
import { PART_LIST, type MatClass, type PartId } from './parts';
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

console.log(`\n브릭 월드(파생 인덱스 + 빛 + 스트리밍) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails.slice(0, 12)) console.log('  ✗ ' + f);
  if (fails.length > 12) console.log(`  … 외 ${fails.length - 12}건`);
  process.exit(1);
}
