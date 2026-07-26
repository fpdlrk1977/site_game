import Link from 'next/link';
import { Telescope, Search, Sparkles, X } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getGallery, type GallerySort } from './queries';
import { GalleryCard } from './GalleryCard';
import { SiteShell } from '@/components/ui/SiteShell';
import { SiteNav } from '@/components/ui/SiteNav';
import { SiteFooter } from '@/components/ui/SiteFooter';

export const metadata = { title: 'Community Gallery — Park3D', description: 'Explore and remix 3D spaces built by other creators.' };

interface Params { tag?: string; q?: string; sort?: string }

/** 현재 필터를 유지하면서 일부만 바꾼 URL */
function href(cur: Params, patch: Partial<Params>): string {
  const next = { ...cur, ...patch };
  const sp = new URLSearchParams();
  if (next.tag) sp.set('tag', next.tag);
  if (next.q) sp.set('q', next.q);
  if (next.sort && next.sort !== 'recent') sp.set('sort', next.sort);
  const s = sp.toString();
  return s ? `/community?${s}` : '/community';
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const sort: GallerySort = params.sort === 'popular' ? 'popular' : 'recent';
  const q = params.q?.trim() || '';
  const tag = params.tag;

  const [{ items, tags, featured }, supabase] = await Promise.all([
    getGallery({ tag, q, sort }),
    createSupabaseServer(),
  ]);
  const { data: { user } } = await supabase.auth.getUser();

  const filtering = !!tag || !!q;
  const chip = (on: boolean) => `text-[.8rem] px-3 py-1.5 rounded-xs border transition-colors ${on ? 'text-primary font-semibold' : 'text-muted hover:text-foreground'}`;
  const chipStyle = (on: boolean) => on
    ? { background: 'rgba(124,108,255,.14)', borderColor: 'rgba(124,108,255,.35)' }
    : { borderColor: 'var(--border)', background: 'var(--surface)' };

  return (
    <SiteShell nav={<SiteNav active="gallery" loggedIn={!!user} />}>
      <div className="max-w-[1180px] mx-auto px-7 py-14">
        <div className="mb-8">
          <span className="text-[.7rem] tracking-[.16em] uppercase text-primary font-semibold">Community gallery</span>
          <h1 className="text-[2.1rem] font-bold tracking-tight mt-3">Worlds built by the community</h1>
          <p className="text-muted mt-2.5 text-[.95rem]">Open any piece you like and <span className="text-foreground font-medium">remix</span> it into your own with one click.</p>
        </div>

        {/* Featured — 필터가 없을 때만. 필터 결과 위에 무관한 추천을 얹지 않는다. */}
        {!filtering && featured.length > 0 && (
          <section className="mb-11">
            <h2 className="flex items-center gap-2 text-[.95rem] font-semibold mb-4">
              <Sparkles size={15} className="text-primary" /> Most loved
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {featured.map((it) => <GalleryCard key={it.id} item={it} />)}
            </div>
          </section>
        )}

        {/* 검색 + 정렬 — 한 줄로 */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <form action="/community" method="GET" className="flex items-center gap-2 bg-surface border border-border rounded-xs px-3 py-2 text-muted focus-within:border-primary transition-colors w-full sm:w-[300px]">
            {tag && <input type="hidden" name="tag" value={tag} />}
            {sort !== 'recent' && <input type="hidden" name="sort" value={sort} />}
            <Search size={15} />
            <input name="q" defaultValue={q} placeholder="Search spaces, creators, tags…"
              className="bg-transparent text-sm text-foreground placeholder-muted w-full focus:outline-none" />
          </form>

          <div className="flex items-center gap-1 bg-surface border border-border rounded-xs p-1 ml-auto">
            {(['recent', 'popular'] as const).map((s) => (
              <Link key={s} href={href(params, { sort: s })}
                className={`px-3 py-1.5 rounded-xs text-[.8rem] transition-colors ${s === sort ? 'text-primary font-semibold bg-primary/[0.12]' : 'text-muted hover:text-foreground'}`}>
                {s === 'recent' ? 'Newest' : 'Popular'}
              </Link>
            ))}
          </div>
        </div>

        {/* 태그 */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <Link href={href(params, { tag: undefined })} className={chip(!tag)} style={chipStyle(!tag)}>All</Link>
            {tags.map((t) => (
              <Link key={t} href={href(params, { tag: t })} className={chip(tag === t)} style={chipStyle(tag === t)}>#{t}</Link>
            ))}
          </div>
        )}

        {/* 현재 검색어 표시 + 해제 */}
        {q && (
          <div className="flex items-center gap-2 mb-6 text-sm text-muted">
            <span>Results for <b className="text-foreground">“{q}”</b> · {items.length}</span>
            <Link href={href(params, { q: undefined })} className="inline-flex items-center gap-1 text-[.78rem] px-2 py-1 rounded-xs border border-border bg-surface hover:text-foreground transition-colors">
              <X size={12} /> Clear
            </Link>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-28">
            <div className="inline-flex w-14 h-14 rounded-xs border border-border bg-surface items-center justify-center text-muted mb-4">
              <Telescope size={24} />
            </div>
            <p className="text-foreground font-medium">{filtering ? 'Nothing matched' : 'No published work yet'}</p>
            <p className="text-sm text-muted mt-1.5">
              {filtering ? 'Try a different keyword or tag.' : "Publish a project and it'll show up here."}
            </p>
            {filtering && (
              <Link href="/community" className="inline-block mt-5 text-[.82rem] px-3.5 py-2 rounded-xs border border-border bg-surface hover:text-foreground transition-colors">
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {items.map((it) => <GalleryCard key={it.id} item={it} />)}
          </div>
        )}
      </div>
      <SiteFooter />
    </SiteShell>
  );
}
