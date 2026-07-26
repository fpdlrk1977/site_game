'use client';

import { BarChart3, Check } from 'lucide-react';
import { usePricingModal } from '@/store/pricingModalStore';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

const PERKS = [
  'Daily views and interaction trends',
  'Which spaces get visited most',
  'Which objects people actually click',
];

/** Free 플랜 안내 — 데이터는 이미 수집되고 있으므로 "잠겨 있다"가 아니라 "쌓이는 중"으로 말한다. */
export function UpgradeCta() {
  const showPricing = usePricingModal((s) => s.show);
  return (
    <div className="bg-surface border border-border rounded-xs p-10 text-center max-w-[560px] mx-auto mt-6">
      <span className="inline-flex w-12 h-12 rounded-xs items-center justify-center text-white mb-5" style={{ background: GRAD }}>
        <BarChart3 size={22} />
      </span>
      <h2 className="text-lg font-semibold">Analytics is a Pro feature</h2>
      <p className="text-sm text-muted mt-2 leading-relaxed">
        Your visits are already being recorded — upgrade to see them.
      </p>
      <ul className="text-left text-[.85rem] mt-6 space-y-2.5 inline-block">
        {PERKS.map((p) => (
          <li key={p} className="flex items-start gap-2.5">
            <Check size={15} className="text-primary shrink-0 mt-0.5" /> {p}
          </li>
        ))}
      </ul>
      <button onClick={showPricing}
        className="block w-full mt-8 text-white text-[.9rem] font-semibold py-2.5 rounded-xs" style={{ background: GRAD }}>
        See plans
      </button>
    </div>
  );
}
