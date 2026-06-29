import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 클라이언트 컴포넌트 / 브라우저 전용
export const createBrowserSupabase = () =>
  createBrowserClient(supabaseUrl, supabaseAnonKey);

// API Route 전용 (서비스 역할 — 클라이언트 번들에 절대 포함 금지)
export const createServiceSupabase = () =>
  createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
