import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase-server';
import { SiteShell } from '@/components/ui/SiteShell';
import { SiteNav } from '@/components/ui/SiteNav';
import { SiteFooter } from '@/components/ui/SiteFooter';
import { SITE_INFO } from '@/lib/siteInfo';

/** 문서 페이지 공용 셸 — 좁은 단, 큰 행간, 목차 없는 단순 구조 */
export async function LegalPage({ title, intro, draftNotice = true, children }: {
  title: string;
  intro?: string;
  /** 법률 검토 전 초안이라는 사실을 숨기지 않는다 */
  draftNotice?: boolean;
  children: ReactNode;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <SiteShell nav={<SiteNav loggedIn={!!user} />}>
      <article className="max-w-[760px] mx-auto px-7 py-16">
        <h1 className="text-[2rem] font-bold tracking-tight">{title}</h1>
        <p className="text-muted text-sm mt-2">Last updated {SITE_INFO.effectiveDate}</p>
        {intro && <p className="mt-6 text-[.95rem] leading-relaxed text-foreground/85">{intro}</p>}

        {draftNotice && (
          <div className="flex items-start gap-2.5 mt-8 p-4 rounded-xs border border-border bg-surface text-[.82rem] leading-relaxed">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-foreground" />
            <span className="text-muted">
              This document is a working draft prepared for the current pre-billing stage of the service.
              It has not been reviewed by legal counsel and must be before paid plans launch.
            </span>
          </div>
        )}

        <div className="legal-body mt-10">{children}</div>
      </article>
      <SiteFooter />
    </SiteShell>
  );
}

/** 문서 섹션 — 번호는 CSS 카운터 대신 호출부에서 명시(문서 인용 시 번호가 고정돼야 함) */
export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="text-[1.05rem] font-semibold mb-3">{n}. {title}</h2>
      <div className="text-[.92rem] leading-[1.75] text-foreground/85 space-y-3">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-muted">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}
