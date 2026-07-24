'use client';

import { useState } from 'react';
import { Check, Minus } from 'lucide-react';
import type { PlanTier } from '@/store/userStore';
import { TIERS, TIER_META, FEATURE_ROWS, gateValue } from './pricingData';
import { UpgradeNotice } from './UpgradeNotice';

/** ✓ / — 표시 (bool 값) */
function BoolMark({ on }: { on: boolean }) {
  return on ? (
    <Check size={16} className="text-primary mx-auto" strokeWidth={2.2} />
  ) : (
    <Minus size={16} className="text-muted/40 mx-auto" />
  );
}

export function PricingCards({
  currentTier,
  loggedIn,
}: {
  currentTier: PlanTier | null;
  loggedIn: boolean;
}) {
  const [upgradeTier, setUpgradeTier] = useState<PlanTier | null>(null);

  return (
    <>
      {/* 가격 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {TIERS.map((tier) => {
          const meta = TIER_META[tier];
          const isCurrent = currentTier === tier;
          const highlight = !!meta.recommended;

          return (
            <div
              key={tier}
              className={`relative flex flex-col rounded-2xl border bg-surface p-6 ${
                highlight
                  ? 'border-transparent ring-2 ring-primary shadow-modal md:-translate-y-2'
                  : 'border-border'
              }`}
            >
              {highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-violet-500/25">
                  추천
                </span>
              )}

              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-foreground">{meta.name}</h3>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-foreground/[0.06] text-muted">
                      현재 플랜
                    </span>
                  )}
                </div>
                <p className="text-muted text-xs">{meta.tagline}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-foreground tracking-tight">
                    {meta.price}
                  </span>
                </div>
                <p className="text-muted text-xs mt-1">{meta.priceNote}</p>
              </div>

              {/* CTA */}
              {isCurrent ? (
                <button
                  disabled
                  className="w-full py-2.5 rounded-xs text-sm font-semibold border border-border text-muted cursor-default mb-6"
                >
                  현재 이용 중
                </button>
              ) : tier === 'free' ? (
                <a
                  href={loggedIn ? '/dashboard' : '/signup'}
                  className="block text-center w-full py-2.5 rounded-xs text-sm font-semibold border border-border text-foreground hover:bg-foreground/[0.04] transition-colors mb-6"
                >
                  {meta.cta}
                </a>
              ) : (
                <button
                  onClick={() => setUpgradeTier(tier)}
                  className={`w-full py-2.5 rounded-xs text-sm font-semibold text-white transition-all mb-6 bg-gradient-to-r ${
                    meta.gradient
                  } hover:opacity-90`}
                >
                  {meta.cta}
                </button>
              )}

              {/* 기능 목록 */}
              <ul className="space-y-2.5 mt-auto">
                {FEATURE_ROWS.map((row) => {
                  const val = gateValue(row, tier);
                  const isBool = typeof val === 'boolean';
                  const muted = isBool && !val;
                  return (
                    <li
                      key={row.key}
                      className={`flex items-center gap-2 text-sm ${
                        muted ? 'text-muted/50' : 'text-foreground'
                      }`}
                    >
                      {isBool ? (
                        val ? (
                          <Check size={15} className="text-primary shrink-0" strokeWidth={2.2} />
                        ) : (
                          <Minus size={15} className="text-muted/40 shrink-0" />
                        )
                      ) : (
                        <Check size={15} className="text-primary shrink-0" strokeWidth={2.2} />
                      )}
                      <span>
                        {row.label}
                        {!isBool && (
                          <span className="text-muted"> · {val as string}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* 기능 비교표 */}
      <div className="max-w-5xl mx-auto mt-16">
        <h2 className="text-center text-lg font-bold text-foreground mb-6">기능 자세히 비교</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-border bg-foreground/[0.02]">
                <th className="text-left font-medium text-muted px-5 py-3.5 w-[34%]">기능</th>
                {TIERS.map((tier) => (
                  <th key={tier} className="font-semibold text-foreground px-4 py-3.5">
                    {TIER_META[tier].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <td className="text-left text-foreground/80 px-5 py-3">{row.label}</td>
                  {TIERS.map((tier) => {
                    const val = gateValue(row, tier);
                    return (
                      <td key={tier} className="text-center px-4 py-3">
                        {typeof val === 'boolean' ? (
                          <BoolMark on={val} />
                        ) : (
                          <span className="text-foreground/90">{val}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {upgradeTier && (
        <UpgradeNotice tier={upgradeTier} onClose={() => setUpgradeTier(null)} />
      )}
    </>
  );
}
