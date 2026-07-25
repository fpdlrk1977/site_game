'use client';

import { useEffect, useState } from 'react';
import { X, Check, Minus, Clock } from 'lucide-react';
import { usePricingModal } from '@/store/pricingModalStore';
import { useUserStore } from '@/store/userStore';
import { TIERS, TIER_META, FEATURE_ROWS, gateValue } from '@/app/pricing/pricingData';
import type { PlanTier } from '@/store/userStore';

const GRAD = 'linear-gradient(120deg,#6a4dff,#39d0ea)';

/**
 * 업그레이드 클릭 시 뜨는 요금제 비교 모달(레퍼런스 pricing.png 레이아웃 어댑트).
 * 3열(Free/Pro/Business) · 연/월 토글 · Popular 강조 · 기능 그룹 · 반투명 오버레이 · X 닫기.
 * 결제 연동은 준비 중이라 Upgrade 클릭 시 인라인 안내.
 */
export function PricingModal() {
  const open = usePricingModal((s) => s.open);
  const hide = usePricingModal((s) => s.hide);
  const currentTier = useUserStore((s) => s.userId ? s.planTier : null);
  const [yearly, setYearly] = useState(true);
  const [notice, setNotice] = useState<PlanTier | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  useEffect(() => { if (!open) setNotice(null); }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm" onClick={hide}>
      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-surface border border-border rounded-xs shadow-modal p-7 sm:p-8" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-4 mb-7">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Upgrade your plan</h2>
            <p className="text-muted text-sm mt-1">Unlock more projects and features.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex bg-background border border-border rounded-xs p-1 gap-0.5">
              {([['Yearly', true], ['Monthly', false]] as const).map(([label, y]) => (
                <button key={label} onClick={() => setYearly(y)}
                  className={`text-[.82rem] font-semibold px-3 py-1.5 rounded-xs transition-colors ${yearly === y ? 'text-white' : 'text-muted hover:text-foreground'}`}
                  style={yearly === y ? { background: GRAD } : {}}>
                  {label}{y && <span className="ml-1.5 text-[.62rem] px-1.5 py-0.5 rounded-xs font-bold" style={{ background: 'rgba(74,222,128,.16)', color: '#16a34a' }}>-20%</span>}
                </button>
              ))}
            </div>
            <button onClick={hide} className="w-8 h-8 rounded-xs grid place-items-center text-muted hover:text-foreground hover:bg-foreground/[0.05] transition-colors" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        {/* 3열 카드 */}
        <div className="grid md:grid-cols-3 gap-4 items-start">
          {TIERS.map((tier) => {
            const meta = TIER_META[tier];
            const isCurrent = currentTier === tier;
            const highlight = !!meta.recommended;
            const amount = tier === 'pro' ? (yearly ? meta.priceYearly : meta.priceMonthly) ?? meta.price : meta.price;
            const billed = tier === 'pro' ? (yearly ? meta.billedYearly : meta.billedMonthly) : meta.priceNote;

            return (
              <div key={tier} className={`relative flex flex-col rounded-xs border p-6 ${highlight ? 'border-transparent' : 'border-border'}`}
                style={highlight ? { boxShadow: '0 0 0 1.5px #6a4dff' } : {}}>
                {highlight && <span className="absolute -top-2.5 left-5 text-white text-[.66rem] font-bold px-2.5 py-1 rounded-xs" style={{ background: GRAD }}>Popular</span>}

                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{meta.name}</h3>
                  {isCurrent && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-xs bg-foreground/[0.06] text-muted">Current</span>}
                </div>
                <p className="text-muted text-xs mt-1">{meta.tagline}</p>

                <div className="mt-4">
                  <div className="text-[2rem] font-bold tracking-tight leading-none">{amount}{tier === 'pro' && <span className="text-[.85rem] text-muted font-medium"> /mo</span>}</div>
                  <p className="text-[.76rem] text-muted mt-2 min-h-[1.1em]">{billed}</p>
                </div>

                {/* CTA */}
                {isCurrent ? (
                  <button disabled className="w-full mt-5 mb-5 py-2.5 rounded-xs text-sm font-semibold border border-border text-muted cursor-default">Current plan</button>
                ) : tier === 'free' ? (
                  <button onClick={hide} className="w-full mt-5 mb-5 py-2.5 rounded-xs text-sm font-semibold border border-border hover:bg-foreground/[0.04] transition-colors">{meta.cta}</button>
                ) : (
                  <button onClick={() => setNotice(tier)} className="w-full mt-5 mb-5 py-2.5 rounded-xs text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: highlight ? GRAD : 'var(--primary)' }}>{meta.cta}</button>
                )}

                <div className="text-[.7rem] uppercase tracking-wider text-muted font-bold mb-2.5">{meta.includesNote}</div>
                <ul className="space-y-2 mt-auto">
                  {FEATURE_ROWS.map((row) => {
                    const val = gateValue(row, tier);
                    const isBool = typeof val === 'boolean';
                    const muted = isBool && !val;
                    return (
                      <li key={row.key} className={`flex items-center gap-2 text-[.82rem] ${muted ? 'text-muted/45' : 'text-foreground/85'}`}>
                        {isBool ? (val ? <Check size={14} className="text-[#16a34a] shrink-0" strokeWidth={2.4} /> : <Minus size={14} className="text-muted/40 shrink-0" />)
                          : <Check size={14} className="text-[#16a34a] shrink-0" strokeWidth={2.4} />}
                        <span>{row.label}{!isBool && <span className="text-muted"> · {val as string}</span>}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

        {/* 결제 준비 중 인라인 안내 */}
        {notice && (
          <div className="mt-6 flex items-center gap-3 p-4 rounded-xs border border-border bg-background">
            <span className="w-9 h-9 rounded-xs grid place-items-center text-primary shrink-0" style={{ background: 'rgba(124,108,255,.1)' }}><Clock size={18} /></span>
            <div className="text-sm">
              <b>{TIER_META[notice].name} billing is coming soon.</b>
              <span className="text-muted"> We&apos;re putting the finishing touches on checkout.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
