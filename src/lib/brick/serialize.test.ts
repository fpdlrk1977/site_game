// 실행: npx tsx src/lib/brick/serialize.test.ts
//
// 저장은 되돌릴 수 없는 계약이다. 포맷이 한 번 나가면 그걸로 저장된 월드가 생기고,
// 인덱스 순서 하나만 어긋나도 **에러 없이 다른 브릭으로 복원된다**(조용히 틀림).
// 그래서 왕복(encode→decode)이 완전히 같은지를 전수로 잠근다.

import { chunkCoordOf, chunkOriginX, chunkOriginY, chunkOriginZ, CHUNK_X, CHUNK_Y, CHUNK_Z, type Rot } from './grid';
import { PART_LIST, type MatClass } from './parts';
import { base64ToBytes, bytesToBase64, decodeChunk, encodeChunk, toBrickData, type BrickData } from './serialize';
import { BrickWorld } from './world';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const MATS: MatClass[] = ['opaque', 'transparent', 'emissive'];
const ROTS: Rot[] = [0, 1, 2, 3];

const same = (a: BrickData, b: BrickData) =>
  a.part === b.part && a.x === b.x && a.y === b.y && a.z === b.z &&
  a.rot === b.rot && a.mat === b.mat && a.color.toLowerCase() === b.color.toLowerCase();

/** 순서 무관 비교 — 청크 안 브릭 순서는 보존 대상이 아니다 */
function sameSet(a: BrickData[], b: BrickData[]): boolean {
  if (a.length !== b.length) return false;
  const rest = [...b];
  for (const x of a) {
    const i = rest.findIndex((y) => same(x, y));
    if (i < 0) return false;
    rest.splice(i, 1);
  }
  return true;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ── 파츠 × 회전 × 재질 전수 왕복 ─────────────────────────────────────────
{
  for (const p of PART_LIST) {
    for (const rot of ROTS) {
      for (const mat of MATS) {
        const src: BrickData[] = [{ part: p.id, x: 0, y: 0, z: 0, rot, color: '#3f7ac2', mat }];
        const back = decodeChunk(encodeChunk(src, 0, chunkCoordOf(0, 0, 0).cy, 0), 0, chunkCoordOf(0, 0, 0).cy, 0);
        ok(sameSet(src, back), `왕복: ${p.id}/r${rot}/${mat}`);
      }
    }
  }
}

// ── 청크 구석구석 좌표 (경계 포함) ───────────────────────────────────────
{
  const c = { cx: -3, cy: 2, cz: 5 };
  const ox = chunkOriginX(c.cx), oy = chunkOriginY(c.cy), oz = chunkOriginZ(c.cz);
  const src: BrickData[] = [];
  for (const lx of [0, CHUNK_X - 1]) {
    for (const ly of [0, CHUNK_Y - 1]) {
      for (const lz of [0, CHUNK_Z - 1]) {
        src.push({ part: 'b1x1', x: ox + lx, y: oy + ly, z: oz + lz, rot: 0, color: '#ffffff', mat: 'opaque' });
      }
    }
  }
  const back = decodeChunk(encodeChunk(src, c.cx, c.cy, c.cz), c.cx, c.cy, c.cz);
  ok(sameSet(src, back), '청크 8모서리 좌표 왕복(음수 청크 포함)');
}

// ── 팔레트: 색이 많아도 레코드는 안 커지고, 색은 정확히 복원된다 ──────────
{
  const rand = rng(7);
  const src: BrickData[] = [];
  for (let i = 0; i < 60; i++) {
    const hex = `#${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`;
    src.push({ part: 'b1x1', x: i % 16, y: 0, z: Math.floor(i / 16), rot: 0, color: hex, mat: MATS[i % 3] });
  }
  const cy = chunkCoordOf(0, 0, 0).cy;
  const bytes = encodeChunk(src, 0, cy, 0);
  ok(sameSet(src, decodeChunk(bytes, 0, cy, 0)), '색 60가지 왕복');

  // 같은 색을 반복하면 팔레트가 한 항목으로 합쳐져 크기가 거의 안 는다
  const mono: BrickData[] = src.map((b) => ({ ...b, color: '#d01012', mat: 'opaque' }));
  const monoBytes = encodeChunk(mono, 0, cy, 0);
  ok(monoBytes.length < bytes.length, `팔레트 중복 제거 (단색 ${monoBytes.length}B < 다색 ${bytes.length}B)`);
}

// ── base64 왕복 (localStorage 경로) ──────────────────────────────────────
{
  const rand = rng(99);
  const raw = new Uint8Array(5000);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(rand() * 256);
  const back = base64ToBytes(bytesToBase64(raw));
  ok(back.length === raw.length && back.every((v, i) => v === raw[i]), 'base64 왕복(5KB 이진)');
}

// ── 월드 전체: 청크로 쪼개 저장 → 복원하면 같은 월드 ─────────────────────
{
  const rand = rng(20260729);
  const w = new BrickWorld();
  const parts = PART_LIST.map((p) => p.id);
  for (let i = 0; i < 500; i++) {
    const p = parts[Math.floor(rand() * parts.length)];
    const r = ROTS[Math.floor(rand() * ROTS.length)];
    // 청크 경계를 넘나들도록 넓게 뿌린다
    const x = Math.floor(rand() * 60) - 30;
    const z = Math.floor(rand() * 60) - 30;
    w.place(p, x, w.restY(p, x, z, r), z, r, MATS[i % 3] === 'opaque' ? '#d01012' : '#0d69ab', MATS[i % 3]);
  }
  ok(w.count > 300, `월드가 충분히 찼는가 (${w.count}개)`);
  ok(w.chunkCount > 4, `여러 청크에 걸쳤는가 (${w.chunkCount}청크)`);

  // 저장
  const saved = w.dirtyChunks().map(({ coord, bricks }) => ({
    coord,
    data: bricks.length ? encodeChunk(bricks.map(toBrickData), coord.cx, coord.cy, coord.cz) : null,
  }));
  w.clearDirty();
  ok(!w.hasUnsaved, '저장 후 dirty가 비워진다');

  // 복원
  const w2 = new BrickWorld();
  for (const s of saved) {
    if (!s.data) continue;
    for (const d of decodeChunk(s.data, s.coord.cx, s.coord.cy, s.coord.cz)) {
      w2.placeFast(d.part, d.x, d.y, d.z, d.rot, d.color, d.mat);
    }
  }
  w2.recomputeAll();

  ok(w2.count === w.count, `브릭 수 일치 (${w.count} → ${w2.count})`);
  const a = [...w.bricks.values()].map(toBrickData);
  const b = [...w2.bricks.values()].map(toBrickData);
  ok(sameSet(a, b), '모든 브릭이 그대로 복원된다');

  // 파생 상태(가시성·기둥 높이)도 재구성 후 같아야 한다
  ok(w2.visibleCount === w.visibleCount, `보이는 브릭 수 일치 (${w.visibleCount} → ${w2.visibleCount})`);
  let restSame = true;
  for (let x = -30; x <= 30; x += 3)
    for (let z = -30; z <= 30; z += 3)
      if (w.restY('b2x4', x, z, 0) !== w2.restY('b2x4', x, z, 0)) restSame = false;
  ok(restSame, '얹힐 높이(restY)가 복원 후에도 같다');
}

// ── dirty 추적: 바뀐 청크만 저장 대상이 된다 ─────────────────────────────
{
  const w = new BrickWorld();
  w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque');       // 청크 A
  w.place('b2x2', 40, 0, 40, 0, '#fff', 'opaque');     // 청크 B (멀리)
  ok(w.dirtyChunks().length === 2, '새 브릭 2개 → 청크 2개가 dirty');
  w.clearDirty();
  ok(w.dirtyChunks().length === 0, 'clearDirty 후 0');

  w.place('b1x1', 1, 6, 1, 0, '#fff', 'opaque');       // 청크 A만 건드림
  const d = w.dirtyChunks();
  ok(d.length === 1 && d[0].coord.cx === 0 && d[0].coord.cz === 0, '한 청크만 고치면 그 청크만 dirty');
}

// ── 청크가 비면 "삭제"로 나가야 한다 ─────────────────────────────────────
{
  const w = new BrickWorld();
  const id = w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque')!;
  w.clearDirty();
  w.remove(id);
  const d = w.dirtyChunks();
  ok(d.length === 1 && d[0].bricks.length === 0, '마지막 브릭을 지우면 빈 청크가 dirty로 (저장소에서 삭제)');
}

// ── 소유권은 앵커 청크 (경계를 넘는 브릭) ────────────────────────────────
{
  const w = new BrickWorld();
  // 앵커가 청크 0의 끝에 있고 몸통이 청크 1로 넘어가는 2×4
  const x = CHUNK_X - 1;
  w.place('b2x4', x, 0, 0, 0, '#fff', 'opaque');
  const d = w.dirtyChunks().filter((c) => c.bricks.length > 0);
  ok(d.length === 1, '경계를 넘는 브릭도 청크 하나만 소유한다');
  ok(d[0].coord.cx === chunkCoordOf(x, 0, 0).cx, '소유 청크 = 앵커가 있는 청크');
  // 그 청크로 왕복해도 좌표가 보존된다
  const back = decodeChunk(
    encodeChunk(d[0].bricks.map(toBrickData), d[0].coord.cx, d[0].coord.cy, d[0].coord.cz),
    d[0].coord.cx, d[0].coord.cy, d[0].coord.cz,
  );
  ok(back[0].x === x, '경계 브릭 좌표 왕복');
}

// ── ★ 골든 픽스처: 옛 데이터를 새 코드로 읽어도 같은가 ──────────────────
//
// 왕복(encode→decode) 테스트만으로는 **부족하다.** 인코더와 디코더가 같은 표를 쓰므로
// PART_ORDER 순서를 바꿔도 왕복은 여전히 일치한다 — 그런데 그건 이미 저장된 데이터를
// **에러 없이 다른 브릭으로** 읽는다는 뜻이다(조용히 틀림).
// 그래서 **고정된 바이트열**을 박아두고, 그게 정해진 브릭으로 디코드되는지를 잠근다.
//
// ⚠️ 이 바이트열이 안 맞으면 = 저장 포맷이 바뀐 것이다.
//    이미 저장된 월드가 깨지므로, 버전을 올리고 마이그레이션을 붙일 것.
//    (픽스처를 새 값으로 갈아끼우는 것으로 "고쳤다" 하지 말 것)
{
  const GOLDEN =
    '42524b010300040000d01012010d69ab02f2cd37000000000000000101010302010002020406050200030308090a0000';
  const bytes = new Uint8Array(GOLDEN.match(/../g)!.map((h) => parseInt(h, 16)));

  const expected: BrickData[] = [
    { part: 'b1x1', x: 0, y: 0, z: 0, rot: 0, color: '#d01012', mat: 'opaque' },
    { part: 'b1x2', x: 1, y: 3, z: 2, rot: 1, color: '#0d69ab', mat: 'transparent' },
    { part: 'b2x2', x: 4, y: 6, z: 5, rot: 2, color: '#f2cd37', mat: 'emissive' },
    { part: 'b2x4', x: 8, y: 9, z: 10, rot: 3, color: '#d01012', mat: 'opaque' },
  ];

  const got = decodeChunk(bytes, 0, 2, 0);
  ok(sameSet(expected, got), '골든: 고정 바이트열이 정해진 브릭으로 디코드된다 (파츠·재질 인덱스 순서 고정)');

  // 인코더도 같은 바이트를 낸다 (포맷이 안 바뀌었음)
  const re = encodeChunk(expected, 0, 2, 0);
  ok(
    re.length === bytes.length && re.every((v, i) => v === bytes[i]),
    '골든: 지금 인코더가 같은 바이트열을 만든다',
  );
}

console.log(`\n브릭 저장(직렬화·청크·dirty) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails.slice(0, 12)) console.log('  ✗ ' + f);
  if (fails.length > 12) console.log(`  … 외 ${fails.length - 12}건`);
  process.exit(1);
}
