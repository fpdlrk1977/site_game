'use client';

import { useUserStore } from '@/store/userStore';
import { getLimit, getFeature, type NumericGateKey, type BoolGateKey } from '@/lib/planGates';

export function usePlan() {
  const planTier = useUserStore((s) => s.planTier);

  return {
    tier: planTier,
    /** 수량 제한 반환 */
    limit: (key: NumericGateKey) => getLimit(key, planTier),
    /** 기능 활성화 여부 */
    can: (key: BoolGateKey) => getFeature(key, planTier),
    /** 수량 제한 초과 여부 */
    isOverLimit: (key: NumericGateKey, count: number) => count >= getLimit(key, planTier),
  };
}
