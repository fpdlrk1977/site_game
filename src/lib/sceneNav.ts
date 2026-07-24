/**
 * 씬 간 이동(go_to_scene) 목적지 경로를 계산하는 순수 함수.
 *
 * 서빙 컨텍스트별 URL 스킴:
 *  - 플랫폼:      /space/{sceneId}
 *  - 임베드:      /embed/{sceneId}
 *  - 커스텀 도메인: /s/{sceneId}   (루트 '/'는 기본 씬 — proxy.ts가 rewrite)
 *
 * 커스텀 도메인에서는 브라우저 경로가 '/' 또는 '/s/{id}'라서
 * 플랫폼처럼 "경로 속 씬 id 치환"이 불가능하므로 별도 스킴을 쓴다.
 * proxy.ts의 커스텀 도메인 rewrite 규칙과 짝을 이룬다.
 */
export function nextSceneHref(
  pathname: string,
  currentSceneId: string,
  targetSceneId: string,
): string {
  if (pathname.startsWith('/space/') || pathname.startsWith('/embed/')) {
    // 플랫폼/임베드: 경로의 현재 씬 id를 대상 id로 치환 (없으면 /space 폴백)
    return pathname.includes(currentSceneId)
      ? pathname.replace(currentSceneId, targetSceneId)
      : `/space/${targetSceneId}`;
  }
  // 커스텀 도메인: /s/{sceneId} 스킴
  return `/s/${targetSceneId}`;
}
