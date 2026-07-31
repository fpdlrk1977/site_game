// 실행: npx tsx src/lib/brick/textures.test.ts
//
// 무늬가 **실제로 그려지는가**를 잠근다.
//
// ★ 왜 필요한가: 무늬가 화면에서 흰색으로 나온 적이 있다. 원인이 ①그림이 안 그려졌나
//   ②셰이더까지 안 갔나 둘 중 어느 쪽인지 눈으로는 구분이 안 됐다. 그림 데이터는
//   순수 함수라 여기서 잠글 수 있고, 그러면 다음엔 셰이더만 보면 된다.

import { BRICK_TEXTURES, buildArt } from './textures';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const ART = 16;

for (const t of BRICK_TEXTURES) {
  const art = buildArt(t.id);

  ok(art.length === ART * ART, `${t.label}: 16×16 = ${art.length}칸`);
  ok(art.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)),
    `${t.label}: 모든 칸이 유효한 색이다 (빈 칸이 있으면 캔버스가 이전 색으로 칠해진다)`);

  const uniq = new Set(art);
  if (t.id === 0) {
    ok(uniq.size === 1 && art[0] === '#ffffff', '민짜: 순수 흰색 한 가지 (= 색 그대로)');
  } else {
    // ★ 흰색만 나오면 화면에서 "무늬가 안 먹는" 것과 구분이 안 된다
    ok(!art.every((c) => c.toLowerCase() === '#ffffff'), `★ ${t.label}: 흰색이 아니다`);
    ok(uniq.size >= 3, `★ ${t.label}: 명암이 3단계 이상 — ${uniq.size}가지`);
  }
}

// ── 재료끼리 서로 달라야 한다 (복붙 실수 감시) ──────────────────────────
{
  const sig = BRICK_TEXTURES.map((t) => buildArt(t.id).join(''));
  ok(new Set(sig).size === BRICK_TEXTURES.length, `★ 재료 ${BRICK_TEXTURES.length}종이 전부 다른 그림 — ${new Set(sig).size}가지`);
}

// ── 결정적이어야 한다 (세션마다 무늬가 달라지면 안 된다) ─────────────────
{
  ok(buildArt(4).join('') === buildArt(4).join(''), '같은 재료는 항상 같은 그림 (결정적 난수)');
}

// ── 재료다운 색인가 — 대표 색조를 확인 ───────────────────────────────────
{
  const avg = (id: number) => {
    const a = buildArt(id);
    let r = 0, g = 0, b = 0;
    for (const c of a) {
      r += parseInt(c.slice(1, 3), 16); g += parseInt(c.slice(3, 5), 16); b += parseInt(c.slice(5, 7), 16);
    }
    return [r / a.length, g / a.length, b / a.length];
  };
  const [gr, gg, gb] = avg(1);
  ok(gg > gr && gg > gb, `★ 잔디는 초록이 가장 세다 — rgb(${gr.toFixed(0)},${gg.toFixed(0)},${gb.toFixed(0)})`);
  const [br, bg, bb] = avg(6);
  ok(br > bg && br > bb, `★ 벽돌은 빨강이 가장 세다 — rgb(${br.toFixed(0)},${bg.toFixed(0)},${bb.toFixed(0)})`);
  const [sr, sg, sb] = avg(7);
  ok(sr > sb && sg > sb, `★ 모래는 노랑빛(파랑이 가장 약하다) — rgb(${sr.toFixed(0)},${sg.toFixed(0)},${sb.toFixed(0)})`);
}

console.log(`\n브릭 무늬(재료) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
