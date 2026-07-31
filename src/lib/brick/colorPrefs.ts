// 최근에 쓴 색 — **씬이 아니라 기기에 남는다.**
//
// ★ 왜 `BrickStorage`(씬 저장소)에 안 넣었나
//   ① **Supabase 어댑터의 `saveSettings`/`loadSettings`는 no-op**이다 — 에디터에선 아무것도 저장되지 않는다.
//      (`studStyle`도 그래서 사실상 프로토타입에서만 유지되고 있었다.)
//   ② 최근 색은 **씬 데이터가 아니라 사용자 취향**이다. 씬을 옮길 때마다 초기화되면 오히려 이상하다.
//
// 기본 팔레트(`BRICK_COLORS`)에 있는 색은 담지 않는다 — 팔레트와 최근 색이 똑같아 보이면 줄만 늘어난다.

const KEY = 'park3d-brick-recent-colors';
/** 너무 길면 고르는 데 오히려 시간이 걸린다 */
export const RECENT_MAX = 10;

export function loadRecentColors(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((c): c is string => typeof c === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** 맨 앞에 넣고 중복은 제거한다(방금 쓴 것이 항상 첫 칸) */
export function pushRecentColor(list: string[], hex: string): string[] {
  const next = [hex, ...list.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, RECENT_MAX);
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 용량 초과 등 — 색 하나 못 남기는 것뿐이라 무시 */ }
  }
  return next;
}
