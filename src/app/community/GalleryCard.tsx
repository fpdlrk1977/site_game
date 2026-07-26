import Link from 'next/link';
import { Heart, Repeat2 } from 'lucide-react';
import { thumbGradient } from '@/lib/thumbGradient';
import type { GalleryItem } from './queries';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

/** 갤러리/프로필 공용 작품 카드 */
export function GalleryCard({ item, showAuthor = true }: { item: GalleryItem; showAuthor?: boolean }) {
  return (
    <Link
      href={`/community/${item.id}`}
      className="group bg-surface border border-border rounded-xs overflow-hidden block transition-all duration-200 hover:border-border/50"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="aspect-[4/3] relative overflow-hidden" style={{ background: thumbGradient(item.id) }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 18%, rgba(255,255,255,.14), transparent 52%)' }} />
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />}
      </div>
      <div className="px-3.5 py-3">
        <div className="text-[.9rem] font-semibold truncate group-hover:text-primary transition-colors">{item.name}</div>
        <div className="flex items-center gap-2 mt-2 text-[.75rem] text-muted">
          {showAuthor && (
            <>
              <span className="w-[18px] h-[18px] rounded-full grid place-items-center text-white text-[.6rem] font-bold shrink-0" style={{ background: GRAD }}>
                {item.author.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{item.author.name}</span>
            </>
          )}
          <span className="ml-auto flex items-center gap-3 whitespace-nowrap tabular-nums">
            <span className="inline-flex items-center gap-1"><Heart size={12} /> {item.likes}</span>
            <span className="inline-flex items-center gap-1"><Repeat2 size={12} /> {item.remixes}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
