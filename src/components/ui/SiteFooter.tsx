import Link from 'next/link';
import { SITE_INFO, filledBusinessRows } from '@/lib/siteInfo';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

const COLUMNS: Array<{ title: string; links: Array<{ label: string; href: string; external?: boolean }> }> = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'Gallery', href: '/community' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Templates', href: '/dashboard' },
      { label: 'Changelog', href: '/legal/changelog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Terms of Service', href: '/legal/terms' },
      { label: 'Privacy Policy', href: '/legal/privacy' },
    ],
  },
];

/** 공개 페이지 공용 푸터 — 링크는 전부 실제 존재하는 라우트만 둔다(죽은 링크 금지) */
export function SiteFooter() {
  const rows = filledBusinessRows();
  return (
    <footer className="w-full border-t border-border mt-20">
      <div className="max-w-[1240px] mx-auto px-7 py-14">
        <div className="flex flex-wrap gap-x-16 gap-y-10">
          <div className="min-w-[220px]">
            <Link href="/" className="inline-flex items-center gap-2.5 font-bold text-foreground">
              <span className="w-[26px] h-[26px] rounded-xs grid place-items-center text-white text-[.8rem]" style={{ background: GRAD }}>⬡</span>
              {SITE_INFO.serviceName}
            </Link>
            <p className="text-[.82rem] text-muted mt-3 max-w-[30ch] leading-relaxed">
              Build and publish interactive 3D spaces — no code required.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-[.7rem] uppercase tracking-[.12em] text-muted/70 font-bold mb-3">{col.title}</div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="text-[.85rem] text-foreground/70 hover:text-foreground transition-colors">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {rows.length > 0 && (
          <div className="mt-12 pt-6 border-t border-border text-[.75rem] text-muted/80 leading-relaxed">
            {rows.map(([k, v]) => <span key={k} className="mr-4 inline-block">{k}: {v}</span>)}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[.8rem] text-muted/70">
          <span>© {new Date().getFullYear()} {SITE_INFO.legalName || SITE_INFO.serviceName}</span>
          <a href={`mailto:${SITE_INFO.supportEmail}`} className="hover:text-foreground transition-colors">{SITE_INFO.supportEmail}</a>
        </div>
      </div>
    </footer>
  );
}
