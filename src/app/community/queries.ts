import { createServiceSupabase, createSupabaseServer } from '@/lib/supabase-server';

// 소셜 테이블(0007 마이그레이션)이 아직 없어도 페이지가 렌더되도록 방어적으로 조회한다.
// supabase 쿼리 빌더는 thenable(PromiseLike)이므로 그 타입을 받는다.
async function safe<T>(fn: () => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const { data } = await fn();
    return data ?? [];
  } catch {
    return [];
  }
}
const countBy = <T extends Record<string, unknown>>(rows: T[], key: keyof T) => {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r[key] as string | null;
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

export interface Author { id: string; name: string; username: string | null; avatarUrl: string | null }
export interface GalleryItem {
  id: string; name: string; thumbnailUrl: string | null; sceneId: string | null;
  author: Author; tags: string[]; likes: number; remixes: number;
}

function authorFrom(prof: { id: string; username?: string; display_name?: string; avatar_url?: string | null } | undefined, ownerId: string): Author {
  return {
    id: ownerId,
    name: prof?.display_name || prof?.username || 'Anonymous creator',
    username: prof?.username ?? null,
    avatarUrl: prof?.avatar_url ?? null,
  };
}

export type GallerySort = 'recent' | 'popular';
export interface GalleryQuery { tag?: string; q?: string; sort?: GallerySort }

/**
 * 공개 프로젝트 갤러리.
 * 필터(tag/q)와 정렬(sort)은 **가져온 뒤 메모리에서** 적용한다 —
 * 좋아요/리믹스 수가 별도 테이블 집계라 DB 정렬로는 한 번에 못 얻고,
 * 공개 프로젝트 수가 아직 수백 규모라 이 편이 단순하고 정확하다.
 * (수천 개가 되면 집계 컬럼이나 뷰로 옮길 것.)
 */
export async function getGallery(
  query: GalleryQuery | string = {},
): Promise<{ items: GalleryItem[]; tags: string[]; featured: GalleryItem[] }> {
  const { tag, q, sort = 'recent' }: GalleryQuery = typeof query === 'string' ? { tag: query } : query;
  const svc = createServiceSupabase();
  // 기본 프로젝트 목록은 확실히 존재하는 컬럼만 조회 → 마이그레이션 전에도 동작
  let projects: Array<{ id: string; name: string; thumbnail_url: string | null; owner_id: string; default_scene_id: string | null }> = [];
  try {
    const { data } = await svc.from('projects')
      .select('id, name, thumbnail_url, owner_id, default_scene_id, created_at')
      .eq('is_published', true).order('created_at', { ascending: false }).limit(120);
    projects = (data ?? []) as typeof projects;
  } catch { projects = []; }
  if (projects.length === 0) return { items: [], tags: [], featured: [] };

  const ids = projects.map((p) => p.id);
  const owners = [...new Set(projects.map((p) => p.owner_id))];

  const [profiles, tagRows, likeRows, remixRows] = await Promise.all([
    safe<{ id: string; username: string; display_name: string; avatar_url: string | null }>(() =>
      svc.from('profiles').select('id, username, display_name, avatar_url').in('id', owners)),
    safe<{ id: string; tags: string[] }>(() => svc.from('projects').select('id, tags').in('id', ids)),
    safe<{ project_id: string }>(() => svc.from('project_likes').select('project_id').in('project_id', ids)),
    safe<{ remixed_from: string }>(() => svc.from('projects').select('remixed_from').in('remixed_from', ids)),
  ]);

  const pmap = new Map(profiles.map((p) => [p.id, p]));
  const tmap = new Map(tagRows.map((t) => [t.id, t.tags ?? []]));
  const likeCount = countBy(likeRows, 'project_id');
  const remixCount = countBy(remixRows, 'remixed_from');

  let items: GalleryItem[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    thumbnailUrl: p.thumbnail_url,
    sceneId: p.default_scene_id,
    author: authorFrom(pmap.get(p.owner_id), p.owner_id),
    tags: tmap.get(p.id) ?? [],
    likes: likeCount.get(p.id) ?? 0,
    remixes: remixCount.get(p.id) ?? 0,
  }));

  const allTags = [...new Set(items.flatMap((i) => i.tags))].sort().slice(0, 20);

  // Featured = 반응이 가장 많은 작품(리믹스는 좋아요보다 무겁게 친다 — 실제로 써 본 신호라서).
  // 필터가 걸리지 않았을 때만 의미가 있으므로 호출부에서 그때만 렌더한다.
  const featured = [...items]
    .filter((i) => i.likes + i.remixes > 0)
    .sort((a, b) => (b.likes + b.remixes * 2) - (a.likes + a.remixes * 2))
    .slice(0, 3);

  if (tag) items = items.filter((i) => i.tags.includes(tag));
  if (q) {
    const needle = q.trim().toLowerCase();
    if (needle) {
      items = items.filter((i) =>
        i.name.toLowerCase().includes(needle) ||
        i.author.name.toLowerCase().includes(needle) ||
        i.tags.some((t) => t.toLowerCase().includes(needle)));
    }
  }
  if (sort === 'popular') items.sort((a, b) => (b.likes + b.remixes * 2) - (a.likes + a.remixes * 2));

  return { items, tags: allTags, featured };
}

export interface ProfilePage {
  author: Author;
  bio: string | null;
  joinedAt: string | null;
  works: GalleryItem[];
  liked: GalleryItem[];
  followers: number;
  following: number;
  totalLikes: number;
  viewerFollows: boolean;
  viewerIsSelf: boolean;
  viewerId: string | null;
}

/**
 * 공개 프로필 — 작품 / 좋아요한 작품 / 팔로워.
 * 공개(published) 프로젝트만 노출한다(본인이 봐도 동일 — 프로필은 "공개된 모습"이므로).
 */
export async function getProfile(username: string): Promise<ProfilePage | null> {
  const svc = createServiceSupabase();
  const profRows = await safe<{ id: string; username: string; display_name: string; avatar_url: string | null; bio: string | null; created_at: string }>(
    () => svc.from('profiles').select('id, username, display_name, avatar_url, bio, created_at').eq('username', username).limit(1),
  );
  const prof = profRows[0];
  if (!prof) return null;

  const authed = await createSupabaseServer();
  const { data: { user } } = await authed.auth.getUser();

  const [works, likedRows, followerRows, followingRows] = await Promise.all([
    safe<{ id: string; name: string; thumbnail_url: string | null; default_scene_id: string | null; tags: string[] | null }>(
      () => svc.from('projects').select('id, name, thumbnail_url, default_scene_id, tags, created_at')
        .eq('owner_id', prof.id).eq('is_published', true).order('created_at', { ascending: false }).limit(60)),
    safe<{ project_id: string }>(() => svc.from('project_likes').select('project_id').eq('user_id', prof.id).limit(60)),
    safe<{ follower_id: string }>(() => svc.from('user_follows').select('follower_id').eq('following_id', prof.id)),
    safe<{ following_id: string }>(() => svc.from('user_follows').select('following_id').eq('follower_id', prof.id)),
  ]);

  const author = authorFrom(prof, prof.id);
  const workIds = works.map((w) => w.id);

  // 이 작가 작품들이 받은 좋아요·리믹스 수
  const [likeRows, remixRows] = await Promise.all([
    workIds.length ? safe<{ project_id: string }>(() => svc.from('project_likes').select('project_id').in('project_id', workIds)) : Promise.resolve([]),
    workIds.length ? safe<{ remixed_from: string }>(() => svc.from('projects').select('remixed_from').in('remixed_from', workIds)) : Promise.resolve([]),
  ]);
  const likeCount = countBy(likeRows, 'project_id');
  const remixCount = countBy(remixRows, 'remixed_from');

  const items: GalleryItem[] = works.map((w) => ({
    id: w.id, name: w.name, thumbnailUrl: w.thumbnail_url, sceneId: w.default_scene_id,
    author, tags: w.tags ?? [], likes: likeCount.get(w.id) ?? 0, remixes: remixCount.get(w.id) ?? 0,
  }));

  // 좋아요한 작품(공개된 것만) — 갤러리에서 골라 온다
  const likedIds = new Set(likedRows.map((l) => l.project_id));
  const gallery = likedIds.size ? (await getGallery()).items.filter((g) => likedIds.has(g.id)).slice(0, 8) : [];

  return {
    author,
    bio: prof.bio ?? null,
    joinedAt: prof.created_at ?? null,
    works: items,
    liked: gallery,
    followers: followerRows.length,
    following: followingRows.length,
    totalLikes: items.reduce((s, i) => s + i.likes, 0),
    viewerFollows: !!user && followerRows.some((f) => f.follower_id === user.id),
    viewerIsSelf: !!user && user.id === prof.id,
    viewerId: user?.id ?? null,
  };
}

export interface Comment { id: string; body: string; createdAt: string; author: Author }
export interface WorkDetail {
  id: string; name: string; description: string | null; thumbnailUrl: string | null; sceneId: string | null;
  isPublished: boolean; ownerId: string; author: Author; tags: string[];
  likes: number; remixes: number; comments: Comment[];
  followers: number; viewerLiked: boolean; viewerFollows: boolean; viewerIsOwner: boolean; viewerId: string | null;
  remixedFrom: { id: string; name: string } | null;
  more: GalleryItem[]; similar: GalleryItem[];
}

/** 작품 상세(레퍼런스 4) — 프로젝트 + 소셜 + 뷰어 상태 */
interface ProjRow {
  id: string; name: string; description: string | null; thumbnail_url: string | null;
  owner_id: string; default_scene_id: string | null; is_published: boolean;
}

export async function getWorkDetail(projectId: string): Promise<WorkDetail | null> {
  const svc = createServiceSupabase();
  let proj: ProjRow | null = null;
  try {
    const { data } = await svc.from('projects')
      .select('id, name, description, thumbnail_url, owner_id, default_scene_id, is_published')
      .eq('id', projectId).single();
    proj = (data ?? null) as ProjRow | null;
  } catch { proj = null; }
  if (!proj) return null;
  const project: ProjRow = proj;

  const authed = await createSupabaseServer();
  const { data: { user } } = await authed.auth.getUser();
  const viewerIsOwner = !!user && user.id === project.owner_id;
  if (!project.is_published && !viewerIsOwner) return null; // 비공개는 소유자만

  const [profRows, tagRows, likeRows, followRows, commentRows, remixRows, remixSrcRows] = await Promise.all([
    safe<{ id: string; username: string; display_name: string; avatar_url: string | null }>(() =>
      svc.from('profiles').select('id, username, display_name, avatar_url').eq('id', project.owner_id)),
    safe<{ tags: string[] }>(() => svc.from('projects').select('tags').eq('id', projectId)),
    safe<{ user_id: string }>(() => svc.from('project_likes').select('user_id').eq('project_id', projectId)),
    safe<{ follower_id: string }>(() => svc.from('user_follows').select('follower_id').eq('following_id', project.owner_id)),
    safe<{ id: string; body: string; created_at: string; user_id: string }>(() =>
      svc.from('project_comments').select('id, body, created_at, user_id').eq('project_id', projectId).order('created_at', { ascending: false }).limit(50)),
    safe<{ remixed_from: string }>(() => svc.from('projects').select('remixed_from').eq('remixed_from', projectId)),
    safe<{ remixed_from: string | null }>(() => svc.from('projects').select('remixed_from').eq('id', projectId)),
  ]);

  const prof = profRows[0];
  const author = authorFrom(prof, project.owner_id);
  const tags = tagRows[0]?.tags ?? [];
  const likes = likeRows.length;
  const viewerLiked = !!user && likeRows.some((l) => l.user_id === user.id);
  const followers = followRows.length;
  const viewerFollows = !!user && followRows.some((f) => f.follower_id === user.id);

  // 댓글 작성자 프로필
  const commenterIds = [...new Set(commentRows.map((c) => c.user_id))];
  const commenters = commenterIds.length
    ? await safe<{ id: string; username: string; display_name: string; avatar_url: string | null }>(() =>
        svc.from('profiles').select('id, username, display_name, avatar_url').in('id', commenterIds))
    : [];
  const cmap = new Map(commenters.map((c) => [c.id, c]));
  const comments: Comment[] = commentRows.map((c) => ({
    id: c.id, body: c.body, createdAt: c.created_at, author: authorFrom(cmap.get(c.user_id), c.user_id),
  }));

  // 리믹스 출처
  let remixedFrom: { id: string; name: string } | null = null;
  const srcId = remixSrcRows[0]?.remixed_from ?? null;
  if (srcId) {
    const rows = await safe<{ id: string; name: string }>(() => svc.from('projects').select('id, name').eq('id', srcId));
    if (rows[0]) remixedFrom = rows[0];
  }

  // 작가의 다른 작품 + 비슷한 작품(간단히 최신 공개작)
  const gallery = await getGallery();
  const more = gallery.items.filter((i) => i.author.id === project.owner_id && i.id !== projectId).slice(0, 3);
  const similar = gallery.items.filter((i) => i.id !== projectId && i.author.id !== project.owner_id).slice(0, 3);

  return {
    id: project.id, name: project.name, description: project.description, thumbnailUrl: project.thumbnail_url,
    sceneId: project.default_scene_id, isPublished: project.is_published, ownerId: project.owner_id,
    author, tags, likes, remixes: remixRows.length, comments,
    followers, viewerLiked, viewerFollows, viewerIsOwner, viewerId: user?.id ?? null,
    remixedFrom, more, similar,
  };
}
