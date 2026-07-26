/**
 * Analytics 집계 — 순수 함수.
 *
 * DB(RPC)에서 이미 그룹핑된 행을 받아 "빠진 날짜를 0으로 메운 연속 시계열"로 바꾼다.
 * 날짜를 메우지 않으면 방문이 없는 날이 그래프에서 사라져 추이가 왜곡된다.
 * 기준 타임존은 UTC — RPC(`at time zone 'UTC'`)와 반드시 같아야 날짜가 안 밀린다.
 */

export interface DailyRow { day: string; event_type: string; cnt: number }
export interface DailyPoint { day: string; views: number; interactions: number }

/**
 * "상호작용"으로 셀 이벤트.
 * area_exit는 area_enter와 짝을 이루므로 제외한다 — 함께 세면 한 번의 접촉이 두 번 계산된다.
 * (수집은 계속한다. 세는 방식만 다를 뿐.)
 */
const INTERACTION_TYPES = new Set(['click', 'area_enter', 'interact']);

/** 오늘(UTC)로 끝나는 최근 n일의 'YYYY-MM-DD' 목록 (오름차순) */
export function lastDayKeys(days: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

/** RPC 행 → 빈 날짜를 0으로 채운 연속 시계열 */
export function buildDailySeries(rows: DailyRow[], days: number, now?: Date): DailyPoint[] {
  const map = new Map<string, DailyPoint>();
  for (const key of lastDayKeys(days, now)) map.set(key, { day: key, views: 0, interactions: 0 });
  for (const r of rows) {
    const key = String(r.day).slice(0, 10);
    const p = map.get(key);
    if (!p) continue; // 범위 밖(경계 시각차) 행은 버린다
    if (r.event_type === 'view') p.views += Number(r.cnt);
    else if (INTERACTION_TYPES.has(r.event_type)) p.interactions += Number(r.cnt);
  }
  return [...map.values()];
}

/** 시계열을 앞뒤 절반으로 갈라 증감률(%) 계산. 이전 구간이 0이면 null(비율 무의미). */
export function trendPct(series: DailyPoint[], pick: (p: DailyPoint) => number): number | null {
  if (series.length < 4) return null;
  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((s, p) => s + pick(p), 0);
  const curr = series.slice(half).reduce((s, p) => s + pick(p), 0);
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

/** 'YYYY-MM-DD' → 'M/D' (축 라벨용) */
export function shortDay(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseRange(v: string | undefined): AnalyticsRange {
  const n = Number(v);
  return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRange) : 30;
}
