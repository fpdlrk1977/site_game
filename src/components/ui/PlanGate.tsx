"use client";

import { usePlan } from "@/hooks/usePlan";
import type { BoolGateKey, NumericGateKey } from "@/lib/planGates";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

const PLAN_COLORS: Record<string, string> = {
  pro: "from-violet-600 to-cyan-600",
  business: "from-amber-500 to-orange-600",
};

interface FeatureGateProps {
  feature: BoolGateKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requiredPlan?: "pro" | "business";
}

/** 기능 플래그 기반 게이팅 */
export function PlanGate({ feature, children, fallback, requiredPlan = "pro" }: FeatureGateProps) {
  const { can } = usePlan();
  if (can(feature)) return <>{children}</>;
  return fallback ? <>{fallback}</> : <UpgradeBanner requiredPlan={requiredPlan} />;
}

interface CountGateProps {
  limitKey: NumericGateKey;
  count: number;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requiredPlan?: "pro" | "business";
}

/** 수량 초과 기반 게이팅 */
export function CountGate({ limitKey, count, children, fallback, requiredPlan = "pro" }: CountGateProps) {
  const { isOverLimit } = usePlan();
  if (!isOverLimit(limitKey, count)) return <>{children}</>;
  return fallback ? <>{fallback}</> : <UpgradeBanner requiredPlan={requiredPlan} />;
}

interface UpgradeBannerProps {
  requiredPlan?: "pro" | "business";
  compact?: boolean;
}

export function UpgradeBanner({ requiredPlan = "pro", compact = false }: UpgradeBannerProps) {
  const gradientClass = PLAN_COLORS[requiredPlan] ?? PLAN_COLORS.pro;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r ${gradientClass} text-white`}
      >
        {PLAN_LABELS[requiredPlan]}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-xs border border-border bg-surface/50 text-center">
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r ${gradientClass} text-white`}>
        {PLAN_LABELS[requiredPlan]} 플랜 필요
      </span>
      <p className="text-xs text-muted leading-relaxed">이 기능은 {PLAN_LABELS[requiredPlan]} 이상 플랜에서 사용할 수 있습니다.</p>
      <a
        href="/pricing"
        className={`text-xs font-semibold px-3 py-1.5 rounded-xs bg-gradient-to-r ${gradientClass} text-white hover:opacity-90 transition-opacity`}
      >
        업그레이드 →
      </a>
    </div>
  );
}
