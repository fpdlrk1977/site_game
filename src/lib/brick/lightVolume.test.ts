// 실행: npx tsx src/lib/brick/lightVolume.test.ts
//
// 칸 단위 조명 볼륨(§18 2단계)의 **좌표 매핑과 굽는 비용**을 잠근다.
//
// 🔴 계획서가 이 항목의 위험으로 딱 두 가지를 적었다. 그 둘을 여기서 못 박는다:
//   ① **반 칸만 어긋나도 그늘이 통째로 밀린다** — 에러가 안 나서 화면을 봐야만 안다
//   ② **굽는 비용** — 부피 전체를 계산하면 편집이 끊긴다

import { CELL_X, CELL_Y, CELL_Z, REGION_X, REGION_Y, REGION_Z, regionCoordOf } from './grid';
import {
  RegionLightVolume, VOL_MARGIN, VOL_TEXELS, VOL_X, VOL_Y, VOL_Z, volCoord, volIndex, volUVW,
} from './lightVolume';
import { BrickWorld } from './world';
import { PART_LIST, type PartId } from './parts';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };
const near = (a: number, b: number, label: string, eps = 1e-9) =>
  ok(Math.abs(a - b) < eps, `${label} — ${a} vs ${b}`);

// ── 격자 크기 — 칸이 N개면 모서리는 N+1개 ───────────────────────────────
{
  // 칸이 N개면 모서리는 N+1개 — 이 `+1`이 없으면 리전 마지막 한 줄이 안 이어진다
  ok(VOL_X >= REGION_X + 1 && VOL_Y >= REGION_Y + 1 && VOL_Z >= REGION_Z + 1,
    `★★ 꼭짓점 격자가 칸보다 크다 — ${VOL_X}×${VOL_Y}×${VOL_Z}`);
  ok(VOL_TEXELS === VOL_X * VOL_Y * VOL_Z, '텍셀 수가 격자 크기와 맞는다');

  // ★★ 여백 — 리전 소유권은 앵커 기준이라 **브릭이 경계를 넘어간다**(가장 긴 파츠 8칸).
  //    여백이 모자라면 걸친 브릭의 끝이 볼륨 밖을 읽어 **32m마다 경계선이 보인다.**
  const longest = Math.max(...PART_LIST.map((p) => Math.max(p.sx, p.sz, p.h)));
  ok(VOL_MARGIN >= longest,
    `★★★ 여백이 가장 긴 파츠(${longest}칸)보다 넉넉하다 — ${VOL_MARGIN}칸`);
}

// ── 텍셀 번호 매기기 — x가 가장 빠르다 ──────────────────────────────────
{
  ok(volIndex(0, 0, 0) === 0, '원점이 0번');
  ok(volIndex(1, 0, 0) === 1, '★ x가 가장 빠르게 증가한다(업로드 순서와 같아야 한다)');
  ok(volIndex(0, 1, 0) === VOL_X, 'y는 한 줄 건너');
  ok(volIndex(0, 0, 1) === VOL_X * VOL_Y, 'z는 한 판 건너');

  // 전 범위 왕복 — 겹치는 번호가 있으면 값이 서로 덮인다
  const seen = new Set<number>();
  let dup = 0;
  for (let z = 0; z < VOL_Z; z += 7) for (let y = 0; y < VOL_Y; y += 5) for (let x = 0; x < VOL_X; x += 3) {
    const t = volIndex(x, y, z);
    if (seen.has(t)) dup++;
    seen.add(t);
    if (t < 0 || t >= VOL_TEXELS) dup++;
  }
  ok(dup === 0, `★ 격자 좌표마다 번호가 하나씩, 범위 안이다 — 겹침 ${dup}`);
}

// ── ★★★ 반 칸 어긋남 — 이 항목의 최대 위험 ──────────────────────────────
{
  const origin: [number, number, number] = [10, -4, 6];

  // 셀 n의 **최소 모서리**는 월드 n·CELL이다. 그 자리를 조회하면 격자 좌표가 딱 정수여야 한다.
  const g = volCoord(12 * CELL_X, -2 * CELL_Y, 9 * CELL_Z, CELL_X, CELL_Y, CELL_Z, origin);
  near(g[0], 2, '★★★ 셀 모서리를 조회하면 격자 좌표가 정수다 (x)');
  near(g[1], 2, '★★★ 정수다 (y)');
  near(g[2], 3, '★★★ 정수다 (z)');

  // 칸 **한가운데**는 0.5여야 한다 — 여기가 어긋나면 그늘이 반 칸 밀린다
  const mid = volCoord(12.5 * CELL_X, -1.5 * CELL_Y, 9.5 * CELL_Z, CELL_X, CELL_Y, CELL_Z, origin);
  near(mid[0], 2.5, '★★★ 칸 한가운데는 .5 (반 칸 어긋남 없음)');
  near(mid[1], 2.5, '★★★ 한가운데다 (y)');
  near(mid[2], 3.5, '★★★ 한가운데다 (z)');

  // 원점 이동이 실제로 먹는가
  const shifted = volCoord(10 * CELL_X, -4 * CELL_Y, 6 * CELL_Z, CELL_X, CELL_Y, CELL_Z, origin);
  ok(shifted[0] === 0 && shifted[1] === 0 && shifted[2] === 0, '★ 볼륨 원점이 격자 0,0,0에 온다');

  // ★★ 텍스처 좌표는 **텍셀 중심**을 겨눈다 — 반 텍셀을 빼먹으면 전체가 밀린다
  const uvw = volUVW([0, 0, 0]);
  near(uvw[0], 0.5 / VOL_X, '★★★ 격자 0의 텍스처 좌표 = 반 텍셀 (0이 아니다)');
  const uvwLast = volUVW([VOL_X - 1, VOL_Y - 1, VOL_Z - 1]);
  ok(uvwLast[0] < 1 && uvwLast[0] > 1 - 1 / VOL_X,
    `★★ 마지막 격자도 텍스처 안쪽에 있다 — ${uvwLast[0].toFixed(5)}`);
}

// ── ★★★ 구운 값이 `cornerValueAt`과 같은가 ──────────────────────────────
{
  const w = new BrickWorld();
  const PART_IDS: PartId[] = PART_LIST.map((p) => p.id);
  let s = 77 >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

  for (let x = -10; x <= 10; x += 2) for (let z = -10; z <= 10; z += 2)
    w.placeFast('terrain', x, -3, z, 0, '#fff', 'opaque');
  for (let i = 0; i < 150; i++) {
    const p = PART_IDS[Math.floor(rand() * PART_IDS.length)];
    const x = Math.floor(rand() * 10) - 5, z = Math.floor(rand() * 10) - 5;
    w.placeFast(p, x, w.restY(p, x, z, 0), z, 0, '#fff', 'opaque');
  }
  w.refreshPending();
  w.recomputeLight();

  const rc = regionCoordOf(0, 0, 0);
  const vol = new RegionLightVolume(rc.rx * REGION_X, rc.ry * REGION_Y + -64, rc.rz * REGION_Z);
  const ids = [...w.visible];
  vol.bake(w, ids);

  ok(vol.stats.corners > 500, `표면 근처 꼭짓점을 실제로 채웠다 — ${vol.stats.corners}개`);

  // 채운 자리는 원래 계산과 같아야 한다(8비트로 눌러 담으므로 1/255 오차 허용)
  const pair = new Float32Array(2);
  let same = 0, checked = 0, worst = 0;
  for (const id of ids) {
    const b = w.bricks.get(id);
    if (!b) continue;
    const lx = b.x - vol.originX, ly = b.y - vol.originY, lz = b.z - vol.originZ;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= VOL_X || ly >= VOL_Y || lz >= VOL_Z) continue;
    w.cornerValueAt(b.x, b.y, b.z, pair);
    const [gotSky, gotAO] = vol.read(lx, ly, lz);
    checked++;
    const d = Math.max(Math.abs(gotSky - pair[0]), Math.abs(gotAO - pair[1]));
    worst = Math.max(worst, d);
    if (d <= 1 / 255 + 1e-9) same++;
  }
  ok(checked > 50, `충분히 확인했다 — ${checked}개`);
  ok(same === checked,
    `★★★ 구운 값이 원래 계산과 같다(8비트 오차 안) — ${same}/${checked} · 최대 차이 ${worst.toFixed(5)}`);

  // ── ★★ 굽는 비용 — 계획서가 지목한 두 번째 위험 ──────────────────────
  //
  // 부피 전체(54만 꼭짓점)를 계산하면 못 쓴다. **표면 근처만** 채우는지 숫자로 확인한다.
  ok(vol.stats.corners < VOL_TEXELS / 4,
    `★★ 부피 전체가 아니라 표면 근처만 계산한다 — ${vol.stats.corners} / 전체 ${VOL_TEXELS}`);
  console.log(`  · 굽기: 꼭짓점 ${vol.stats.corners}개 · ${vol.stats.ms.toFixed(1)}ms (브릭 ${ids.length}개)`);

  // 두 번 구워도 같은 결과(결정적) — 편집할 때마다 명암이 흔들리면 안 된다
  const first = Array.from(vol.data);
  vol.bake(w, ids);
  let identical = true;
  for (let i = 0; i < first.length; i++) if (first[i] !== vol.data[i]) { identical = false; break; }
  ok(identical, '★ 같은 월드를 두 번 구우면 같은 값 (결정적)');
}

// ── ★★★ 증분 굽기 == 전량 굽기 ──────────────────────────────────────────
//
// 🔴 이게 안 맞으면 **편집할수록 조명이 실제와 어긋난다.** 새로고침해야 제대로 보이는
//    최악의 종류다(C-2와 같은 계열 — "증분 == 전량"이 유일한 안전장치다).
{
  const w = new BrickWorld();
  for (let x = 0; x < 24; x += 2) for (let z = 0; z < 24; z += 2)
    w.placeFast('terrain', x, -3, z, 0, '#fff', 'opaque');
  w.refreshPending();
  w.recomputeLight();

  const originY = Math.floor((0 - -64) / REGION_Y) * REGION_Y + -64;
  const full = new RegionLightVolume(0, originY, 0);
  const inc = new RegionLightVolume(0, originY, 0);
  const ids0 = [...w.visible];
  full.bake(w, ids0);
  inc.bake(w, ids0);

  // 브릭 몇 개를 놓으면서, 한쪽은 **둘레만** 다시 굽고 다른 쪽은 **전량** 다시 굽는다
  let incCorners = 0, incMs = 0, placed = 0;
  for (const [x, y, z] of [[4, 0, 4], [4, 3, 4], [6, 0, 4], [4, 0, 6], [10, 0, 10]] as const) {
    const id = w.place('b2x2', x, y, z, 0, '#fff', 'opaque');
    if (id === null) continue;
    w.recomputeLight();
    // ★ **굽는 시간만** 잰다 — 빛 BFS(전역)는 별개 비용이고 이미 디바운스된 경로다
    const t = performance.now();
    incCorners += inc.bakeAround(w, w.bricks.get(id)!);
    incMs += performance.now() - t;
    placed++;
  }
  full.bake(w, [...w.visible]);

  // ⚠️ 하늘빛 BFS는 전역이라 먼 곳 값도 바뀔 수 있다 → **브릭 둘레**만 비교한다.
  //    (전역 변화는 `recomputeLight` 뒤 전량 굽기가 맡는다 — 계획서 §18 2단계-c)
  let same = 0, checked = 0, worst = 0;
  for (let lz = 2; lz <= 14; lz++) for (let ly = 0; ly <= 8; ly++) for (let lx = 2; lx <= 14; lx++) {
    const a = full.read(lx, ly, lz), b = inc.read(lx, ly, lz);
    checked++;
    const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    worst = Math.max(worst, d);
    if (d < 1e-9) same++;
  }
  ok(checked > 500, `충분히 확인했다 — ${checked}개 꼭짓점`);
  ok(same === checked,
    `★★★ 둘레만 다시 구운 결과 == 전량 다시 구운 결과 — ${same}/${checked} · 최대 차이 ${worst.toFixed(4)}`);

  // ★★★ **경계 꼭짓점을 빠뜨리지 않았는가** — 이 항목의 진짜 실수는 여기다.
  //
  // ⚠️ 위의 "증분 == 전량" 비교만으로는 **못 잡는다**(사보타주로 확인: 범위를 양끝 미포함으로
  //    줄여도 통과했다). 넓은 상자를 뭉뚱그려 비교하면 몇 개 틀려도 묻히기 때문이다.
  //    → **브릭의 마지막 모서리**를 콕 집어 본다. 거기 여덟 칸에는 브릭의 마지막 칸이 들어 있어서
  //      빠뜨리면 그 모서리 그늘이 **옛 값으로 남는다**.
  {
    const w2 = new BrickWorld();
    for (let x = 0; x < 24; x += 2) for (let z = 0; z < 24; z += 2)
      w2.placeFast('terrain', x, -3, z, 0, '#fff', 'opaque');
    w2.refreshPending(); w2.recomputeLight();
    const v2 = new RegionLightVolume(0, originY, 0);
    v2.bake(w2, [...w2.visible]);

    const id = w2.place('b2x2', 8, 0, 8, 0, '#fff', 'opaque')!;
    w2.recomputeLight();
    const nb = w2.bricks.get(id)!;
    const e2 = w2.extentOfBrick(nb);
    v2.bakeAround(w2, nb);

    const pair2 = new Float32Array(2);
    let edgeOK = 0, edgeTotal = 0, changed = 0;
    // 브릭이 차지한 칸의 **모든** 모서리 — 양끝 포함
    for (let k = 0; k <= e2.ez; k++) for (let j = 0; j <= e2.ey; j++) for (let i = 0; i <= e2.ex; i++) {
      const lx = nb.x + i, ly = nb.y - originY + j, lz = nb.z + k;
      w2.cornerValueAt(nb.x + i, nb.y + j, nb.z + k, pair2);
      const got = v2.read(lx, ly, lz);
      edgeTotal++;
      if (Math.abs(got[0] - pair2[0]) <= 1 / 255 + 1e-9 && Math.abs(got[1] - pair2[1]) <= 1 / 255 + 1e-9) edgeOK++;
      if (pair2[1] < 0.999) changed++; // 이 꼭짓점은 브릭 때문에 그늘이 생긴 자리다
    }
    ok(changed > 0, `전제: 브릭이 실제로 그늘을 만든다(테스트가 헛돌지 않는다) — ${changed}개`);
    ok(edgeOK === edgeTotal,
      `★★★ 브릭이 차지한 칸의 **모든 모서리**가 갱신된다(양끝 포함) — ${edgeOK}/${edgeTotal}`);
  }

  // ★★ 그리고 **훨씬 싸야** 의미가 있다.
  //   ⚠️ 총량이 아니라 **브릭 하나당**으로 비교한다 — 편집 한 번의 비용이 그것이기 때문이고,
  //     테스트 씬은 실제 리전보다 작아서 총량으로 재면 비율이 왜곡된다.
  const perBrick = incCorners / placed;
  ok(perBrick < full.stats.corners / 10,
    `★★ 브릭 하나를 놓을 때 다시 굽는 양이 전량보다 훨씬 적다 — ${perBrick}개 vs 전량 ${full.stats.corners}개`);
  ok(incMs / placed < 5,
    `★★ 브릭 하나당 굽는 시간이 조작감을 안 해친다 — ${(incMs / placed).toFixed(2)}ms`);
  console.log(`  · 증분: 브릭 하나당 꼭짓점 ${perBrick}개 · ${(incMs / placed).toFixed(2)}ms`);
}

console.log(`\n브릭 조명 볼륨(칸 단위) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
