/**
 * 작가 프로필 링크.
 *
 * ⚠️ 이 함수가 `community/queries.ts`에 있으면 안 된다 — 그 파일은 `supabase-server`
 *    (next/headers)를 임포트하므로, 클라이언트 컴포넌트가 값(함수)으로 가져오는 순간
 *    서버 전용 모듈이 클라이언트 번들로 끌려 들어가 빌드가 깨진다.
 *    (타입만 `import type`으로 가져오는 건 런타임 임포트가 아니라 안전하다.)
 *
 * username이 없으면(프로필 미생성) null → 호출부는 링크를 만들지 않는다.
 */
export function authorHref(author: { username: string | null }): string | null {
  return author.username ? `/u/${encodeURIComponent(author.username)}` : null;
}
