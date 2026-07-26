import { lastDayKeys, buildDailySeries, trendPct, shortDay, parseRange } from './analytics';

// 간단한 결정론 테스트 (npx tsx src/lib/analytics.test.ts)
let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`); }
}

const NOW = new Date('2026-07-26T09:30:00Z');

// ── 날짜 축 ──────────────────────────────────────────────
eq('lastDayKeys 길이', lastDayKeys(7, NOW).length, 7);
eq('lastDayKeys 끝=오늘', lastDayKeys(7, NOW).at(-1), '2026-07-26');
eq('lastDayKeys 시작', lastDayKeys(7, NOW)[0], '2026-07-20');
eq('lastDayKeys 오름차순', lastDayKeys(3, NOW), ['2026-07-24', '2026-07-25', '2026-07-26']);

// ── 빈 날짜 0 채우기(핵심: 방문 없는 날이 사라지면 추이가 왜곡됨) ──
const series = buildDailySeries(
  [
    { day: '2026-07-26', event_type: 'view', cnt: 5 },
    { day: '2026-07-24', event_type: 'view', cnt: 2 },
    { day: '2026-07-24', event_type: 'click', cnt: 3 },
    { day: '2026-07-24', event_type: 'area_enter', cnt: 1 },
    { day: '2026-07-24', event_type: 'area_exit', cnt: 7 },   // 짝 이벤트 — 상호작용으로 세지 않는다
  ],
  3,
  NOW,
);
eq('연속 3일 생성', series.map((p) => p.day), ['2026-07-24', '2026-07-25', '2026-07-26']);
eq('빈 날은 0', series[1], { day: '2026-07-25', views: 0, interactions: 0 });
eq('view 집계', series[2].views, 5);
eq('interaction = click+area_enter (area_exit 제외)', series[0].interactions, 4);
eq('interact 트리거도 상호작용',
  buildDailySeries([{ day: '2026-07-26', event_type: 'interact', cnt: 3 }], 2, NOW).at(-1)!.interactions, 3);
eq('area_exit 단독은 0',
  buildDailySeries([{ day: '2026-07-26', event_type: 'area_exit', cnt: 5 }], 2, NOW).at(-1)!.interactions, 0);

// timestamptz 형태('2026-07-26T00:00:00+00:00')로 와도 날짜만 잘라 매칭
eq('타임스탬프 문자열 허용',
  buildDailySeries([{ day: '2026-07-26T00:00:00+00:00', event_type: 'view', cnt: 9 }], 2, NOW).at(-1)!.views, 9);

// 범위 밖 행은 버린다(경계 시각차)
eq('범위 밖 무시',
  buildDailySeries([{ day: '2020-01-01', event_type: 'view', cnt: 99 }], 2, NOW).reduce((s, p) => s + p.views, 0), 0);

// ── 증감률 ───────────────────────────────────────────────
const mk = (views: number[]) => views.map((v, i) => ({ day: `d${i}`, views: v, interactions: 0 }));
eq('증가 +100%', trendPct(mk([1, 1, 2, 2]), (p) => p.views), 100);
eq('감소 -50%', trendPct(mk([2, 2, 1, 1]), (p) => p.views), -50);
eq('이전 0이면 null(비율 무의미)', trendPct(mk([0, 0, 5, 5]), (p) => p.views), null);
eq('표본 부족이면 null', trendPct(mk([1, 2]), (p) => p.views), null);

// ── 기타 ────────────────────────────────────────────────
eq('shortDay', shortDay('2026-07-06'), '7/6');
eq('parseRange 기본', parseRange(undefined), 30);
eq('parseRange 허용값', parseRange('7'), 7);
eq('parseRange 비허용→기본', parseRange('999'), 30);

console.log(`\n${fail === 0 ? '✅' : '❌'} analytics: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
