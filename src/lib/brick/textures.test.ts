// 실행: npx tsx src/lib/brick/textures.test.ts
//
// 무늬가 **실제로 그려지는가** + **면마다 올바른 그림이 가는가**를 잠근다.
//
// ★ 왜 필요한가: 무늬가 화면에서 흰색으로 나온 적이 있다. 원인이 ①그림이 안 그려졌나
//   ②셰이더까지 안 갔나 둘 중 어느 쪽인지 눈으로는 구분이 안 됐다. 그림 데이터는
//   순수 함수라 여기서 잠글 수 있고, 그러면 다음엔 셰이더만 보면 된다.

import {
  ART_ORDER, ATLAS_CAPACITY, BRICK_TEXTURES, GRASS_BAND, TEX_COLS, TEX_ROWS,
  artSlot, atlasGridFor, buildArt, faceSlots, type ArtId,
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

  // ── 티어 1 ───────────────────────────────────────────────────────────
  const [lr, lg, lb] = avg('leaves');
  ok(lg > lr && lg > lb, `★ 나뭇잎은 초록 — rgb(${lr.toFixed(0)},${lg.toFixed(0)},${lb.toFixed(0)})`);
  const [, gg2] = avg('grass');
  ok(lg < gg2, `★ 나뭇잎이 잔디보다 짙다 — 잎 ${lg.toFixed(0)} < 잔디 ${gg2.toFixed(0)}`);

  const [wr, wg, wb] = avg('water');
  ok(wb > wg && wg > wr, `★ 물은 파랑이 가장 세다 — rgb(${wr.toFixed(0)},${wg.toFixed(0)},${wb.toFixed(0)})`);

  for (const art of ['log_side', 'log_top'] as const) {
    const [r2, g2, b2] = avg(art);
    ok(r2 > g2 && g2 > b2, `★ ${art}는 나무색(갈색) — rgb(${r2.toFixed(0)},${g2.toFixed(0)},${b2.toFixed(0)})`);
  }

  // 돌벽돌은 무채색이어야 한다 — 채도가 돌면 벽돌(빨강)과 헷갈린다
  const [br2, bg2, bb2] = avg('stone_brick');
  ok(Math.max(br2, bg2, bb2) - Math.min(br2, bg2, bb2) < 12,
    `★ 돌벽돌은 무채색 — rgb(${br2.toFixed(0)},${bg2.toFixed(0)},${bb2.toFixed(0)})`);

  // 유리는 밝아야 색 틴트가 그대로 비친다(어두우면 유리로 안 보인다)
  const [gr3, gg3, gb3] = avg('glass');
  ok(Math.min(gr3, gg3, gb3) > 170, `★ 유리는 밝다 — rgb(${gr3.toFixed(0)},${gg3.toFixed(0)},${gb3.toFixed(0)})`);

  // ── 티어 2 ───────────────────────────────────────────────────────────
  // 눈은 **가장 밝아야** 한다 — 어두우면 눈으로 안 보이고 틴트도 안 먹는다
  const [nr, ng, nb] = avg('snow');
  ok(Math.min(nr, ng, nb) > 225, `★ 눈은 아주 밝다 — rgb(${nr.toFixed(0)},${ng.toFixed(0)},${nb.toFixed(0)})`);

  // 얼음은 파랑이 세되 **물보다 밝아야** 한다(둘 다 파랑이라 이걸로 갈린다)
  const [ir, ig, ib] = avg('ice');
  ok(ib > ig && ig > ir, `★ 얼음은 파랑빛 — rgb(${ir.toFixed(0)},${ig.toFixed(0)},${ib.toFixed(0)})`);
  const [, , wb2] = avg('water');
  ok(ib > wb2, `★ 얼음이 물보다 밝다 — 얼음 ${ib.toFixed(0)} > 물 ${wb2.toFixed(0)}`);

  // 사암은 모래와 같은 계열(노랑빛)이되 두 면이 서로 달라야 한다
  for (const art of ['sandstone_top', 'sandstone_side'] as const) {
    const [r4, g4, b4] = avg(art);
    ok(r4 > b4 && g4 > b4, `★ ${art}는 노랑빛 — rgb(${r4.toFixed(0)},${g4.toFixed(0)},${b4.toFixed(0)})`);
  }

  // 자갈흙은 **조약돌('자갈')보다 어둡고 따뜻해야** 한다 — 안 그러면 둘이 구별이 안 된다
  const [pr, pg, pb] = avg('pebbles');
  const [cr2, cg2, cb2] = avg('gravel');
  ok(pr > pb, `★ 자갈흙은 흙기가 돈다(빨강 > 파랑) — rgb(${pr.toFixed(0)},${pg.toFixed(0)},${pb.toFixed(0)})`);
  ok(cb2 >= cr2, `★ 조약돌은 푸른 회색 — rgb(${cr2.toFixed(0)},${cg2.toFixed(0)},${cb2.toFixed(0)})`);
  ok(pr + pg + pb < cr2 + cg2 + cb2, '★ 자갈흙이 조약돌보다 어둡다 (나란히 놓아도 구별된다)');

  // 점토 vs 테라코타 — **같은 매끈함, 다른 색조**. 이게 안 갈리면 둘 중 하나가 무의미하다
  const [yr, yg, yb] = avg('clay');
  ok(yb > yr, `★ 점토는 회청색(파랑 > 빨강) — rgb(${yr.toFixed(0)},${yg.toFixed(0)},${yb.toFixed(0)})`);
  const [tr, tg, tb] = avg('terracotta');
  ok(tr > tg && tg > tb, `★ 테라코타는 주황빛 — rgb(${tr.toFixed(0)},${tg.toFixed(0)},${tb.toFixed(0)})`);

  // 금속판·타일은 무채색이어야 한다(색은 틴트로 입힌다)
  for (const art of ['metal', 'tile'] as const) {
    const [r5, g5, b5] = avg(art);
    ok(Math.max(r5, g5, b5) - Math.min(r5, g5, b5) < 14,
      `★ ${art}는 무채색 — rgb(${r5.toFixed(0)},${g5.toFixed(0)},${b5.toFixed(0)})`);
  }
}

// ── ★ 타일은 실제로 **격자**여야 한다 (잡티가 아니라 인공물로 읽혀야 한다) ──
{
  const px = buildArt('tile');
  // 줄눈이 4칸마다 곧게 그어졌는가 — 한 줄이라도 끊기면 체크무늬로 안 보인다
  let straight = 0;
  for (let k = 0; k < ART; k += 4) {
    let full = true;
    for (let i = 0; i < ART; i++) if (px[i * ART + k] !== px[k]) full = false;
    if (full) straight++;
  }
  ok(straight === 4, `★ 타일 줄눈이 4칸마다 곧게 이어진다 — ${straight}/4`);
}

// ── ★ 사암 옆면의 위아래 (그림 y=0 = 면의 위쪽 규약) ─────────────────────
// 잔디 옆면과 같은 계열의 함정이다(T-2) — 뒤집히면 다진 윗단이 밑에 깔린다.
{
  const px = buildArt('sandstone_side');
  const lum = (c: string) => { const [r, g, b] = rgb(c); return (r + g + b) / 3; };
  const bandLum = (y0: number, y1: number) => {
    let s = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < ART; x++) { s += lum(px[y * ART + x]); n++; }
    return s / n;
  };
  // ⚠️ **맨 윗줄 vs 맨 아랫줄로 비교하면 안 된다** — 처음에 그렇게 썼다가 윗단을 통째로
  //    아래로 옮기는 사보타주를 **통과시켰다**(옮긴 띠의 어두운 경계선이 맨 아랫줄에 걸려서).
  //    "윗단(0~1줄)이 몸통(4줄 이하)보다 뚜렷하게 밝은가"를 봐야 한다.
  const cap = bandLum(0, 1), body = bandLum(4, ART - 1);
  ok(cap - body > 20, `★ 사암 윗단이 몸통보다 뚜렷하게 밝다 — 윗단 ${cap.toFixed(0)} vs 몸통 ${body.toFixed(0)}`);
}

// ── ★ 아틀라스에 다 들어가는가 ───────────────────────────────────────────
// 넘치면 뒤쪽 그림이 조용히 안 구워지고 화면엔 흰 면으로 나온다(원인 찾기 어려움)
{
  ok(ART_ORDER.length <= ATLAS_CAPACITY,
    `★ 그림 ${ART_ORDER.length}종이 아틀라스 ${ATLAS_CAPACITY}칸에 들어간다`);
  ok(new Set(ART_ORDER).size === ART_ORDER.length, 'ART_ORDER에 중복이 없다 (있으면 한 칸을 두 번 덮어쓴다)');
  ok(ART_ORDER[0] === 'plain', "0번 칸은 민짜여야 한다 — 셰이더가 '0 = 무늬 없음'으로 쓴다");

  // ★★ 그림 순서 고정 — **뒤에만 추가할 것.**
  //   난수 씨앗이 칸 번호(=배열 위치)에서 나오므로, 중간에 끼우거나 정렬하면
  //   그 뒤 그림들의 **모양이 전부 달라진다.** 저장은 멀쩡하고 에러도 안 나고 룩만 조용히 변한다.
  const LOCKED_ART: ArtId[] = [
    'plain', 'grass', 'dirt', 'stone', 'gravel', 'wood', 'brick', 'sand',
    'grass_side', 'glass', 'leaves', 'log_side', 'log_top', 'stone_brick', 'water',
    'snow', 'ice', 'sandstone_top', 'sandstone_side', 'pebbles',
    'clay', 'terracotta', 'metal', 'tile',
  ];
  LOCKED_ART.forEach((art, i) => {
    ok(ART_ORDER[i] === art, `★ 그림 ${i}번은 '${art}' 고정 — 현재 '${ART_ORDER[i]}'`);
  });
}

// ── ★ 아틀라스 격자 자동 확장 (결정 기록: `BRICK_SYSTEM.md §8.6`) ─────────
{
  // 정사각 + 2의 거듭제곱으로 올림
  const cases: [number, number][] = [
    [1, 1], [4, 2], [5, 4], [15, 4], [16, 4], [17, 8], [64, 8], [65, 16], [256, 16], [257, 32],
  ];
  for (const [n, grid] of cases) {
    ok(atlasGridFor(n) === grid, `그림 ${n}장 → 격자 ${grid}×${grid} — 현재 ${atlasGridFor(n)}`);
  }

  // 어떤 개수에도 반드시 다 들어가야 한다 (넘치면 뒤쪽 그림이 조용히 안 구워진다)
  let fits = true;
  for (let n = 1; n <= 300; n++) if (atlasGridFor(n) ** 2 < n) fits = false;
  ok(fits, '★ 1~300장 어디서도 칸이 모자라지 않는다');

  // 2의 거듭제곱이어야 한다 — 비-2제곱 텍스처를 안 만들려는 것
  let pow2 = true;
  for (let n = 1; n <= 300; n++) { const g = atlasGridFor(n); if ((g & (g - 1)) !== 0) pow2 = false; }
  ok(pow2, '격자 한 변이 항상 2의 거듭제곱이다');

  // 실제로 쓰는 격자가 계산식과 일치하는가 (숫자를 손으로 박으면 여기서 걸린다)
  const want = atlasGridFor(ART_ORDER.length);
  ok(TEX_COLS === want && TEX_ROWS === want,
    `★ 그림 ${ART_ORDER.length}장 → 격자 ${want}×${want} — 현재 ${TEX_COLS}×${TEX_ROWS}`);

  // ★ 티어 2에서 4×4 → 8×8로 넘어갔다. **앞쪽 15장은 칸 번호가 그대로**라 그림 모양이 안 변한다
  //   (씨앗이 칸 번호에서 나온다). 자동 확장이 룩을 안 건드린다는 것의 실제 확인.
  ok(TEX_COLS === 8, `★ 티어 2로 아틀라스가 8×8이 됐다 — 현재 ${TEX_COLS}×${TEX_ROWS}`);
  ok(artSlot('grass') === 1 && artSlot('water') === 14,
    '★ 칸이 늘어나도 기존 그림의 칸 번호는 그대로 (모양이 안 변한다)');
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

  // ★ 원목도 면이 갈린다 — 마구리(위아래) vs 껍질(옆)
  const [wTop, wSide, wBottom] = faceSlots(10);
  ok(wTop === artSlot('log_top'), '★ 원목 윗면 = 마구리(나이테)');
  ok(wSide === artSlot('log_side'), '★ 원목 옆면 = 껍질');
  ok(wBottom === artSlot('log_top'), '★ 원목 밑면 = 마구리 — 잘린 통나무는 위아래가 같다');

  // 모르는 재료(저장물이 코드보다 앞선 경우)는 민짜로 떨어져야 한다 — 크래시 금지
  ok(faceSlots(999).every((s) => s === 0), '모르는 재료 id는 민짜로 폴백한다');

  // ★ 저장값 보호 — 기존 재료의 id가 밀리면 이미 지어 둔 월드의 무늬가 통째로 뒤바뀐다
  // ★ 사암도 면이 갈린다 — 윗면은 매끈, 옆면은 지층 결
  const [sTop, sSide, sBottom] = faceSlots(15);
  ok(sTop === artSlot('sandstone_top'), '★ 사암 윗면 = 매끈한 면');
  ok(sSide === artSlot('sandstone_side'), '★ 사암 옆면 = 지층 결');
  ok(sBottom === artSlot('sandstone_top'), '★ 사암 밑면 = 윗면과 같다');

  const LOCKED: [number, string][] = [
    [0, '민짜'], [1, '잔디'], [2, '흙'], [3, '돌'],
    [4, '자갈'], [5, '나무'], [6, '벽돌'], [7, '모래'],
    // 티어 1 — 이미 이 id로 저장된 월드가 있다
    [8, '유리'], [9, '나뭇잎'], [10, '원목'], [11, '돌벽돌'], [12, '물'],
    // 티어 2
    [13, '눈'], [14, '얼음'], [15, '사암'], [16, '자갈흙'],
    [17, '점토'], [18, '테라코타'], [19, '금속판'], [20, '타일'],
  ];
  for (const [id, label] of LOCKED) {
    ok(BRICK_TEXTURES[id]?.id === id && BRICK_TEXTURES[id]?.label === label,
      `★ 재료 ${id}번은 '${label}' 고정 (append-only) — 현재 '${BRICK_TEXTURES[id]?.label}'`);
  }
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
