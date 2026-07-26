import { LegalPage, Bullets } from '../LegalPage';

export const metadata = { title: 'Changelog — Park3D', description: 'What shipped recently in Park3D.' };

/** 실제로 배포된 것만 적는다. 예정 기능은 여기 쓰지 않는다. */
const ENTRIES: Array<{ date: string; title: string; items: string[] }> = [
  {
    date: '2026-07-26',
    title: 'Analytics, profiles, and a way in',
    items: [
      'Analytics dashboard — daily views, most visited spaces, most interacted objects (Pro).',
      'Public creator profiles at /u/username, with follow.',
      'Community gallery: search, Newest/Popular sorting, and a "Most loved" row.',
      'Templates moved out of the editor onto the dashboard — one click from template to editor.',
      'Onboarding checklist that tracks your first space from creation to first visitor.',
      'Terms, Privacy, and Contact pages.',
    ],
  },
  {
    date: '2026-07-25',
    title: 'Landing, community, and app shell',
    items: [
      'New landing page with an interactive 3D hero.',
      'Community gallery with likes, comments, follows, tags, and one-click remix.',
      'Consistent app shell across all non-editor pages; light mode is now the default.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'Accounts and multiplayer editing',
    items: [
      'Dedicated sign-up flow with a completion step.',
      'Real-time collaborative editing — see other people’s cursors, selections, and edits.',
      'Asset tags for organizing models and characters.',
      'Custom domains can now serve more than one scene.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <LegalPage title="Changelog" intro="What has actually shipped, newest first." draftNotice={false}>
      <div className="space-y-10">
        {ENTRIES.map((e) => (
          <section key={e.date}>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-[.75rem] tabular-nums text-muted">{e.date}</span>
              <h2 className="text-[1.05rem] font-semibold">{e.title}</h2>
            </div>
            <div className="text-[.92rem] leading-[1.75] text-foreground/85">
              <Bullets items={e.items} />
            </div>
          </section>
        ))}
      </div>
    </LegalPage>
  );
}
