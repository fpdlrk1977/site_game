import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Heart, Box, Users, Settings } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getProfile } from '@/app/community/queries';
import { GalleryCard } from '@/app/community/GalleryCard';
import { SiteShell } from '@/components/ui/SiteShell';
import { SiteNav } from '@/components/ui/SiteNav';
import { SiteFooter } from '@/components/ui/SiteFooter';
import { FollowButton } from './FollowButton';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await getProfile(username);
  if (!p) return { title: 'Creator not found — Park3D' };
  return {
    title: `${p.author.name} (@${p.author.username}) — Park3D`,
    description: p.bio ?? `3D spaces built by ${p.author.name} on Park3D.`,
  };
}

function StatCell({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 h-7 rounded-xs grid place-items-center bg-foreground/[0.04] text-foreground shrink-0">{icon}</span>
      <span className="leading-tight">
        <b className="block text-[.95rem] tabular-nums">{value.toLocaleString()}</b>
        <span className="text-[.72rem] text-muted">{label}</span>
      </span>
    </div>
  );
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [profile, supabase] = await Promise.all([getProfile(username), createSupabaseServer()]);
  if (!profile) notFound();
  const { data: { user } } = await supabase.auth.getUser();

  const initial = profile.author.name.charAt(0).toUpperCase();
  const joined = profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : null;

  return (
    <SiteShell nav={<SiteNav active="gallery" loggedIn={!!user} />}>
      <div className="max-w-[1180px] mx-auto px-7 py-12">
        {/* 헤더 */}
        <div className="flex items-start gap-5 flex-wrap">
          <span className="w-[72px] h-[72px] rounded-xs grid place-items-center text-white text-2xl font-bold shrink-0" style={{ background: GRAD }}>
            {profile.author.avatarUrl
              ? <img src={profile.author.avatarUrl} alt="" className="w-full h-full object-cover rounded-xs" />
              : initial}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.55rem] font-bold tracking-tight truncate">{profile.author.name}</h1>
            <p className="text-muted text-sm mt-0.5">@{profile.author.username}{joined && ` · Joined ${joined}`}</p>
            {profile.bio && <p className="text-[.92rem] mt-3 max-w-[60ch] leading-relaxed">{profile.bio}</p>}
          </div>
          <div className="shrink-0">
            {profile.viewerIsSelf ? (
              <Link href="/account" className="inline-flex items-center gap-2 px-4 py-2 rounded-xs border border-border bg-surface text-sm hover:border-border/60 transition-colors">
                <Settings size={15} /> Edit profile
              </Link>
            ) : (
              <FollowButton targetId={profile.author.id} initial={profile.viewerFollows} loggedIn={!!user} />
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-7 mt-7 pb-7 border-b border-border">
          <StatCell icon={<Box size={14} />} value={profile.works.length} label="Published" />
          <StatCell icon={<Heart size={14} />} value={profile.totalLikes} label="Likes received" />
          <StatCell icon={<Users size={14} />} value={profile.followers} label="Followers" />
          <StatCell icon={<Users size={14} />} value={profile.following} label="Following" />
        </div>

        {/* 작품 */}
        <section className="mt-9">
          <h2 className="text-[1.05rem] font-semibold mb-4">Works</h2>
          {profile.works.length === 0 ? (
            <div className="text-center py-20 border border-border rounded-xs bg-surface">
              <div className="inline-flex w-12 h-12 rounded-xs border border-border items-center justify-center text-muted mb-3"><Box size={20} /></div>
              <p className="text-sm text-muted">
                {profile.viewerIsSelf ? 'Publish a project and it will appear here.' : 'No published work yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {profile.works.map((w) => <GalleryCard key={w.id} item={w} showAuthor={false} />)}
            </div>
          )}
        </section>

        {/* 좋아요한 작품 */}
        {profile.liked.length > 0 && (
          <section className="mt-11">
            <h2 className="text-[1.05rem] font-semibold mb-4">Likes</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {profile.liked.map((w) => <GalleryCard key={w.id} item={w} />)}
            </div>
          </section>
        )}
      </div>
      <SiteFooter />
    </SiteShell>
  );
}
