// 배경(Environment)의 **순수 계산** — 기준: doc/BRICK_PLAN.md §16
//
// ★ 왜 lib에 따로 두나: 하늘 그라데이션·산 능선·구름 무늬는 전부 **숫자에서 나오는 그림**이라
//   순수 함수로 자를 수 있고, 그러면 테스트가 된다. R3F·three가 필요한 배선만 컴포넌트에 남긴다
//   (`components/brick/BrickBackdrop.tsx`). 무늬 아틀라스(`textures.ts`)와 같은 구조다.
//
// ★★ 배경은 **저장되지 않는다.** 사용자는 Scene(브릭)만 편집·저장하고 배경은 에디터가 항상 그린다.
//    그래서 여기 숫자를 바꿔도 **지어 둔 월드는 하나도 안 바뀐다.**

// ── 거리·높이 (m) ────────────────────────────────────────────────────────
//
// ★ 참고 구조도의 수치를 그대로 쓴다. 배경은 브릭이 아니라 그냥 메시라서
//   격자 상한(Y_MAX = 89m)을 안 받는다 — 400m 산도 문제없다.

/** 안개 시작·끝. **끝이 산보다 멀어야** 산이 실루엣으로 남는다(같으면 통째로 하늘색이 된다) */
export const FOG_NEAR = 180;
/** ★ 산을 또렷하게 하려고 늘렸다(1900 → 2300) — 멀수록 산이 덜 잠긴다 */
export const FOG_FAR = 2300;

/**
 * 산 링의 반지름·최대 높이.
 *
 * ⚠️ **거리와 높이는 한 쌍이다 — 화면에서 차지하는 각도로 정해야 한다.**
 *   처음엔 참고 수치를 그대로 650m / 380m로 넣었다가 **산이 하늘을 통째로 덮었다.**
 *   `atan(380/650) = 30°`인데 카메라 시야각이 ±25°라, 지평선부터 화면 위까지 산이 가득 찼다.
 *   지금은 `atan(280/950) ≈ 16°` — 산 위로 하늘이 넉넉히 남는다.
 *   (참고 그림이 틀린 게 아니라, 그쪽은 카메라가 더 높고 멀리 있었다)
 */
export const MOUNTAIN_R = 820;
export const MOUNTAIN_H = 285;

/**
 * 산을 **여러 겹**으로 둘러 세운다 — 한 겹이면 벽처럼 보이고 거리감이 없다.
 *
 * ★ 가까운 겹일수록 **덜 잠기고 진하게** 보이므로(안개가 거리로 계산된다) 자연스럽게 원근이 생긴다.
 * ★ 겹마다 능선 위상(`phase`)을 다르게 줘서 봉우리가 겹쳐 보이게 한다 — 같으면 세 겹이 포개져 한 겹이 된다.
 *
 * ⚠️ **각 겹의 `atan(h / r)`이 시야각(±25°)보다 작아야** 하늘이 남는다 → 함정 D-7.
 */
export const MOUNTAIN_RINGS: readonly { r: number; h: number; phase: number }[] = [
  { r: 620, h: 205, phase: 0 },      // atan ≈ 18.3°
  { r: 820, h: 285, phase: 0.37 },   // atan ≈ 19.2°
  { r: 1080, h: 330, phase: 0.71 },  // atan ≈ 17.0°
];

/**
 * 능선을 **계단으로 끊는 단계 수** — 마인크래프트처럼 각지게 보이게 한다.
 *
 * ★ 매끄러운 곡선이면 브릭 월드와 안 어울린다(사용자 요청). 높이를 이 단계로 반올림하고
 *   **한 구간 안에서는 높이를 고정**해서(보간 없음) 실루엣이 계단 모양이 된다.
 */
export const MOUNTAIN_LEVELS = 9;
/** 능선을 나누는 구간 수. 적을수록 계단이 넓고 큼직하다 */
export const MOUNTAIN_SEGMENTS = 84;

/**
 * 카메라 far — **산보다 멀어야** 산이 잘려 나가지 않는다.
 * three 기본값은 2000이라 안개 끝(1900)과 아슬아슬하다.
 */
export const CAMERA_FAR = 3000;

/** 구름 판의 높이. 지을 수 있는 한계(89m)보다 한참 위라 브릭과 겹칠 일이 없다 */
export const CLOUD_Y = 210;
/**
 * 구름 무늬 한 장이 덮는 월드 크기(m) — 판을 옮길 때 이 배수로 끊어야 무늬가 안 미끄러진다.
 *
 * ★ **구름 한 덩이의 크기를 정하는 값이다**(칸 하나 = `CLOUD_TILE / CLOUD_CELLS` m).
 *   420m일 땐 칸이 13m라 하늘에서 자잘해 보였다 → 720m(칸 22.5m)로 키웠다.
 */
export const CLOUD_TILE = 720;

/**
 * 먼 땅의 높이 — 지형 윗면(월드 y=0)보다 **아주 살짝 아래**.
 *
 * ★ 같은 높이에 두면 진짜 지형과 z-파이팅으로 얼룩진다. 아래로 내리면 진짜 지형이 항상 이긴다.
 */
export const FAR_GROUND_Y = -0.02;

/**
 * ★★ 먼 땅은 **판이 아니라 고리(도넛)** 다 — 가운데가 뚫려 있어야 한다.
 *
 * 🔴 **실제로 터진 버그(2026-08-04, 사용자 보고: "바닥을 파면 녹색면이 보인다")**:
 *   처음엔 통짜 판으로 깔았다. 그런데 판이 **지면 높이**에 있으니, 구덩이를 파고 내려다보면
 *   구멍 바닥(예: −4.8m)보다 판(−0.02m)이 **위에 있어서** 먼저 그려진다 → **구멍이 초록으로 메워져 보인다.**
 *   땅이 안 파인 것처럼 보이지만 데이터는 멀쩡했다. **배경이 앞을 가린 것**이다.
 *
 * → 진짜 지형이 깔리는 범위만큼 **가운데를 비운다.**
 *   이 값은 **스트리밍 반경(`LOAD_R`)보다 작아야** 한다 — 크면 진짜 지형과 먼 땅 사이에 **빈 틈**이 생겨
 *   그리로 하늘이 비친다. 작으면 겹칠 뿐이고, 겹치는 자리는 진짜 지형이 위라서 안 보인다.
 *   (테스트가 `LOAD_R`과의 관계를 잠근다)
 */
export const FAR_GROUND_INNER = 44;

// ── 색 ───────────────────────────────────────────────────────────────────

/**
 * 하늘 색 — 위(천정)에서 아래(지평선)로.
 *
 * ⚠️ **지평선 색 = 안개 색이어야 한다.** 다르면 먼 지형이 잠기는 자리에 **하드컷**이 생긴다
 *   (이건 원래부터 지켜 오던 규칙이다 — `BrickEnvironment.tsx`).
 */
export const SKY_ZENITH = '#3f7fc4';
export const SKY_HORIZON = '#a6bccf';

/**
 * 먼 땅 판의 색 — **진짜 지형(잔디)의 평균색**에 맞춘다.
 *
 * ★ 이 값이 어긋나면 진짜 브릭이 끝나는 자리에 **색 경계선**이 보인다.
 *   잔디 무늬 팔레트(`textures.ts`의 `grass`)의 평균이 대략 rgb(100,148,62)다.
 */
export const FAR_GROUND_COLOR = '#66963f';

/**
 * 산 색 — **짙은 숲 초록** (사용자 요청).
 *
 * ★ 처음엔 아래 풀 → 중턱 바위(회색) → 꼭대기 눈(흰색)으로 했는데 **회색 산**으로 보였다.
 *   지금은 위로 갈수록 아주 조금만 밝아지는 초록이다 — 능선이 읽히되 색은 초록으로 유지된다.
 * ⚠️ **너무 밝게 하지 말 것.** 안개가 하늘색을 섞으므로, 원래 색이 밝으면 멀리서 회백색으로 뜬다.
 */
const MOUNTAIN_LOW = [0x24, 0x40, 0x27];
const MOUNTAIN_MID = [0x2f, 0x53, 0x31];
const MOUNTAIN_HIGH = [0x3e, 0x68, 0x3d];

const hex = (r: number, g: number, b: number) =>
  `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;

const mix = (a: number[], b: number[], t: number): number[] =>
  [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);

const toRgb = (c: string): number[] =>
  [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/**
 * 0(아래) ~ 1(위) 위치의 하늘색.
 *
 * ⚠️ **색은 반드시 위 상수에서 읽는다.** 한때 여기에 같은 값을 손으로 또 적어 뒀는데,
 *   그러면 `SKY_ZENITH`를 고쳐도 **화면은 그대로**다(상수는 이름만 있고 아무도 안 쓰는 셈).
 *   테스트가 양 끝을 상수와 대조해 이걸 막는다.
 */
export function skyColorAt(t: number): string {
  const k = Math.min(1, Math.max(0, t));
  // 지평선 근처가 넓게 밝아야 자연스럽다 — 선형이면 띠처럼 보인다
  const c = mix(toRgb(SKY_HORIZON), toRgb(SKY_ZENITH), k * k);
  return hex(c[0], c[1], c[2]);
}

/**
 * 산 능선 — 둘레 위치 `u`(0~1, **순환**)에서의 높이 비율 0~1.
 *
 * ★ **사인만 쓴다.** `u=0`과 `u=1`이 자동으로 이어져야 링에 **이음매(절벽)** 가 안 생긴다.
 *   난수를 쓰면 그 지점에서 끊긴다 — 원형 지형에서 흔히 밟는 함정이다.
 * ★★ **`1 - abs(sin)`이다 — `abs(sin)`이 아니다.**
 *   `abs(sin)`은 **꼭대기가 둥글고 골이 뾰족**하다. 그대로 쓰면 산이 아니라 **완만한 언덕**으로 보인다
 *   (화면에서 확인했다). 실제 산은 반대다 — 봉우리가 뾰족하고 골은 넓다. 뒤집으면 그 모양이 나온다.
 */
export function ridgeAt(u: number, phase = 0): number {
  const p = u + phase;
  const r = (f: number, ph: number) => 1 - Math.abs(Math.sin(Math.PI * (p * f + ph)));
  return 0.28 + 0.42 * r(5, 0.17) + 0.20 * r(11, 0.53) + 0.10 * r(23, 0.31);
}

/**
 * **계단으로 끊은** 능선 높이 비율 — 구간 번호로 받는다.
 *
 * ★ 구간 **번호**로 받는 이유: 한 구간 안에서는 높이가 **딱 하나**여야 계단이 생긴다.
 *   각도로 받아 매끄럽게 보간하면 다시 둥근 언덕이 된다.
 */
export function ridgeStep(segment: number, phase = 0, segments = MOUNTAIN_SEGMENTS): number {
  const u = ((segment % segments) + segments) % segments / segments;
  return Math.round(ridgeAt(u, phase) * MOUNTAIN_LEVELS) / MOUNTAIN_LEVELS;
}

/** 산 높이(m) */
export const mountainHeightAt = (u: number): number => ridgeAt(u) * MOUNTAIN_H;

/** 산 표면 색 — 높이 비율 `h`(0~1). 아래가 가장 짙고 위로 갈수록 살짝 밝아진다 */
export function mountainColorAt(h: number): string {
  const k = Math.min(1, Math.max(0, h));
  const c = k < 0.5
    ? mix(MOUNTAIN_LOW, MOUNTAIN_MID, k / 0.5)
    : mix(MOUNTAIN_MID, MOUNTAIN_HIGH, (k - 0.5) / 0.5);
  return hex(c[0], c[1], c[2]);
}

/**
 * 방향에 따른 명암 배율 — **가짜 빛**이다.
 *
 * ★ 왜 필요한가: 씬에는 **환경광 하나뿐**이라(방향광을 일부러 안 쓴다) 산 메시에 아무 음영이 안 진다.
 *   그러면 능선이 안 읽히고 초록 덩어리로 보인다. 브릭이 `FACE_TONE`으로 입체감을 내는 것과 같은 수법으로,
 *   **정점 색에 미리 구워** 넣는다. 실시간 빛이 아니므로 카메라를 돌려도 안 번쩍인다(D-1 준수).
 */
export function mountainTone(angle: number): number {
  const LIGHT = Math.PI * 0.25; // 빛이 오는 방향(고정)
  return 0.72 + 0.28 * (0.5 + 0.5 * Math.cos(angle - LIGHT));
}

/**
 * 구름 무늬의 논리 격자 한 변(칸). 이 칸 하나가 하늘에서 **각진 구름 한 덩이**가 된다.
 * `CLOUD_TILE / CLOUD_CELLS` = 칸 하나의 실제 크기(m).
 */
export const CLOUD_CELLS = 32;

/**
 * 구름 무늬의 **알파 격자**(0 또는 255). `size × size`.
 *
 * ★★ **마인크래프트처럼 각지게** 만든다(사용자 요청). 처음엔 거리 기반으로 부드럽게 깎았는데
 *   **뭉게구름이 아니라 옅은 얼룩**처럼 보였다. 마크 구름은 실제로 **칸 단위의 납작한 덩어리**라,
 *   여기서도 **논리 격자에 0/1로 찍고 그대로 확대**한다(텍스처는 `NearestFilter`).
 *   → 값이 0 아니면 255뿐이고, 한 칸 안은 전부 같은 값이다. 테스트가 이 둘을 잠근다.
 *
 * ★ **큰 덩어리와 작은 덩어리를 섞는다** — 다 같은 크기면 규칙적인 점무늬로 보인다.
 *   큰 것에는 곁가지를 붙여 반듯한 직사각형을 깬다.
 *
 * ★ 채울 때 **나머지 연산(`% G`)으로 감싼다** — 판을 타일링하므로 덩어리가 가장자리에서
 *   잘리면 하늘에 **격자 줄**이 보인다. 감싸면 잘리는 덩어리가 없다.
 */
export function buildCloudAlpha(size: number, blobs = 14): Uint8Array {
  const G = CLOUD_CELLS;
  const grid = new Uint8Array(G * G);
  // 결정적 난수 — 세션마다 구름이 달라지면 스크린샷 비교가 안 된다(textures.ts와 같은 이유)
  let s = 20260804 >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const fill = (cx: number, cy: number, w: number, h: number) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        grid[((cy + y) % G + G) % G * G + (((cx + x) % G) + G) % G] = 1;
  };

  for (let i = 0; i < blobs; i++) {
    const cx = Math.floor(rnd() * G), cy = Math.floor(rnd() * G);
    // 셋 중 하나는 큼직하게 — 크기가 섞여야 하늘이 단조롭지 않다
    const big = rnd() < 0.4;
    const w = big ? 5 + Math.floor(rnd() * 7) : 1 + Math.floor(rnd() * 3);
    const h = big ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2);
    fill(cx, cy, w, h);
    if (big) {
      // 곁가지 — 반듯한 직사각형이면 구름이 아니라 판자로 보인다
      fill(cx + Math.floor(rnd() * w), cy - 1, 1 + Math.floor(rnd() * 3), 1);
      fill(cx + Math.floor(rnd() * w), cy + h, 1 + Math.floor(rnd() * 4), 1);
    }
  }

  // 논리 격자 → 텍스처. **확대만 한다**(보간 없음) → 가장자리가 각진다
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = Math.floor((y * G) / size) * G;
    for (let x = 0; x < size; x++) {
      out[y * size + x] = grid[gy + Math.floor((x * G) / size)] ? 255 : 0;
    }
  }
  return out;
}
