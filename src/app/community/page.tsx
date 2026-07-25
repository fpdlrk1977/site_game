import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getGallery, type GalleryItem } from './queries';

export const metadata = { title: '커뮤니티 갤러리 — Park3D', description: '다른 크리에이터들이 만든 3D 공간을 둘러보고 리믹스하세요.' };

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';
function fallbackBg(id: string) {
  const palettes = [
    'linear-gradient(145deg,#f4a3c9,#c9689e)', 'linear-gradient(145deg,#8b78ff,#4a2fd0)',
    'linear-gradient(145deg,#39d0ea,#1583b0)', 'linear-gradient(145deg,#f2c14e,#d98a2b)',
    'linear-gradient(145deg,#6a4dff,#c04aff)', 'linear-gradient(145deg,#2dd4bf,#0d9488)',
  ];
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return palettes[Math.abs(h) % palettes.length];
}

function Card({ item }: { item: GalleryItem }) {
  return (
    <Link href={`/community/${item.id}`} className="bg-surface border border-border rounded-lg overflow-hidden block transition-transform hover:-translate-y-1"
      style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="aspect-[4/3] relative overflow-hidden" style={{ background: fallbackBg(item.id) }}>
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />}
      </div>
      <div className="px-3.5 py-3">
        <div className="text-[.92rem] font-semibold truncate">{item.name}</div>
        <div className="flex items-center gap-2 mt-1.5 text-[.76rem] text-muted">
          <span className="w-[18px] h-[18px] rounded-full grid place-items-center text-white text-[.6rem] font-bold" style={{ background: GRAD }}>
            {item.author.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{item.author.name}</span>
          <span className="ml-auto flex gap-2.5 whitespace-nowrap">♡ {item.likes} · ⇄ {item.remixes}</span>
        </div>
      </div>
    </Link>
  );
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const { tag } = await searchParams;
  const [{ items, tags }, supabase] = await Promise.all([getGallery(tag), createSupabaseServer()]);
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-30 border-b border-border backdrop-blur-xl" style={{ background: 'linear-gradient(180deg,rgba(14,13,19,.9),rgba(14,13,19,.6))' }}>
        <div className="max-w-[1180px] mx-auto px-7 h-16 flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.05rem]">
            <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center text-white" style={{ background: GRAD }}>⬡</span> Park3D
          </Link>
          <div className="hidden md:flex gap-6 text-sm text-muted">
            <Link href="/#features" className="hover:text-foreground">기능</Link>
            <Link href="/community" className="text-foreground font-medium">갤러리</Link>
            <Link href="/pricing" className="hover:text-foreground">요금제</Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href={user ? '/dashboard' : '/login'} className="text-sm text-muted hover:text-foreground">{user ? '대시보드' : '로그인'}</Link>
            {!user && <Link href="/signup" className="px-5 py-2.5 rounded-xs text-sm font-semibold text-white" style={{ background: GRAD }}>무료로 시작</Link>}
          </div>
        </div>
      </nav>

      <main className="max-w-[1180px] mx-auto px-7 py-12">
        <div className="mb-8">
          <span className="text-[.72rem] tracking-[.14em] uppercase text-primary font-bold">커뮤니티 갤러리</span>
          <h1 className="text-[2rem] font-bold tracking-tight mt-2.5">다른 사람들이 만든 세계</h1>
          <p className="text-muted mt-2">마음에 드는 작품을 열어보고, 한 번의 클릭으로 <b className="text-foreground">리믹스</b>해 내 것으로 만드세요.</p>
        </div>

        {/* tag filter */}
        <div className="flex flex-wrap gap-2 mb-7">
          <Link href="/community" className={`text-[.8rem] px-3.5 py-1.5 rounded-full border ${!tag ? 'text-primary font-semibold' : 'text-muted'}`}
            style={!tag ? { background: 'rgba(139,120,255,.16)', borderColor: 'rgba(139,120,255,.4)' } : { borderColor: 'var(--border)', background: 'var(--surface)' }}>전체</Link>
          {tags.map((t) => (
            <Link key={t} href={`/community?tag=${encodeURIComponent(t)}`}
              className={`text-[.8rem] px-3.5 py-1.5 rounded-full border ${tag === t ? 'text-primary font-semibold' : 'text-muted'}`}
              style={tag === t ? { background: 'rgba(139,120,255,.16)', borderColor: 'rgba(139,120,255,.4)' } : { borderColor: 'var(--border)', background: 'var(--surface)' }}>#{t}</Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-24 text-muted">
            <div className="text-4xl mb-3">🌌</div>
            <p className="text-foreground font-medium">아직 공개된 작품이 없어요</p>
            <p className="text-sm mt-1">프로젝트를 공개(게시)하면 여기에 나타납니다.</p>
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
