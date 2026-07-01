import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'localhost:3000';
const PROTECTED_PATHS = ['/dashboard', '/editor'];
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

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
