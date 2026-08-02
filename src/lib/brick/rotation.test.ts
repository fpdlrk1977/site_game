// 실행: npx tsx src/lib/brick/rotation.test.ts
//
// 회전 24방향의 **수학**만 잠근다. 아직 화면·저장에는 연결되지 않았다(붙이는 건 다음 단계).
//
// ★ 가장 중요한 검사는 맨 아래 "기존과 똑같은가"다.
//   `rot 0~3`이 지금 동작과 **한 글자도 다르면 안 된다** — 이미 지어 둔 월드가 그 번호로 저장돼 있다.
//   내가 회전 방향을 손으로 유도했을 때 부호가 반대로 나왔고, 그걸 잡아낸 게 이 검사다.

import { extentOf, pivotOffset, PARTS } from './parts';
import {
  ROT_COUNT, axisMap, makeRot, nextSpin, nextTip, rotMatrix,
  rotateExtent, rotatePivot, spinOf, tipOf,
} from './rotation';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

// ── 24개가 전부 서로 다른 '진짜 회전'인가 ────────────────────────────────
{
  const seen = new Set<string>();
  let proper = 0, permutation = 0;
  for (let rot = 0; rot < ROT_COUNT; rot++) {
    const m = rotMatrix(rot);
    seen.add(m.join(','));

    // 행렬식 +1 = 뒤집힘(거울)이 아닌 진짜 회전. −1이 섞이면 브릭이 좌우 반전된다
    const det =
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6]);
    if (det === 1) proper++;

    // 각 행·열에 0이 아닌 값이 딱 하나(=축 교환)여야 격자가 안 어긋난다
    let good = true;
    for (let i = 0; i < 3; i++) {
      const row = [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]].filter((v) => v !== 0);
      const col = [m[i], m[3 + i], m[6 + i]].filter((v) => v !== 0);
      if (row.length !== 1 || col.length !== 1 || Math.abs(row[0]) !== 1) good = false;
    }
    if (good) permutation++;
  }
  ok(seen.size === ROT_COUNT, `★ 24방향이 전부 다르다 — ${seen.size}가지`);
  ok(proper === ROT_COUNT, `★ 전부 행렬식 +1(거울 반전 없음) — ${proper}/24`);
  ok(permutation === ROT_COUNT, `★ 전부 정수 축 교환(격자가 안 어긋난다) — ${permutation}/24`);
}

// ── 번호 ↔ (눕히기, 제자리회전) 왕복 ─────────────────────────────────────
{
  let round = 0;
  for (let rot = 0; rot < ROT_COUNT; rot++) if (makeRot(tipOf(rot), spinOf(rot)) === rot) round++;
  ok(round === ROT_COUNT, `번호 ↔ (눕히기,회전) 왕복 — ${round}/24`);

  // 제자리로 네 번 돌면 제자리 · 눕히기 여섯 번이면 제자리
  let spinCycle = 0, tipCycle = 0;
  for (let rot = 0; rot < ROT_COUNT; rot++) {
    let r = rot; for (let i = 0; i < 4; i++) r = nextSpin(r);
    if (r === rot) spinCycle++;
    let t = rot; for (let i = 0; i < 6; i++) t = nextTip(t);
    if (t === rot) tipCycle++;
  }
  ok(spinCycle === ROT_COUNT, `제자리 회전 4번이면 원래대로 — ${spinCycle}/24`);
  ok(tipCycle === ROT_COUNT, `눕히기 6번이면 원래대로 — ${tipCycle}/24`);

  // 제자리 회전은 **눕힌 상태를 안 바꾼다**(축이 섞이면 조작이 예측 불가능해진다)
  let keepTip = 0;
  for (let rot = 0; rot < ROT_COUNT; rot++) if (tipOf(nextSpin(rot)) === tipOf(rot)) keepTip++;
  ok(keepTip === ROT_COUNT, `제자리 회전은 눕힌 방향을 안 건드린다 — ${keepTip}/24`);
}

// ── 점유 칸이 보존되나 (칸 수는 회전해도 그대로) ──────────────────────────
{
  let volOk = 0, total = 0;
  for (const part of Object.values(PARTS)) {
    const local: [number, number, number] = [part.sx, part.h, part.sz];
    for (let rot = 0; rot < ROT_COUNT; rot++) {
      total++;
      const e = rotateExtent(local, rot);
      if (e[0] * e[1] * e[2] === part.sx * part.h * part.sz) volOk++;
    }
  }
  ok(volOk === total, `★ 어떤 방향으로 돌려도 차지하는 칸 수가 같다 — ${volOk}/${total}`);

  // 세우면 실제로 **높이가 길이만큼** 늘어나야 한다 (이 기능의 존재 이유)
  const p = PARTS.b1x4; // 1×4 = 가로로 긴 브릭
  const flat = rotateExtent([p.sx, p.h, p.sz], 0);
  let stood = false;
  for (let rot = 0; rot < ROT_COUNT; rot++) {
    const e = rotateExtent([p.sx, p.h, p.sz], rot);
    if (e[1] === p.sz) stood = true; // 세로 크기가 원래 길이(4칸)가 되는 방향이 있다
  }
  ok(flat[1] === p.h, `1×4는 눕힌 채로는 높이가 ${p.h}칸`);
  ok(stood, '★ 1×4를 세우면 높이가 4칸이 되는 방향이 있다 (벽·기둥을 만들 수 있다)');
}

// ── 기준 칸이 AABB 안에 있나 ─────────────────────────────────────────────
{
  let inside = 0, total = 0;
  for (const part of Object.values(PARTS)) {
    const local: [number, number, number] = [part.sx, part.h, part.sz];
    for (let rot = 0; rot < ROT_COUNT; rot++) {
      total++;
      const e = rotateExtent(local, rot);
      const p = rotatePivot(local, rot);
      if (p.every((v, i) => v >= 0 && v < e[i])) inside++;
    }
  }
  ok(inside === total, `기준 칸이 항상 브릭 안에 있다 — ${inside}/${total}`);
}

// ── ★★ 기존과 똑같은가 — rot 0~3은 한 글자도 달라지면 안 된다 ────────────
//
// 이미 저장된 월드가 이 번호로 되어 있다. 여기가 어긋나면 **열자마자 방향이 뒤바뀐다.**
{
  let extSame = 0, pivSame = 0, total = 0;
  const bad: string[] = [];
  for (const part of Object.values(PARTS)) {
    const local: [number, number, number] = [part.sx, part.h, part.sz];
    for (let rot = 0; rot < 4; rot++) {
      total++;
      const old = extentOf(part, rot as 0 | 1 | 2 | 3);
      const now = rotateExtent(local, rot);
      if (old.ex === now[0] && old.ey === now[1] && old.ez === now[2]) extSame++;

      const [odx, odz] = pivotOffset(part, rot as 0 | 1 | 2 | 3);
      const np = rotatePivot(local, rot);
      if (odx === np[0] && odz === np[2] && np[1] === 0) pivSame++;
      else bad.push(`${part.id} rot${rot}: 기존[${odx},${odz}] vs 새[${np[0]},${np[2]}]`);
    }
  }
  ok(extSame === total, `★★ rot 0~3 점유 범위가 기존과 동일 — ${extSame}/${total}`);
  ok(pivSame === total, `★★ rot 0~3 기준 칸이 기존과 동일 — ${pivSame}/${total}${bad.length ? ' · ' + bad.slice(0, 3).join(' / ') : ''}`);
}

// ── 세운 상태에서는 기준 칸이 위아래로도 밀린다 ──────────────────────────
// (기존은 항상 0이었다 — 세우기가 생기면서 처음으로 세로 오프셋이 필요해진다)
{
  const p = PARTS.b1x4;
  let anyY = false;
  for (let rot = 0; rot < ROT_COUNT; rot++) {
    if (rotatePivot([p.sx, p.h, p.sz], rot)[1] !== 0) anyY = true;
  }
  ok(anyY, '★ 세운 방향에서는 기준 칸이 세로로도 밀린다 (기존 2D 오프셋으로는 부족하다)');
}

console.log(`\n브릭 회전 24방향 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
