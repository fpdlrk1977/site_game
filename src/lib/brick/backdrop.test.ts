// 실행: npx tsx src/lib/brick/backdrop.test.ts
//
// 배경(하늘·산·구름)의 **숫자**만 잠근다. 화면 배선은 `BrickBackdrop.tsx`.
//
// ★ 여기서 잡을 수 있는 것과 없는 것을 구분해 둔다:
//   잡히는 것 — 능선이 링에서 이어지는가 · 색이 제 범위인가 · 구름이 타일링되는가 · 안개가 산보다 먼가
//   못 잡는 것 — **실제로 예쁜가**. 그건 화면을 봐야 한다(T-2와 같은 계열).

import {
  CLOUD_CELLS, CLOUD_Y, FAR_GROUND_INNER, FOG_FAR, FOG_NEAR,
  MOUNTAIN_H, MOUNTAIN_LEVELS, MOUNTAIN_R, MOUNTAIN_RINGS, MOUNTAIN_SEGMENTS,
  SKY_HORIZON, SKY_ZENITH,
  buildCloudAlpha, mountainColorAt, mountainHeightAt, mountainTone, ridgeAt, ridgeStep, skyColorAt,
} from './backdrop';
import { Y_MAX, CELL_Y, CHUNK_X, CELL_X } from './grid';
import { LOAD_R } from '@/store/brickStore';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const rgb = (c: string): [number, number, number] =>
  [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

// ── ★★ 능선이 링에서 이어지는가 ──────────────────────────────────────────
//
// `u = 0`과 `u = 1`은 **같은 자리**다(원을 한 바퀴). 여기가 안 맞으면 산 링 한 곳에
// **절벽 같은 이음매**가 생긴다 — 눈에는 바로 띄지만 원인은 안 보인다.
// 난수를 섞는 순간 깨지므로(사인만 써야 한다) 명시적으로 잠근다.
{
  ok(Math.abs(ridgeAt(0) - ridgeAt(1)) < 1e-9,
    `★★ 능선이 한 바퀴 돌아 이어진다 — u=0 ${ridgeAt(0).toFixed(6)} vs u=1 ${ridgeAt(1).toFixed(6)}`);

  // 이음매 근처가 **매끄럽게** 이어지는지 (값만 같고 급변하면 그것도 절벽이다)
  const step = 1 / 2000;
  const jumpAtSeam = Math.abs(ridgeAt(1 - step) - ridgeAt(step));
  let maxJump = 0;
  for (let i = 0; i < 2000; i++) {
    maxJump = Math.max(maxJump, Math.abs(ridgeAt((i + 1) * step) - ridgeAt(i * step)));
  }
  ok(jumpAtSeam <= maxJump * 1.5,
    `★ 이음매의 변화폭이 다른 곳과 비슷하다 — 이음매 ${jumpAtSeam.toFixed(5)} vs 최대 ${maxJump.toFixed(5)}`);
}

// ── 능선이 산답게 생겼나 ─────────────────────────────────────────────────
{
  let lo = Infinity, hi = -Infinity;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const v = ridgeAt(i / N);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  ok(lo > 0.2, `★ 가장 낮은 골도 어느 정도 높다(구멍이 안 뚫린다) — ${lo.toFixed(3)}`);
  ok(hi <= 1.0000001, `★ 높이 비율이 1을 안 넘는다 — ${hi.toFixed(3)}`);
  ok(hi - lo > 0.35, `★ 봉우리와 골의 차이가 뚜렷하다(평평한 벽이 아니다) — ${(hi - lo).toFixed(3)}`);

  // 봉우리가 여러 개여야 산맥으로 보인다 — 하나면 그냥 언덕이다
  let peaks = 0;
  for (let i = 1; i < N - 1; i++) {
    const a = ridgeAt((i - 1) / N), b = ridgeAt(i / N), c = ridgeAt((i + 1) / N);
    if (b > a && b > c && b > 0.6) peaks++;
  }
  ok(peaks >= 5, `★ 봉우리가 여럿이다 — ${peaks}개`);

  ok(Math.abs(mountainHeightAt(0) - ridgeAt(0) * MOUNTAIN_H) < 1e-9, '높이(m) = 비율 × 최대높이');
}

// ── ★ 배경이 브릭 세계와 안 겹치나 ───────────────────────────────────────
//
// 배경은 격자 상한을 안 받지만, **구름이 지을 수 있는 높이보다 낮으면** 탑을 쌓다가 구름을 뚫는다.
{
  const buildableTopM = Y_MAX * CELL_Y;
  ok(CLOUD_Y > buildableTopM,
    `★ 구름이 지을 수 있는 최고 높이보다 위에 있다 — 구름 ${CLOUD_Y}m vs 상한 ${buildableTopM.toFixed(1)}m`);
  ok(MOUNTAIN_H > CLOUD_Y * 0.5, `산이 구름과 견줄 만큼 높다 — 산 ${MOUNTAIN_H}m · 구름 ${CLOUD_Y}m`);
}

// ── ★★ 먼 땅 고리의 구멍이 **진짜 지형보다 작은가** ──────────────────────
//
// 🔴 실제로 터진 버그: 통짜 판이 **파낸 구덩이를 덮어** "바닥이 안 파인다"로 보였다.
//    고리로 바꿔 가운데를 비웠는데, 구멍이 **너무 크면** 이번엔 진짜 지형과의 사이에 틈이 생겨
//    그리로 하늘이 비친다. 스트리밍 반경보다 **작아야** 항상 겹친다.
{
  const terrainRadius = LOAD_R * CHUNK_X * CELL_X; // 진짜 지형이 보장되는 최소 반경(m)
  ok(FAR_GROUND_INNER < terrainRadius,
    `★★ 먼 땅 구멍(${FAR_GROUND_INNER}m)이 지형 반경(${terrainRadius}m)보다 작다 — 틈이 안 생긴다`);
  ok(FAR_GROUND_INNER > 20,
    `★ 구멍이 너무 작지도 않다(가까운 구덩이를 안 덮는다) — ${FAR_GROUND_INNER}m`);
}

// ── ★★ 안개와 산의 거리 관계 ─────────────────────────────────────────────
//
// 안개가 산보다 **앞에서 끝나면** 산이 통째로 하늘색이 되어 안 보인다.
// 반대로 안개 시작이 너무 가까우면 지어 놓은 브릭이 뿌옇게 된다.
{
  ok(FOG_FAR > MOUNTAIN_R,
    `★★ 안개가 산보다 멀리까지 간다(산이 실루엣으로 남는다) — 안개끝 ${FOG_FAR}m vs 산 ${MOUNTAIN_R}m`);
  ok(FOG_NEAR > 100,
    `★ 안개 시작이 충분히 멀다(짓는 자리가 안 뿌옇다) — ${FOG_NEAR}m`);

  // 산이 **적당히** 잠겨야 원근이 생긴다 — 0이면 딱딱하고, 1이면 안 보인다
  const t = (MOUNTAIN_R - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
  ok(t > 0.2 && t < 0.8, `★ 산이 적당히 안개에 잠긴다 — ${(t * 100).toFixed(0)}%`);
}

// ── 색 ───────────────────────────────────────────────────────────────────
{
  for (const t of [0, 0.25, 0.5, 0.75, 1]) ok(isHex(skyColorAt(t)), `하늘색이 유효한 색 (t=${t})`);
  ok(skyColorAt(0).toLowerCase() === SKY_HORIZON.toLowerCase(),
    `★★ 하늘 맨 아래 = 안개 색 (지평선에 하드컷이 안 생긴다) — ${skyColorAt(0)} vs ${SKY_HORIZON}`);
  // ★★ 그라데이션이 **상수를 실제로 쓰는가.** 한때 함수 안에 같은 색을 손으로 또 적어 뒀는데,
  //    그러면 `SKY_ZENITH`를 고쳐도 화면이 안 바뀐다(상수가 장식이 된다).
  ok(skyColorAt(1).toLowerCase() === SKY_ZENITH.toLowerCase(),
    `★★ 하늘 맨 위 = SKY_ZENITH 상수 (색을 두 군데 적어 두지 않았다) — ${skyColorAt(1)} vs ${SKY_ZENITH}`);

  const [zr, zg, zb] = rgb(skyColorAt(1));
  const [hr, hg, hb] = rgb(skyColorAt(0));
  ok(zb > zr && zb > zg, `★ 천정은 파랗다 — rgb(${zr},${zg},${zb})`);
  ok(zr + zg + zb < hr + hg + hb, '★ 천정이 지평선보다 짙다 (위로 갈수록 깊어진다)');

  for (const h of [0, 0.3, 0.6, 0.9, 1]) ok(isHex(mountainColorAt(h)), `산색이 유효한 색 (h=${h})`);

  // ★★ 산은 **어느 높이에서도 짙은 초록**이다(사용자 요청).
  //    한때 중턱=바위(회색)·꼭대기=눈(흰색)이었는데 화면에서 **회색 산**으로 보였다.
  for (const h of [0, 0.25, 0.5, 0.75, 1]) {
    const [r, g, b] = rgb(mountainColorAt(h));
    ok(g > r && g > b, `★★ h=${h}에서 초록이 가장 세다 — rgb(${r},${g},${b})`);
    ok(Math.max(r, g, b) < 140, `★ h=${h}가 짙다(안개에 뜨지 않는다) — 최대 채널 ${Math.max(r, g, b)}`);
  }
  // 위로 갈수록 조금은 밝아야 능선이 읽힌다
  const lowSum = rgb(mountainColorAt(0)).reduce((a, b) => a + b, 0);
  const highSum = rgb(mountainColorAt(1)).reduce((a, b) => a + b, 0);
  ok(highSum > lowSum, `★ 위가 아래보다 조금 밝다(능선이 읽힌다) — ${lowSum} → ${highSum}`);

  // 가짜 빛은 **깎기만** 한다(1을 넘으면 색이 잘린다 — 톤매핑이 Linear다)
  let toneMin = Infinity, toneMax = -Infinity;
  for (let i = 0; i < 720; i++) {
    const t = mountainTone((i / 720) * Math.PI * 2);
    toneMin = Math.min(toneMin, t); toneMax = Math.max(toneMax, t);
  }
  ok(toneMax <= 1.0000001, `★ 명암 배율이 1을 안 넘는다(색이 안 잘린다) — 최대 ${toneMax.toFixed(3)}`);
  ok(toneMin > 0.5, `★ 그늘진 쪽도 새까맣지 않다 — 최소 ${toneMin.toFixed(3)}`);
  ok(toneMax - toneMin > 0.2, `★ 명암 차이가 능선을 읽히게 한다 — ${(toneMax - toneMin).toFixed(3)}`);
}

// ── ★ 구름 무늬 — **각지고**, 크기가 섞여 있어야 한다 ────────────────────
{
  const S = 128;
  const a = buildCloudAlpha(S);
  ok(a.length === S * S, `구름 격자 크기 ${S}×${S}`);

  const solid = [...a].filter((v) => v > 200).length / a.length;
  const empty = [...a].filter((v) => v < 20).length / a.length;
  ok(solid > 0.02, `★ 구름이 실제로 그려진다(빈 하늘이 아니다) — 덮인 부분 ${(solid * 100).toFixed(1)}%`);
  ok(empty > 0.3, `★ 하늘이 충분히 트여 있다(통째로 덮이지 않는다) — 빈 곳 ${(empty * 100).toFixed(1)}%`);

  // ★★ **마인크래프트처럼 각진가** — 값이 0/255뿐이고, 논리 칸 안은 전부 같아야 한다.
  //    부드럽게 깎으면(예전 방식) 여기서 걸린다.
  ok([...a].every((v) => v === 0 || v === 255), '★★ 알파가 0 아니면 255뿐이다 (부드러운 경계 없음)');
  const px = S / CLOUD_CELLS;
  let uniform = true;
  for (let cy = 0; cy < CLOUD_CELLS && uniform; cy++) {
    for (let cx = 0; cx < CLOUD_CELLS; cx++) {
      const v = a[cy * px * S + cx * px];
      for (let y = 0; y < px && uniform; y++)
        for (let x = 0; x < px; x++)
          if (a[(cy * px + y) * S + cx * px + x] !== v) { uniform = false; break; }
    }
  }
  ok(uniform, `★★ 칸 하나(${px}×${px}px) 안은 전부 같은 값이다 (네모 구름)`);

  // ★ **크고 작은 덩어리가 섞여 있는가** — 다 같으면 규칙적인 점무늬로 보인다
  const runs: number[] = [];
  for (let cy = 0; cy < CLOUD_CELLS; cy++) {
    let run = 0;
    for (let cx = 0; cx < CLOUD_CELLS; cx++) {
      if (a[cy * px * S + cx * px] > 128) run++;
      else { if (run) runs.push(run); run = 0; }
    }
    if (run) runs.push(run);
  }
  ok(runs.some((r) => r <= 2) && runs.some((r) => r >= 5),
    `★ 작은 덩어리와 큰 덩어리가 섞여 있다 — 최소 ${Math.min(...runs)}칸 · 최대 ${Math.max(...runs)}칸`);

  // ★ 가장자리에서 덩어리가 **잘리지 않았는가**(타일링하므로 잘리면 하늘에 줄이 보인다).
  //   감싸서 채우면 양쪽 끝 열의 덮인 비율이 전체 평균과 비슷하다.
  const colCover = (cx: number) => {
    let n = 0;
    for (let cy = 0; cy < CLOUD_CELLS; cy++) if (a[cy * px * S + cx * px] > 128) n++;
    return n / CLOUD_CELLS;
  };
  const mean = solid;
  ok(Math.abs(colCover(0) - mean) < 0.35 && Math.abs(colCover(CLOUD_CELLS - 1) - mean) < 0.35,
    `★ 양 끝 열도 다른 곳만큼 덮여 있다(덩어리가 안 잘렸다) — ${colCover(0).toFixed(2)} / ${colCover(CLOUD_CELLS - 1).toFixed(2)} vs 평균 ${mean.toFixed(2)}`);

  // 결정적이어야 한다 — 세션마다 하늘이 달라지면 스크린샷 비교가 안 된다
  ok(buildCloudAlpha(S).join() === a.join(), '같은 구름은 항상 같다 (결정적 난수)');
}

// ── ★ 산이 여러 겹인가 · 계단으로 각진가 ─────────────────────────────────
{
  ok(MOUNTAIN_RINGS.length >= 3, `★ 산이 여러 겹이다(거리감) — ${MOUNTAIN_RINGS.length}겹`);

  // 겹마다 거리가 달라야 앞뒤로 겹쳐 보인다
  const radii = MOUNTAIN_RINGS.map((m) => m.r);
  ok(new Set(radii).size === radii.length, '겹마다 거리가 다르다');
  ok(new Set(MOUNTAIN_RINGS.map((m) => m.phase)).size === MOUNTAIN_RINGS.length,
    '★ 겹마다 능선 위상이 다르다 (같으면 세 겹이 포개져 한 겹으로 보인다)');

  for (const m of MOUNTAIN_RINGS) {
    // ★★ 각 겹이 하늘을 안 덮는가 — 함정 D-7에서 실제로 터진 것
    const deg = (Math.atan(m.h / m.r) * 180) / Math.PI;
    ok(deg < 24, `★★ ${m.r}m 겹이 하늘을 안 덮는다 — ${deg.toFixed(1)}°`);
    // 안개 안에 들어 있는가
    ok(m.r < FOG_FAR, `${m.r}m 겹이 안개 끝(${FOG_FAR}m) 안에 있다`);
  }

  // ★★ 능선이 **계단으로 끊기는가** — 값이 정해진 단계 중 하나여야 한다
  let stepped = 0;
  const levels = new Set<number>();
  for (let i = 0; i < MOUNTAIN_SEGMENTS; i++) {
    const v = ridgeStep(i);
    levels.add(v);
    if (Math.abs(v * MOUNTAIN_LEVELS - Math.round(v * MOUNTAIN_LEVELS)) < 1e-9) stepped++;
  }
  ok(stepped === MOUNTAIN_SEGMENTS, `★★ 능선 높이가 전부 정해진 단계 위에 있다(각진다) — ${stepped}/${MOUNTAIN_SEGMENTS}`);
  ok(levels.size >= 4, `★ 단계가 여러 가지다(평평한 벽이 아니다) — ${levels.size}가지`);

  // 구간 번호로 감싸지는가 (링이 이어져야 한다)
  ok(ridgeStep(0) === ridgeStep(MOUNTAIN_SEGMENTS), '★ 계단 능선도 한 바퀴 돌아 이어진다');
}

console.log(`\n브릭 배경(하늘·산·구름) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
