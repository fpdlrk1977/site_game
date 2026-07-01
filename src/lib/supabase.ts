import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 클라이언트 컴포넌트 / 브라우저 전용
export const createBrowserSupabase = () =>
  createBrowserClient(supabaseUrl, supabaseAnonKey);
