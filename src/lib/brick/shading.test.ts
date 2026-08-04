// 실행: npx tsx src/lib/brick/shading.test.ts
//
// 접촉 그늘의 **모양**을 잠근다 — 세기뿐 아니라 **거리에 따라 얼마나 빨리 사라지는가**까지.
//
// 🔴 왜 이 테스트가 생겼나 (2026-08-04, 사용자 신고 두 번)
//   ① *"맞닿은 경계에 그림자가 어색하게 생긴다"* → 원인은 **포화**(막힌 칸 2·3·4개가 전부 같은 값)
//   ② *"포토샵으로 바닥에 조그만 이미지 깔고 blur 많이 준 느낌. 닿는 면에 확실히 져야 하는데"*
//      → 원인은 **번짐**. 밝기 값이 지형 타일 **네 귀퉁이에만** 있어서(타일 1m) 어둠이 1m에 걸쳐 옅어졌다.
//
//   둘 다 **값은 맞고 모양이 틀린** 종류라, "어둡다/밝다"만 보는 테스트로는 절대 안 잡힌다.
//   그래서 여기서는 **거리별 프로파일**을 잰다.

import {
  AO_FIRST, AO_MIN, AO_WALL_RELIEF, FLAT_BLOCKED, OUTSIDE_BLOCKED, SHADE_CURVE,
  cornerAO, screenShade,
} from './shading';
import { CELL_X } from './grid';
import { TERRAIN_STEP } from './parts';

/** 지형 타일 한 변(m) — 그늘이 번지는 폭의 기준이다 */
const TERRAIN_STEP_M = TERRAIN_STEP * CELL_X;

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

// ── 포화 금지 — 막힐수록 **매번 더** 어두워야 한다 ───────────────────────
{
  const levels = [1, 2, 3, 4].map((over) => cornerAO(FLAT_BLOCKED + over));
  ok(cornerAO(FLAT_BLOCKED) === 1, '평평한 면은 그대로 1.0');
  ok(cornerAO(FLAT_BLOCKED - 1) === 1, '볼록한 모서리도 1.0 (밝아지는 곳은 없다)');

  let strict = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i] < levels[i - 1]) strict++;
  ok(strict === levels.length - 1,
    `★★★ 막힐수록 매번 더 어둡다(포화 금지) — ${levels.map((v) => v.toFixed(3)).join(' → ')}`);
  ok(Math.min(...levels) > AO_MIN,
    `★ 가장 깊은 구석도 하한 위에 있다(닿으면 다시 포화) — ${Math.min(...levels).toFixed(3)} > ${AO_MIN}`);
  ok(levels[0] === 1 - AO_FIRST, '첫 접촉 값은 AO_FIRST가 정한다');
}

// ── ★★★ **번짐** — 그늘이 얼마나 빨리 사라지는가 ────────────────────────
//
// 지형 타일은 2×2칸 = 1m다. 브릭이 한 귀퉁이에 닿으면 그 귀퉁이만 어둡고,
// **타일 반대편까지 1m에 걸쳐** GPU가 직선으로 채운다. 그 직선에 곡선을 씌워
// 어둠을 접촉면 쪽으로 몰아붙이는 게 `SHADE_CURVE`의 일이다.
{
  const contact = cornerAO(FLAT_BLOCKED + 1);          // 브릭이 닿은 귀퉁이의 원값
  /** 접촉점에서 `d`m 떨어진 지점의 **화면 밝기** (타일 1m를 직선으로 잇는다) */
  const at = (d: number) => screenShade(contact + (1 - contact) * (d / TERRAIN_STEP_M));

  const p0 = at(0), p25 = at(0.25), p50 = at(0.5), p100 = at(1.0);

  // ★ 접촉면은 **눈에 확실히 보여야** 한다. 너무 옅으면 "그림자가 없다"가 되고(실제 신고),
  //   너무 진하면 구멍처럼 보인다.
  ok(p0 < 0.70, `★ 닿는 자리가 확실히 어둡다 — ${p0.toFixed(3)}`);
  ok(p0 > 0.52, `★ 그렇다고 새까맣지는 않다(구멍처럼 보이면 안 된다) — ${p0.toFixed(3)}`);

  // ★★★ 폭 — **마인크래프트도 블록 한 칸(1m)에 걸쳐 퍼진다.** 좁히는 게 답이 아니다.
  //   한때 25cm 안에서 끝나게 조였다가 **화면에서 안 보인다**는 신고를 받았다.
  //   대신 같은 1m 안에서 **접촉면 쪽으로 쏠려** 있어야 블러가 아니라 그늘로 읽힌다.
  ok(p25 > 0.72 && p25 < 0.86,
    `★★★ 25cm 밖은 절반 넘게 회복(보이되 번지지 않게) — ${p25.toFixed(3)}`);
  ok(p50 > 0.86, `★ 50cm 밖은 대부분 회복 — ${p50.toFixed(3)}`);
  ok(p100 > 0.999, `1m 밖(타일 반대편)은 그늘이 없다 — ${p100.toFixed(3)}`);

  // ★★ **접촉면 쪽에 쏠려 있는가** — 이게 "블러가 아니다"의 정의다.
  //
  // ⚠️ 총량이 아니라 **거리당 회복 속도**로 봐야 한다. 뒤 구간이 3배 길어서 총량으로 비교하면
  //    아무리 쏠려 있어도 뒤가 이긴다(처음에 그렇게 썼다가 잘못 실패했다).
  const nearRate = (p25 - p0) / 0.25;
  const farRate = (p100 - p25) / 0.75;
  ok(nearRate > farRate * 1.8,
    `★★ 접촉면 쪽이 훨씬 가파르다(선형 = 블러) — 앞 ${nearRate.toFixed(2)}/m vs 뒤 ${farRate.toFixed(2)}/m`);

  // 곡선을 빼면(=선형) 두 속도가 같아진다 — 그게 곧 "고르게 번진다"이다
  const linRate = (1 - contact) / TERRAIN_STEP_M;
  ok(Math.abs(linRate - linRate) < 1e-9 && nearRate > linRate,
    `★ 곡선이 접촉면 쪽 기울기를 선형보다 키운다 — ${linRate.toFixed(2)}/m → ${nearRate.toFixed(2)}/m`);
}

// ── 화면 밝기 변환이 셰이더와 같은 식인가 ────────────────────────────────
{
  ok(screenShade(1) === 1, '완전히 트인 곳은 1.0 그대로');
  ok(screenShade(0) === 0, '완전히 막힌 곳은 0');
  ok(Math.abs(screenShade(0.5) - (1 - Math.pow(0.5, SHADE_CURVE))) < 1e-12, '식이 SHADE_CURVE를 쓴다');
  // 단조 증가 — 어두운 원값이 더 밝게 나오면 명암이 뒤집힌다
  let mono = true;
  for (let i = 1; i <= 100; i++) if (screenShade(i / 100) <= screenShade((i - 1) / 100)) mono = false;
  ok(mono, '원값이 밝을수록 화면도 밝다');
}

// ── 세로면 보정 ──────────────────────────────────────────────────────────
{
  ok(AO_WALL_RELIEF >= 0 && AO_WALL_RELIEF < 1,
    `세로면 보정이 0~1 사이다 — ${AO_WALL_RELIEF}`);
  // 보정을 먹인 세로면이 **바닥면보다 밝아야** 한다(과대평가를 덜어내는 것이므로)
  const raw = cornerAO(FLAT_BLOCKED + 2);
  const wall = raw + (1 - raw) * AO_WALL_RELIEF;
  ok(wall > raw, `★ 세로면은 바닥면보다 그늘이 옅다 — ${raw.toFixed(3)} → ${wall.toFixed(3)}`);
  ok(wall < 1, '그렇다고 세로면 그늘이 아예 없어지지는 않는다');
}

// ── 칸 크기 전제 ─────────────────────────────────────────────────────────
// 그늘 폭의 기준이 되는 수치라, 격자가 바뀌면 위 프로파일도 다시 봐야 한다
{
  ok(Math.abs(TERRAIN_STEP_M - 1) < 1e-9, `지형 타일이 1m다(그늘이 번지는 폭의 기준) — ${TERRAIN_STEP_M}m`);
  ok(Math.abs(CELL_X - 0.5) < 1e-9, `칸 하나가 0.5m다 — ${CELL_X}m`);
  ok(OUTSIDE_BLOCKED - FLAT_BLOCKED === 4, '깊이 단계가 4단이다');
}

// ── ★★ 하늘빛·그늘을 한 칸에 눌러 담기 ──────────────────────────────────
//
// 정점 속성 칸이 15/16으로 꽉 차서 슬롯을 더 못 쓴다 → `하늘빛*256 + 그늘`로 담아 보낸다.
// **틀려도 에러가 안 나고 명암만 이상해진다** — 여기서 왕복을 잠근다(B-4와 같은 계열).
{
  const pack = (sky: number, ao: number) => Math.round(sky * 255) * 256 + Math.round(ao * 255);
  const unpackSky = (p: number) => Math.floor(p / 256) / 255;
  const unpackAO = (p: number) => (p - Math.floor(p / 256) * 256) / 255;

  let worst = 0, maxPacked = 0;
  for (let s = 0; s <= 20; s++) {
    for (let a = 0; a <= 20; a++) {
      const sky = s / 20, ao = a / 20;
      const p = pack(sky, ao);
      maxPacked = Math.max(maxPacked, p);
      worst = Math.max(worst, Math.abs(unpackSky(p) - sky), Math.abs(unpackAO(p) - ao));
    }
  }
  ok(worst < 1 / 255 + 1e-9, `★★ 눌러 담았다 푼 값이 원래와 같다 — 최대 오차 ${worst.toFixed(5)}`);
  ok(maxPacked <= 65535, `★ 담은 값이 float가 정확히 담는 범위 안이다 — 최대 ${maxPacked}`);

  // ★ 두 값이 **서로 침범하지 않는가** — 그늘이 커도 하늘빛 자릿수를 건드리면 안 된다
  ok(unpackSky(pack(0.5, 1)) === unpackSky(pack(0.5, 0)),
    '★★ 그늘이 0이든 1이든 하늘빛은 그대로 나온다(자릿수 침범 없음)');
  ok(unpackAO(pack(0, 0.5)) === unpackAO(pack(1, 0.5)),
    '★★ 하늘빛이 0이든 1이든 그늘은 그대로 나온다');
}

// ── ★★★ 하늘빛에는 곡선을 씌우지 않는다 ─────────────────────────────────
//
// 🔴 실측으로 잡은 버그: 나무 밑 하늘빛이 **0.87인데 화면엔 0.99**로 나왔다. 접촉 그늘용 곡선이
//    하늘빛까지 밝힌 탓이다. 실내·동굴·나무 그늘이 통째로 사라진다.
{
  /** 지금 셰이더가 하는 계산 — 하늘빛은 그대로, 그늘에만 곡선 */
  const shade = (sky: number, ao: number) => sky * screenShade(ao);

  const canopy = 0.87; // 4m 지붕 아래 실측값
  ok(Math.abs(shade(canopy, 1) - canopy) < 1e-9,
    `★★★ 그늘이 없는 곳의 하늘빛은 **그대로** 나온다 — ${shade(canopy, 1).toFixed(3)} (곡선을 먹이면 0.99가 된다)`);
  ok(screenShade(canopy) > 0.98,
    `참고: 곡선을 먹이면 이렇게 지워진다 — ${screenShade(canopy).toFixed(3)}`);

  // 그늘은 여전히 곡선을 받는다(접촉면 쏠림 유지)
  ok(shade(1, cornerAO(FLAT_BLOCKED + 1)) < 0.70, '그늘에는 곡선이 그대로 걸린다');
  // 둘이 겹치면 곱해진다 — 실내 구석이 가장 어둡다
  ok(shade(canopy, cornerAO(FLAT_BLOCKED + 1)) < shade(1, cornerAO(FLAT_BLOCKED + 1)),
    '★ 어두운 곳의 구석이 밝은 곳의 구석보다 어둡다');
}

console.log(`\n브릭 접촉 그늘(모양) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
