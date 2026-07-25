'use client';

import { useEffect } from 'react';
import { X, Clock } from 'lucide-react';
import type { PlanTier } from '@/store/userStore';
import { TIER_META } from './pricingData';

/**
 * 업그레이드 안내 모달 (UI만).
 * 실제 결제 연동은 추후 — 여기서는 결제정보를 받지 않고 "준비 중"만 안내한다.
 */
export function UpgradeNotice({
  tier,
  onClose,
}: {
  tier: PlanTier;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = TIER_META[tier];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-surface border border-border rounded-xs p-7 shadow-modal text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/12 text-primary mb-4">
          <Clock size={26} />
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-1.5">
          {meta.name} is coming soon
        </h3>
        <p className="text-muted text-sm leading-relaxed mb-6">
          Billing isn’t available just yet.
          <br />
          We’re putting the finishing touches on checkout.
        </p>

        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white font-semibold py-2.5 rounded-xs transition-all"
        >
          OK
        </button>
      </div>
    </div>
  );
}
