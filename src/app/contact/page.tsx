import Link from 'next/link';
import { Mail, LifeBuoy, Bug, Building2 } from 'lucide-react';
import { createSupabaseServer } from '@/lib/supabase-server';
import { SiteShell } from '@/components/ui/SiteShell';
import { SiteNav } from '@/components/ui/SiteNav';
import { SiteFooter } from '@/components/ui/SiteFooter';
import { SITE_INFO } from '@/lib/siteInfo';

export const metadata = { title: 'Contact — Park3D', description: 'How to reach the Park3D team.' };

const TOPICS = [
  {
    icon: <LifeBuoy size={18} />,
    title: 'Help with the editor',
    body: 'Stuck on something? Tell us what you were trying to build and paste the project link — that is usually enough for us to reproduce it.',
    subject: 'Help with the editor',
  },
  {
    icon: <Bug size={18} />,
    title: 'Report a bug',
    body: 'Include what you did, what you expected, and what happened instead. A screenshot or the browser console output helps a lot.',
    subject: 'Bug report',
  },
  {
    icon: <Building2 size={18} />,
    title: 'Business & partnerships',
    body: 'Custom domains, embedding on a company site, volume plans, or anything that needs a contract.',
    subject: 'Business enquiry',
  },
];

export default async function ContactPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const mailto = (subject: string) => `mailto:${SITE_INFO.supportEmail}?subject=${encodeURIComponent(`[${SITE_INFO.serviceName}] ${subject}`)}`;

  return (
    <SiteShell nav={<SiteNav loggedIn={!!user} />}>
      <div className="max-w-[760px] mx-auto px-7 py-16">
        <h1 className="text-[2rem] font-bold tracking-tight">Contact</h1>
        <p className="text-[.95rem] text-muted mt-3 leading-relaxed">
          We reply by email. There is no contact form here on purpose — a form that quietly loses your message is
          worse than none.
        </p>

        <a href={mailto('Hello')}
          className="inline-flex items-center gap-2.5 mt-7 px-5 py-3 rounded-xs text-white font-semibold text-[.92rem]"
          style={{ background: 'linear-gradient(120deg,#6a4dff,#39d0ea)' }}>
          <Mail size={17} /> {SITE_INFO.supportEmail}
        </a>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
          {TOPICS.map((t) => (
            <a key={t.title} href={mailto(t.subject)}
              className="bg-surface border border-border rounded-xs p-5 transition-colors hover:border-border/50 block">
              <span className="w-9 h-9 rounded-xs grid place-items-center bg-foreground/[0.04] text-foreground mb-3">{t.icon}</span>
              <span className="block text-[.92rem] font-semibold">{t.title}</span>
              <span className="block text-[.8rem] text-muted mt-1.5 leading-relaxed">{t.body}</span>
            </a>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-border text-[.88rem] text-muted leading-relaxed">
          <p>
            Looking for the rules instead? See the{' '}
            <Link href="/legal/terms" className="text-primary hover:underline">Terms of Service</Link> and{' '}
            <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>. Recent
            releases are listed in the <Link href="/legal/changelog" className="text-primary hover:underline">changelog</Link>.
          </p>
        </div>
      </div>
      <SiteFooter />
    </SiteShell>
  );
}
