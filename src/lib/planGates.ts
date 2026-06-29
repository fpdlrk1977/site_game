import type { PlanTier } from '@/store/userStore';

/**
 * 플랜별 기능 제한의 단일 정의.
 * 여기만 수정하면 UI(usePlan/PlanGate)와 서버(checkPlan) 동시 반영.
 */
export const PLAN_GATES = {
  // 프로젝트 수 상한
  maxProjects: {
    free: 3,
    pro: 20,
    business: Infinity,
  },

  // 씬당 오브젝트 수 상한
  maxObjectsPerScene: {
    free: 30,
    pro: 200,
    business: Infinity,
  },

  // 에셋 스토리지 (MB)
  maxStorageMb: {
    free: 100,
    pro: 2048,
    business: Infinity,
  },

  // 기능 플래그
  customDomain: {
    free: false,
    pro: true,
    business: true,
  },

  hideBadge: {
    free: false,
    pro: true,
    business: true,
  },

  analytics: {
    free: false,
    pro: true,
    business: true,
  },

  embedMode: {
    free: false,
    pro: true,
    business: true,
  },

  sceneVersionHistory: {
    free: false,
    pro: true,
    business: true,
  },

  multiScene: {
    free: false,
    pro: true,
    business: true,
  },
} as const;

export type GateKey = keyof typeof PLAN_GATES;
export type NumericGateKey = {
  [K in GateKey]: (typeof PLAN_GATES)[K][PlanTier] extends number ? K : never;
}[GateKey];
export type BoolGateKey = {
  [K in GateKey]: (typeof PLAN_GATES)[K][PlanTier] extends boolean ? K : never;
}[GateKey];

export function getLimit(key: NumericGateKey, tier: PlanTier): number {
  return PLAN_GATES[key][tier] as number;
}

export function getFeature(key: BoolGateKey, tier: PlanTier): boolean {
  return PLAN_GATES[key][tier] as boolean;
}
