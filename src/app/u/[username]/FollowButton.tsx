'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, UserCheck } from 'lucide-react';
import { toggleFollow } from '@/app/community/actions';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

/** 팔로우 토글 — 낙관적 갱신 후 실패하면 되돌린다 */
export function FollowButton({ targetId, initial, loggedIn }: { targetId: string; initial: boolean; loggedIn: boolean }) {
  const [following, setFollowing] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!loggedIn) {
    return (
      <a href="/login" className="inline-flex items-center gap-2 px-4 py-2 rounded-xs text-sm font-semibold text-white" style={{ background: GRAD }}>
        <UserPlus size={15} /> Follow
      </a>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => {
        const next = !following;
        setFollowing(next);
        start(async () => {
          const res = await toggleFollow(targetId);
          setFollowing(res.following);
          router.refresh();
        });
      }}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xs text-sm font-semibold transition-colors disabled:opacity-60 ${
        following ? 'border border-border bg-surface text-foreground hover:border-border/60' : 'text-white'
      }`}
      style={following ? undefined : { background: GRAD }}
    >
      {following ? <><UserCheck size={15} /> Following</> : <><UserPlus size={15} /> Follow</>}
    </button>
  );
}
