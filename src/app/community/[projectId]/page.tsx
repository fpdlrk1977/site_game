import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getWorkDetail } from '../queries';
import { WorkDetailClient } from './WorkDetailClient';
import { SiteShell } from '@/components/ui/SiteShell';

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

  const nav = (
    <div className="max-w-[1180px] mx-auto px-7 h-full flex items-center gap-7">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem]">
        <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: GRAD }}>⬡</span> Park3D
      </Link>
      <Link href="/community" className="text-sm text-foreground/70 hover:text-foreground transition-colors">← Gallery</Link>
      <div className="ml-auto flex items-center gap-3">
        <Link href={user ? '/dashboard' : '/login'} className="text-sm text-foreground/70 hover:text-foreground transition-colors">{user ? 'Dashboard' : 'Log in'}</Link>
      </div>
    </div>
  );

  return (
    <SiteShell nav={nav}>
      <WorkDetailClient detail={detail} loggedIn={!!user} />
    </SiteShell>
  );
}
