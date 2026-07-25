import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getWorkDetail } from '../queries';
import { WorkDetailClient } from './WorkDetailClient';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const d = await getWorkDetail(projectId);
  return { title: d ? `${d.name} — Park3D 커뮤니티` : 'Park3D 커뮤니티' };
}

export default async function WorkDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const detail = await getWorkDetail(projectId);
  if (!detail) notFound();

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-30 border-b border-border backdrop-blur-xl" style={{ background: 'linear-gradient(180deg,rgba(14,13,19,.9),rgba(14,13,19,.6))' }}>
        <div className="max-w-[1180px] mx-auto px-7 h-16 flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.05rem]">
            <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white" style={{ background: GRAD }}>⬡</span> Park3D
          </Link>
          <Link href="/community" className="text-sm text-muted hover:text-foreground">← 갤러리</Link>
          <div className="ml-auto flex items-center gap-3">
            <Link href={user ? '/dashboard' : '/login'} className="text-sm text-muted hover:text-foreground">{user ? '대시보드' : '로그인'}</Link>
          </div>
        </div>
      </nav>

      <WorkDetailClient detail={detail} loggedIn={!!user} />
    </div>
  );
}
