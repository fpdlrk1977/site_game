'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, X, ArrowRight } from 'lucide-react';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';
const DISMISS_KEY = 'park3d.onboarding.dismissed';

/**
 * 가입 → 첫 게시까지의 진행 상태.
 * 전부 "이미 DB에 있는 값"으로만 판정한다(별도 추적 테이블 없음).
 */
export interface OnboardingState {
  hasProject: boolean;
  hasPublished: boolean;
  hasVisitor: boolean;
  hasRemixed: boolean;
}

interface Step {
  key: keyof OnboardingState;
  title: string;
  hint: string;
  cta: string;
  href: (firstProjectId: string | null) => string;
}

const STEPS: Step[] = [
  {
    key: 'hasProject',
    title: 'Create your first 3D space',
    hint: 'Pick a template below — it opens straight in the editor.',
    cta: 'Pick a template',
    href: () => '#',
  },
  {
    key: 'hasPublished',
    title: 'Publish it',
    hint: 'Publishing gives your space a public link and lists it in the gallery.',
    cta: 'Open editor',
    href: (id) => (id ? `/editor/${id}` : '/dashboard'),
  },
  {
    key: 'hasVisitor',
    title: 'Share the link and get your first visitor',
    hint: 'Send the link to someone — visits show up in Analytics.',
    cta: 'View analytics',
    href: () => '/dashboard/analytics',
  },
  {
    key: 'hasRemixed',
    title: 'Remix someone else’s space',
    hint: 'The fastest way to learn what this editor can do.',
    cta: 'Explore gallery',
    href: () => '/community',
  },
];

export function OnboardingChecklist({ state, firstProjectId }: { state: OnboardingState; firstProjectId: string | null }) {
  // 서버/클라이언트 마크업이 갈리지 않도록 마운트 후에만 localStorage를 읽는다.
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    setReady(true);
  }, []);

  const done = STEPS.filter((s) => state[s.key]).length;
  const allDone = done === STEPS.length;

  // 다 끝났거나 사용자가 닫았으면 자리를 비운다(완료 후에도 남아 있으면 잔소리가 된다).
  if (!ready || dismissed || allDone) return null;

  const next = STEPS.find((s) => !state[s.key])!;

  return (
    <section className="relative bg-surface border border-border rounded-xs p-6 mb-9 overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: GRAD, width: `${(done / STEPS.length) * 100}%` }} />

      <button onClick={() => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); }}
        title="Hide this" className="absolute top-4 right-4 w-7 h-7 rounded-xs grid place-items-center text-muted hover:text-foreground transition-colors">
        <X size={15} />
      </button>

      <div className="flex items-baseline gap-3">
        <h2 className="text-[1.02rem] font-semibold">Get your first space live</h2>
        <span className="text-[.78rem] text-muted tabular-nums">{done} of {STEPS.length} done</span>
      </div>

      <ol className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3.5">
        {STEPS.map((s, i) => {
          const ok = state[s.key];
          const isNext = s.key === next.key;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 mt-0.5 text-[.68rem] font-bold ${
                ok ? 'text-white' : isNext ? 'text-primary border border-primary/50' : 'text-muted border border-border'
              }`} style={ok ? { background: GRAD } : undefined}>
                {ok ? <Check size={12} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-[.88rem] ${ok ? 'text-muted line-through' : 'font-medium'}`}>{s.title}</span>
                {isNext && <span className="block text-[.78rem] text-muted mt-0.5 leading-relaxed">{s.hint}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {next.href(firstProjectId) !== '#' && (
        <Link href={next.href(firstProjectId)}
          className="inline-flex items-center gap-1.5 mt-5 text-white text-[.85rem] font-semibold px-4 py-2 rounded-xs" style={{ background: GRAD }}>
          {next.cta} <ArrowRight size={14} />
        </Link>
      )}
    </section>
  );
}
