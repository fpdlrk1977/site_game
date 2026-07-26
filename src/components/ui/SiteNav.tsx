import Link from 'next/link';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

export type SiteNavKey = 'features' | 'gallery' | 'pricing' | null;

const LINKS: Array<{ key: Exclude<SiteNavKey, null>; href: string; label: string }> = [
  { key: 'features', href: '/#features', label: 'Features' },
  { key: 'gallery', href: '/community', label: 'Gallery' },
  { key: 'pricing', href: '/pricing', label: 'Pricing' },
];

/**
 * 공개 페이지 공용 상단 내비게이션 (SiteShell의 `nav` 슬롯에 넣는다).
 * 커뮤니티·요금제·프로필·약관이 각자 복제하던 마크업을 하나로 모은 것.
 */
export function SiteNav({ active = null, loggedIn }: { active?: SiteNavKey; loggedIn: boolean }) {
  return (
    <div className="max-w-[1180px] mx-auto px-7 h-full flex items-center gap-7">
      <Link href="/" className="flex items-center gap-2.5 font-bold text-[1.02rem] shrink-0">
        <span className="w-[28px] h-[28px] rounded-xs grid place-items-center text-white text-[.85rem]" style={{ background: GRAD }}>⬡</span>
        Park3D
      </Link>
      <div className="hidden md:flex gap-6 text-sm text-foreground/70">
        {LINKS.map((l) => (
          <Link key={l.key} href={l.href}
            className={active === l.key ? 'text-foreground font-medium' : 'hover:text-foreground transition-colors'}>
            {l.label}
          </Link>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Link href={loggedIn ? '/dashboard' : '/login'} className="text-sm text-foreground/70 hover:text-foreground transition-colors">
          {loggedIn ? 'Dashboard' : 'Log in'}
        </Link>
        {!loggedIn && (
          <Link href="/signup" className="px-4 py-2 rounded-xs text-sm font-semibold text-white" style={{ background: GRAD }}>
            Get started
          </Link>
        )}
      </div>
    </div>
  );
}
