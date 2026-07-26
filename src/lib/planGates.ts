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

  // ※ 'maxObjectsPerScene'(Free 30/Pro 200)은 2026-07-26에 제거했다.
  //    선언만 돼 있고 **어디서도 강제되지 않으면서 요금제 페이지에는 광고**되고 있었다
  //    (게다가 카페 템플릿이 34개라 Free는 첫 템플릿부터 초과). 오브젝트 수는 서버 비용이
  //    거의 안 드는 항목(씬 JSON 수 KB · 렌더는 방문자 GPU)이라 과금 축으로도 부적절해
  //    되살리지 않기로 함. 남용 방지가 필요해지면 그때 '강제 로직과 함께' 다시 넣을 것.

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
