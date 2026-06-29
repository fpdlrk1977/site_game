import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? 'localhost:3000';
const PROTECTED_PATHS = ['/dashboard', '/editor'];

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const host = req.headers.get('host') ?? '';
  const pathname = req.nextUrl.pathname;

  // 커스텀 도메인 처리
  if (!host.includes('localhost') && !host.includes(PLATFORM_DOMAIN)) {
    const apiRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/projects?custom_domain=eq.${host}&select=default_scene_id`,
      { headers: { apikey: process.env.SUPABASE_SERVICE_KEY! } }
    );
    const [project] = await apiRes.json();
    if (project?.default_scene_id) {
      return NextResponse.rewrite(new URL(`/space/${project.default_scene_id}`, req.url));
    }
  }

  // 인증 보호
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (isProtected) {
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
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
