import Link from 'next/link';
import { Heart, Repeat2, Telescope } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getGallery, type GalleryItem } from './queries';
import { thumbGradient } from '@/lib/thumbGradient';
import { AmbientBackground } from '@/components/ui/AmbientBackground';

export const metadata = { title: '커뮤니티 갤러리 — Park3D', description: '다른 크리에이터들이 만든 3D 공간을 둘러보고 리믹스하세요.' };

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

function Card({ item }: { item: GalleryItem }) {
  return (
    <Link href={`/community/${item.id}`}
      className="group bg-surface border border-border rounded-xs overflow-hidden block transition-all duration-200 hover:border-border/50 hover:-translate-y-0.5"
      style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="aspect-[4/3] relative overflow-hidden" style={{ background: thumbGradient(item.id) }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 18%, rgba(255,255,255,.14), transparent 52%)' }} />
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />}
      </div>
      <div className="px-3.5 py-3">
        <div className="text-[.9rem] font-semibold truncate group-hover:text-primary transition-colors">{item.name}</div>
        <div className="flex items-center gap-2 mt-2 text-[.75rem] text-muted">
          <span className="w-[18px] h-[18px] rounded-full grid place-items-center text-white text-[.6rem] font-bold shrink-0" style={{ background: GRAD }}>
            {item.author.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{item.author.name}</span>
          <span className="ml-auto flex items-center gap-3 whitespace-nowrap tabular-nums">
            <span className="inline-flex items-center gap-1"><Heart size={12} /> {item.likes}</span>
            <span className="inline-flex items-center gap-1"><Repeat2 size={12} /> {item.remixes}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const [{ items, tags }, supabase] = await Promise.all([getGallery(tag), createSupabaseServer()]);
  const { data: { user } } = await supabase.auth.getUser();

  const chip = (on: boolean) => `text-[.8rem] px-3 py-1.5 rounded-xs border transition-colors ${on ? 'text-primary font-semibold' : 'text-muted hover:text-foreground'}`;
  const chipStyle = (on: boolean) => on ? { background: 'rgba(124,108,255,.14)', borderColor: 'rgba(124,108,255,.35)' } : { borderColor: 'var(--border)', background: 'var(--surface)' };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <AmbientBackground />

      <nav className="sticky top-0 z-30 border-b border-border backdrop-blur-xl" style={{ background: 'rgba(14,13,19,.72)' }}>
        <div className="max-w-[1180px] mx-auto px-7 h-16 flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem]">
            <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: GRAD }}>⬡</span> Park3D
          </Link>
          <div className="hidden md:flex gap-6 text-sm text-muted">
            <Link href="/#features" className="hover:text-foreground transition-colors">기능</Link>
            <Link href="/community" className="text-foreground font-medium">갤러리</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">요금제</Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href={user ? '/dashboard' : '/login'} className="text-sm text-muted hover:text-foreground transition-colors">{user ? '대시보드' : '로그인'}</Link>
            {!user && <Link href="/signup" className="px-4 py-2 rounded-xs text-sm font-semibold text-white" style={{ background: GRAD }}>무료로 시작</Link>}
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-[1180px] mx-auto px-7 py-14">
        <div className="mb-9">
          <span className="text-[.7rem] tracking-[.16em] uppercase text-primary font-semibold">커뮤니티 갤러리</span>
          <h1 className="text-[2.1rem] font-bold tracking-tight mt-3">다른 사람들이 만든 세계</h1>
          <p className="text-muted mt-2.5 text-[.95rem]">마음에 드는 작품을 열어보고, 한 번의 클릭으로 <span className="text-foreground font-medium">리믹스</span>해 내 것으로 만드세요.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          <Link href="/community" className={chip(!tag)} style={chipStyle(!tag)}>전체</Link>
          {tags.map((t) => (
            <Link key={t} href={`/community?tag=${encodeURIComponent(t)}`} className={chip(tag === t)} style={chipStyle(tag === t)}>#{t}</Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-28">
            <div className="inline-flex w-14 h-14 rounded-xs border border-border bg-surface items-center justify-center text-muted mb-4">
              <Telescope size={24} />
            </div>
            <p className="text-foreground font-medium">아직 공개된 작품이 없어요</p>
            <p className="text-sm text-muted mt-1.5">프로젝트를 공개(게시)하면 여기에 나타납니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {items.map((it) => <Card key={it.id} item={it} />)}
          </div>
        )}
      </main>
    </div>
  );
}
