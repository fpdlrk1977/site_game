// 실행: npx tsx src/lib/brick/textures.test.ts
//
// 무늬가 **실제로 그려지는가** + **면마다 올바른 그림이 가는가**를 잠근다.
//
// ★ 왜 필요한가: 무늬가 화면에서 흰색으로 나온 적이 있다. 원인이 ①그림이 안 그려졌나
//   ②셰이더까지 안 갔나 둘 중 어느 쪽인지 눈으로는 구분이 안 됐다. 그림 데이터는
//   순수 함수라 여기서 잠글 수 있고, 그러면 다음엔 셰이더만 보면 된다.

import {
  ART_ORDER, ATLAS_CAPACITY, BRICK_TEXTURES, GRASS_BAND,
  artSlot, buildArt, faceSlots, type ArtId,
} from './textures';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const ART = 16;
/** 색 문자열 → rgb */
const rgb = (c: string): [number, number, number] =>
  [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// ── 그림 자체 ────────────────────────────────────────────────────────────
for (const art of ART_ORDER) {
  const px = buildArt(art);

  ok(px.length === ART * ART, `${art}: 16×16 = ${px.length}칸`);
  ok(px.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)),
    `${art}: 모든 칸이 유효한 색이다 (빈 칸이 있으면 캔버스가 이전 색으로 칠해진다)`);

  const uniq = new Set(px);
  if (art === 'plain') {
    ok(uniq.size === 1 && px[0] === '#ffffff', '민짜: 순수 흰색 한 가지 (= 색 그대로)');
  } else {
    // ★ 흰색만 나오면 화면에서 "무늬가 안 먹는" 것과 구분이 안 된다
    ok(!px.every((c) => c.toLowerCase() === '#ffffff'), `★ ${art}: 흰색이 아니다`);
    ok(uniq.size >= 3, `★ ${art}: 명암이 3단계 이상 — ${uniq.size}가지`);
  }
}

// ── 그림끼리 서로 달라야 한다 (복붙 실수 감시) ──────────────────────────
{
  const sig = ART_ORDER.map((a) => buildArt(a).join(''));
  ok(new Set(sig).size === ART_ORDER.length, `★ 그림 ${ART_ORDER.length}종이 전부 다르다 — ${new Set(sig).size}가지`);
}

// ── 결정적이어야 한다 (세션마다 무늬가 달라지면 안 된다) ─────────────────
{
  ok(buildArt('gravel').join('') === buildArt('gravel').join(''), '같은 그림은 항상 같다 (결정적 난수)');
}

// ── 재료다운 색인가 — 대표 색조를 확인 ───────────────────────────────────
{
  const avg = (art: ArtId) => {
    const a = buildArt(art);
    let r = 0, g = 0, b = 0;
    for (const c of a) { const [cr, cg, cb] = rgb(c); r += cr; g += cg; b += cb; }
    return [r / a.length, g / a.length, b / a.length];
  };
  const [gr, gg, gb] = avg('grass');
  ok(gg > gr && gg > gb, `★ 잔디는 초록이 가장 세다 — rgb(${gr.toFixed(0)},${gg.toFixed(0)},${gb.toFixed(0)})`);
  const [br, bg, bb] = avg('brick');
  ok(br > bg && br > bb, `★ 벽돌은 빨강이 가장 세다 — rgb(${br.toFixed(0)},${bg.toFixed(0)},${bb.toFixed(0)})`);
  const [sr, sg, sb] = avg('sand');
  ok(sr > sb && sg > sb, `★ 모래는 노랑빛(파랑이 가장 약하다) — rgb(${sr.toFixed(0)},${sg.toFixed(0)},${sb.toFixed(0)})`);
}

// ── ★ 아틀라스에 다 들어가는가 ───────────────────────────────────────────
// 넘치면 뒤쪽 그림이 조용히 안 구워지고 화면엔 흰 면으로 나온다(원인 찾기 어려움)
{
  ok(ART_ORDER.length <= ATLAS_CAPACITY,
    `★ 그림 ${ART_ORDER.length}종이 아틀라스 ${ATLAS_CAPACITY}칸에 들어간다`);
  ok(new Set(ART_ORDER).size === ART_ORDER.length, 'ART_ORDER에 중복이 없다 (있으면 한 칸을 두 번 덮어쓴다)');
  ok(ART_ORDER[0] === 'plain', "0번 칸은 민짜여야 한다 — 셰이더가 '0 = 무늬 없음'으로 쓴다");
}

// ── ★ 면별 무늬 매핑 ─────────────────────────────────────────────────────
{
  // 모든 재료의 칸 번호가 실재하는가 (-1 = ART_ORDER에 없는 이름 → 오타)
  for (const t of BRICK_TEXTURES) {
    const slots = faceSlots(t.id);
    ok(slots.every((s) => s >= 0 && s < ATLAS_CAPACITY),
      `${t.label}: 면 세 칸이 모두 유효 — [${slots.join(', ')}]`);
  }

  // 생략하면 물려받는다: side 없으면 top, bottom 없으면 side
  const dirt = faceSlots(2);
  ok(dirt[0] === dirt[1] && dirt[1] === dirt[2], `흙: 면을 안 나눈 재료는 세 면이 같다 — [${dirt.join(', ')}]`);

  // ★ 이번 작업의 핵심 — 잔디는 세 면이 다르다
  const [gTop, gSide, gBottom] = faceSlots(1);
  ok(gTop === artSlot('grass'), '잔디 윗면 = 잔디 그림');
  ok(gSide === artSlot('grass_side'), '★ 잔디 옆면 = 잔디옆면 그림 (땅을 파면 단면에 흙이 보인다)');
  ok(gBottom === artSlot('dirt'), '★ 잔디 밑면 = 흙 그림');
  ok(gTop !== gSide && gSide !== gBottom, '★ 잔디는 세 면이 서로 다르다');

  // 모르는 재료(저장물이 코드보다 앞선 경우)는 민짜로 떨어져야 한다 — 크래시 금지
  ok(faceSlots(999).every((s) => s === 0), '모르는 재료 id는 민짜로 폴백한다');
}

// ── ★ 잔디 옆면 그림의 위아래 ────────────────────────────────────────────
// `textures.ts` 규약: **그림의 y=0 줄이 면의 위쪽**. 셰이더가 v를 뒤집어 맞춘다.
// 이게 뒤집히면 화면에서 **풀이 브릭 밑동에 깔린다** — 눈에는 띄지만 원인은 안 보인다.
{
  const px = buildArt('grass_side');
  const greener = (c: string) => { const [r, g, b] = rgb(c); return g > r && g > b; };
  const rowGreen = (y: number) => {
    let n = 0;
    for (let x = 0; x < ART; x++) if (greener(px[y * ART + x])) n++;
    return n / ART;
  };

  ok(rowGreen(0) === 1, `★ 맨 윗줄은 전부 풀색 — ${(rowGreen(0) * 100).toFixed(0)}%`);
  ok(rowGreen(GRASS_BAND - 1) === 1, `★ 풀 띠는 최소 ${GRASS_BAND}줄 보장`);
  ok(rowGreen(ART - 1) === 0, `★ 맨 아랫줄은 풀색이 없다(흙) — ${(rowGreen(ART - 1) * 100).toFixed(0)}%`);

  // 경계가 들쭉날쭉해야 한다 — 일직선이면 스티커처럼 보인다
  const heights = new Set<number>();
  for (let x = 0; x < ART; x++) {
    let h = 0;
    while (h < ART && greener(px[h * ART + x])) h++;
    heights.add(h);
  }
  ok(heights.size >= 2, `★ 풀 띠 경계가 들쭉날쭉하다 — 높이 ${heights.size}가지`);

  // 흙 부분이 실제로 흙색인가 (윗면 잔디와 구분되어야 의미가 있다)
  const [dr, dg, db] = rgb(px[(ART - 1) * ART]);
  ok(dr > dg && dg > db, `★ 아래쪽은 갈색(흙) — rgb(${dr},${dg},${db})`);
}

console.log(`\n브릭 무늬(재료) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
