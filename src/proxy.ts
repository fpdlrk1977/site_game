import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'localhost:3000';
const PROTECTED_PATHS = ['/dashboard', '/editor'];
// 인증된 사용자가 오면 안 되는 페이지 (정확히 일치 — 하위 /signup/complete는 제외).
const AUTH_PATHS = ['/login', '/signup'];
const VALID_HOST_RE = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/;

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const host = req.headers.get('host') ?? '';
  const pathname = req.nextUrl.pathname;

  // 커스텀 도메인 처리
  if (!host.includes('localhost') && !host.includes(PLATFORM_DOMAIN)) {
    if (!VALID_HOST_RE.test(host)) return res;
    const apiRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/projects?custom_domain=eq.${encodeURIComponent(host)}&select=default_scene_id`,
      { headers: { apikey: process.env.SUPABASE_SERVICE_KEY! }, signal: AbortSignal.timeout(3000) }
    );
    const [project] = await apiRes.json();
    if (project?.default_scene_id) {
      return NextResponse.rewrite(new URL(`/space/${project.default_scene_id}`, req.url));
    }
  }

  // 모든 경로에서 세션 갱신 (액세스 토큰 만료 시 자동 갱신)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // 보호된 경로 — 미인증 시 로그인으로 리다이렉트
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // 인증된 사용자가 로그인/회원가입 페이지에 오면 대시보드로.
  // (로그인 후 뒤로가기로 로그인·회원가입 화면이 다시 보이지 않게)
  const isAuthPage = AUTH_PATHS.includes(pathname);
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // bfcache(뒤로가기 캐시) 방지 — no-store면 브라우저가 페이지를 캐시하지 않아
  // 뒤로가기 시 서버로 재요청 → 위 리다이렉트가 동작한다.
  //  · 보호 경로: 로그아웃 후 뒤로가기로 대시보드가 복원되는 것을 막음
  //  · 인증 페이지: 로그인 후 뒤로가기로 로그인/회원가입이 복원되는 것을 막음
  if (isProtected || isAuthPage) {
    res.headers.set('Cache-Control', 'no-store, must-revalidate');
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
