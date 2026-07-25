import { createSupabaseServer } from '@/lib/supabase-server';
import { LandingClient } from '@/components/landing/LandingClient';

// 공개 랜딩(마케팅) 페이지. 로그인 여부에 따라 CTA만 달라진다(대시보드 vs 회원가입).
export default async function RootPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return <LandingClient loggedIn={!!user} />;
}
