'use client';

import { useState } from 'react';
import { Check, Minus } from 'lucide-react';
import type { PlanTier } from '@/store/userStore';
import { TIERS, TIER_META, FEATURE_ROWS, gateValue } from './pricingData';
import { UpgradeNotice } from './UpgradeNotice';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

function BoolMark({ on }: { on: boolean }) {
  return on
    ? <Check size={16} className="text-[#4ade80] mx-auto" strokeWidth={2.2} />
    : <Minus size={16} className="text-muted/40 mx-auto" />;
}

/** showComparison=false면 비교표를 숨긴다(랜딩 Pricing 섹션처럼 요약만 보여줄 때) */
export function PricingCards({ currentTier, loggedIn, showComparison = true }: { currentTier: PlanTier | null; loggedIn: boolean; showComparison?: boolean }) {
  const [upgradeTier, setUpgradeTier] = useState<PlanTier | null>(null);
  const [yearly, setYearly] = useState(true);

  return (
    <>
      {/* 연/월 토글 */}
      <div className="flex justify-center mb-9">
        <div className="inline-flex bg-surface border border-border rounded-xs p-1 gap-0.5">
          {([['Yearly', true], ['Monthly', false]] as const).map(([label, y]) => (
            <button key={label} onClick={() => setYearly(y)}
              className={`text-sm font-semibold px-4 py-2 rounded-xs transition-colors ${yearly === y ? 'text-white' : 'text-muted hover:text-foreground'}`}
              style={yearly === y ? { background: GRAD } : {}}>
              {label}
              {y && <span className="ml-1.5 text-[.66rem] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(74,222,128,.16)', color: '#4ade80' }}>-20%</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 가격 카드 */}
      <div className="grid md:grid-cols-3 gap-[18px] max-w-5xl mx-auto items-start">
        {TIERS.map((tier) => {
          const meta = TIER_META[tier];
          const isCurrent = currentTier === tier;
          const highlight = !!meta.recommended;
          const amount = tier === 'pro' ? (yearly ? meta.priceYearly : meta.priceMonthly) ?? meta.price : meta.price;
          const billed = tier === 'pro' ? (yearly ? meta.billedYearly : meta.billedMonthly) : meta.priceNote;

          return (
            <div key={tier}
              className={`relative flex flex-col rounded-xs border bg-surface p-7 ${highlight ? 'border-transparent md:-translate-y-2' : 'border-border'}`}
              style={{ boxShadow: highlight ? '0 0 0 2px #6a4dff, var(--shadow-float)' : 'var(--shadow-card)' }}>
              {highlight && (
                <span className="absolute -top-3 left-6 text-white text-[.68rem] font-bold px-3 py-1 rounded-full" style={{ background: GRAD }}>Popular</span>
              )}

              <div className="flex items-center gap-2">
                <h3 className="text-[1.05rem] font-bold">{meta.name}</h3>
                {isCurrent && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-foreground/[0.06] text-muted">Current</span>}
              </div>
              <p className="text-muted text-xs mt-1">{meta.tagline}</p>

              <div className="mt-5">
                <div className="text-[2.3rem] font-bold tracking-tight leading-none">
                  {amount}{tier === 'pro' && <span className="text-[.9rem] text-muted font-medium"> /mo</span>}
                </div>
                <p className="text-[.78rem] text-muted mt-2 min-h-[1.2em]">{billed}</p>
              </div>

              {/* CTA */}
              {isCurrent ? (
                <button disabled className="w-full mt-5 mb-6 py-2.5 rounded-xs text-sm font-semibold border border-border text-muted cursor-default">Current plan</button>
              ) : tier === 'free' ? (
                <a href={loggedIn ? '/dashboard' : '/signup'} className="block text-center w-full mt-5 mb-6 py-2.5 rounded-xs text-sm font-semibold border border-border hover:bg-white/[0.04] transition-colors">{meta.cta}</a>
              ) : (
                <button onClick={() => setUpgradeTier(tier)} className="w-full mt-5 mb-6 py-2.5 rounded-xs text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: GRAD }}>{meta.cta}</button>
              )}

              {/* 기능 그룹 */}
              <div className="text-[.72rem] uppercase tracking-wider text-muted font-bold mb-3">{meta.includesNote}</div>
              <ul className="space-y-2.5 mt-auto">
                {FEATURE_ROWS.map((row) => {
                  const val = gateValue(row, tier);
                  const isBool = typeof val === 'boolean';
                  const muted = isBool && !val;
                  return (
                    <li key={row.key} className={`flex items-center gap-2 text-sm ${muted ? 'text-muted/45' : 'text-foreground/90'}`}>
                      {isBool ? (val ? <Check size={15} className="text-[#4ade80] shrink-0" strokeWidth={2.2} /> : <Minus size={15} className="text-muted/40 shrink-0" />)
                        : <Check size={15} className="text-[#4ade80] shrink-0" strokeWidth={2.2} />}
                      <span>{row.label}{!isBool && <span className="text-muted"> · {val as string}</span>}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* 비교표 */}
      {showComparison && (
      <div className="max-w-5xl mx-auto mt-16">
        <h2 className="text-center text-lg font-bold mb-6">Compare features</h2>
        <div className="overflow-x-auto rounded-xs border border-border">
          <table className="w-full text-sm border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-border bg-foreground/[0.02]">
                <th className="text-left font-medium text-muted px-5 py-3.5 w-[34%]">Feature</th>
                {TIERS.map((t) => <th key={t} className="font-semibold px-4 py-3.5">{TIER_META[t].name}</th>)}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <td className="text-left text-foreground/80 px-5 py-3">{row.label}</td>
                  {TIERS.map((t) => {
                    const val = gateValue(row, t);
                    return <td key={t} className="text-center px-4 py-3">{typeof val === 'boolean' ? <BoolMark on={val} /> : <span className="text-foreground/90">{val}</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {upgradeTier && <UpgradeNotice tier={upgradeTier} onClose={() => setUpgradeTier(null)} />}
    </>
  );
}
