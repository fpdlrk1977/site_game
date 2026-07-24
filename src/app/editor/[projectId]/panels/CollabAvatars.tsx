'use client';

import { useCollabStore } from '@/store/collabStore';
import { useUserStore } from '@/store/userStore';
import { peerColor, shortName } from '@/store/collabStore';

/**
 * 접속자 아바타 클러스터 (M1, AC④).
 * 나 + 원격 참가자를 유저별 색 원으로 표시. 협업자가 있을 때만 노출.
 */
export function CollabAvatars() {
  const peers = useCollabStore((s) => s.peers);
  const connected = useCollabStore((s) => s.connected);
  const email = useUserStore((s) => s.email);
  const userId = useUserStore((s) => s.userId);

  // 나 혼자면 숨김(협업 중일 때만 의미)
  if (!connected || peers.length === 0) return null;

  const meName = shortName(email ?? '나');
  const meColor = userId ? peerColor(userId) : '#888';

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 px-2.5 h-9 rounded-md bg-surface/95 border border-border shadow-float">
      <span className="text-[10px] text-muted mr-0.5">함께 편집 중</span>
      <div className="flex -space-x-1.5">
        <Avatar name={meName} color={meColor} title={`${meName} (나)`} me />
        {peers.map((p) => (
          <Avatar key={p.key} name={p.name} color={p.color} title={p.name} />
        ))}
      </div>
    </div>
  );
}

function Avatar({ name, color, title, me }: { name: string; color: string; title: string; me?: boolean }) {
  return (
    <div
      title={title}
      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-surface"
      style={{ backgroundColor: color }}
    >
      {name.charAt(0).toUpperCase()}
      {me && <span className="sr-only">(나)</span>}
    </div>
  );
}
