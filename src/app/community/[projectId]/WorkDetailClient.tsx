'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Repeat2, Users, Link2, Share2, Play } from 'lucide-react';
import type { WorkDetail, Author } from '../queries';
import { toggleLike, toggleFollow, addComment, remixProject } from '../actions';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';
function bgFor(id: string) {
  const p = ['linear-gradient(145deg,#f4a3c9,#c9689e)', 'linear-gradient(145deg,#8b78ff,#4a2fd0)', 'linear-gradient(145deg,#39d0ea,#1583b0)', 'linear-gradient(145deg,#f2c14e,#d98a2b)', 'linear-gradient(145deg,#6a4dff,#c04aff)', 'linear-gradient(145deg,#2dd4bf,#0d9488)'];
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return p[Math.abs(h) % p.length];
}
function Avatar({ author, size = 30 }: { author: Author; size?: number }) {
  return author.avatarUrl
    ? <img src={author.avatarUrl} alt={author.name} className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="rounded-full grid place-items-center text-white font-bold" style={{ width: size, height: size, background: GRAD, fontSize: size * 0.4 }}>{author.name.charAt(0).toUpperCase()}</span>;
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return '방금'; if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`; return `${Math.floor(d / 86400)}일 전`;
}

export function WorkDetailClient({ detail, loggedIn }: { detail: WorkDetail; loggedIn: boolean }) {
  const router = useRouter();
  const [liked, setLiked] = useState(detail.viewerLiked);
  const [likes, setLikes] = useState(detail.likes);
  const [follows, setFollows] = useState(detail.viewerFollows);
  const [followers, setFollowers] = useState(detail.followers);
  const [comment, setComment] = useState('');
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const needLogin = () => { router.push('/login'); };

  const onLike = () => {
    if (!loggedIn) return needLogin();
    setLiked((v) => !v); setLikes((n) => n + (liked ? -1 : 1));
    start(() => { toggleLike(detail.id); });
  };
  const onFollow = () => {
    if (!loggedIn) return needLogin();
    setFollows((v) => !v); setFollowers((n) => n + (follows ? -1 : 1));
    start(() => { toggleFollow(detail.ownerId); });
  };
  const onComment = () => {
    if (!loggedIn) return needLogin();
    const body = comment.trim(); if (!body) return;
    setComment('');
    start(async () => { await addComment(detail.id, body); router.refresh(); });
  };
  const onRemix = () => {
    if (!loggedIn) return needLogin();
    start(() => { remixProject(detail.id); });
  };
  const onCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xs text-sm border border-border bg-surface hover:bg-white/[0.04] transition-colors';

  return (
    <main className="max-w-[1180px] mx-auto px-7 py-8 grid lg:grid-cols-[1fr_300px] gap-8">
      {/* main column */}
      <div className="min-w-0">
        {/* preview */}
        <div className="rounded-xl border border-border overflow-hidden relative" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="aspect-[16/9] relative" style={{ background: bgFor(detail.id) }}>
            {detail.thumbnailUrl && <img src={detail.thumbnailUrl} alt={detail.name} className="absolute inset-0 w-full h-full object-cover" />}
            {detail.sceneId && (
              <Link href={`/space/${detail.sceneId}`} className="absolute inset-0 grid place-items-center group">
                <span className="flex items-center gap-2 px-5 py-3 rounded-full text-white font-semibold backdrop-blur-md bg-black/40 border border-white/20 group-hover:bg-black/55 transition-colors">
                  <Play size={18} /> 3D로 열기
                </span>
              </Link>
            )}
          </div>
        </div>

        {/* title + author + stats */}
        <div className="mt-5 flex items-start gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.5rem] font-bold tracking-tight">{detail.name}</h1>
            <div className="flex items-center gap-2.5 mt-2">
              <Avatar author={detail.author} />
              <div>
                <div className="text-sm font-semibold">{detail.author.name}</div>
                <div className="text-[.76rem] text-muted">{followers.toLocaleString()} 팔로워</div>
              </div>
              {!detail.viewerIsOwner && (
                <button onClick={onFollow} disabled={pending}
                  className={`ml-2 px-3.5 py-1.5 rounded-xs text-sm font-semibold ${follows ? 'border border-border bg-surface text-muted' : 'text-white'}`}
                  style={follows ? {} : { background: GRAD }}>{follows ? '팔로잉' : '+ 팔로우'}</button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onLike} disabled={pending} className={btn} style={liked ? { color: '#ff6b9d', borderColor: 'rgba(255,107,157,.4)' } : {}}>
              <Heart size={15} fill={liked ? '#ff6b9d' : 'none'} /> {likes.toLocaleString()}
            </button>
            <span className={btn} style={{ pointerEvents: 'none' }}><Repeat2 size={15} /> {detail.remixes.toLocaleString()}</span>
            <button onClick={onRemix} disabled={pending} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xs text-sm font-semibold text-white" style={{ background: GRAD }}>
              <Repeat2 size={15} /> 리믹스
            </button>
          </div>
        </div>

        {/* description + tags */}
        {detail.description && <p className="mt-5 text-[.95rem] text-foreground/90 leading-relaxed">{detail.description}</p>}
        {detail.remixedFrom && (
          <p className="mt-3 text-[.82rem] text-muted">⇄ <Link href={`/community/${detail.remixedFrom.id}`} className="text-primary hover:underline">{detail.remixedFrom.name}</Link> 에서 리믹스됨</p>
        )}
        {detail.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {detail.tags.map((t) => (
              <Link key={t} href={`/community?tag=${encodeURIComponent(t)}`} className="text-[.8rem] text-primary hover:underline">#{t}</Link>
            ))}
          </div>
        )}

        {/* comments */}
        <div className="mt-9 pt-7 border-t border-border">
          <h2 className="font-semibold mb-4">{detail.comments.length} 댓글</h2>
          <div className="flex gap-3 mb-6">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={loggedIn ? '생각·응원·피드백을 남겨보세요' : '댓글을 남기려면 로그인하세요'}
              rows={1} className="flex-1 bg-surface border border-border rounded-xs px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-primary" />
            <button onClick={onComment} disabled={pending || !comment.trim()} className="px-4 rounded-xs text-sm font-semibold text-white disabled:opacity-50" style={{ background: GRAD }}>등록</button>
          </div>
          <div className="space-y-5">
            {detail.comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar author={c.author} size={30} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[.82rem]"><b className="font-semibold">{c.author.name}</b><span className="text-muted">{timeAgo(c.createdAt)}</span></div>
                  <p className="text-[.9rem] text-foreground/90 mt-0.5 break-words">{c.body}</p>
                </div>
              </div>
            ))}
            {detail.comments.length === 0 && <p className="text-sm text-muted">첫 댓글을 남겨보세요.</p>}
          </div>
        </div>
      </div>

      {/* right rail */}
      <aside className="space-y-7">
        <div>
          <div className="text-[.8rem] font-semibold text-muted mb-2.5">공유</div>
          <div className="flex gap-2">
            <button onClick={onCopyLink} className={btn} title="링크 복사"><Link2 size={15} /> {copied ? '복사됨' : '링크'}</button>
            <span className={btn} style={{ pointerEvents: 'none' }}><Share2 size={15} /></span>
          </div>
        </div>

        {detail.more.length > 0 && (
          <div>
            <div className="text-[.8rem] font-semibold text-muted mb-2.5">{detail.author.name}의 다른 작품</div>
            <div className="grid grid-cols-3 gap-2">
              {detail.more.map((m) => (
                <Link key={m.id} href={`/community/${m.id}`} className="aspect-square rounded-md overflow-hidden border border-border relative" style={{ background: bgFor(m.id) }}>
                  {m.thumbnailUrl && <img src={m.thumbnailUrl} alt={m.name} className="absolute inset-0 w-full h-full object-cover" />}
                </Link>
              ))}
            </div>
          </div>
        )}

        {detail.similar.length > 0 && (
          <div>
            <div className="text-[.8rem] font-semibold text-muted mb-2.5">비슷한 작품</div>
            <div className="space-y-2.5">
              {detail.similar.map((s) => (
                <Link key={s.id} href={`/community/${s.id}`} className="flex gap-3 items-center group">
                  <span className="w-16 h-12 rounded-md overflow-hidden border border-border relative flex-none" style={{ background: bgFor(s.id) }}>
                    {s.thumbnailUrl && <img src={s.thumbnailUrl} alt={s.name} className="absolute inset-0 w-full h-full object-cover" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[.85rem] font-medium truncate group-hover:text-primary">{s.name}</span>
                    <span className="block text-[.74rem] text-muted truncate">{s.author.name} · ♡ {s.likes}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="pt-5 border-t border-border text-[.8rem] text-muted space-y-2">
          <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-[5px] grid place-items-center text-white text-[.55rem]" style={{ background: GRAD }}>⬡</span> Park3D로 제작</div>
          <div className="flex items-center gap-2 text-[.78rem]"><Users size={13} /> {followers.toLocaleString()} 팔로워 · ♡ {likes.toLocaleString()}</div>
        </div>
      </aside>
    </main>
  );
}
