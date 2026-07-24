'use client';

import { useEffect } from 'react';

/**
 * bfcache(뒤로가기/앞으로가기 캐시) 복원 방어.
 *
 * 로그아웃 후 뒤로가기를 누르면, 일부 브라우저는 서버를 거치지 않고
 * 메모리에 캐시된 이전 페이지(대시보드 등)를 그대로 복원한다.
 * 이 경우 미들웨어의 인증 리다이렉트가 동작하지 않는다.
 *
 * pageshow 이벤트의 persisted 플래그가 true면 = bfcache에서 복원된 것이므로
 * 강제로 새로고침해 서버 라운드트립을 유발한다 → 미인증이면 /login으로 리다이렉트된다.
 * (proxy.ts의 no-store 헤더와 이중 안전장치.)
 */
export function BfcacheGuard() {
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  return null;
}
