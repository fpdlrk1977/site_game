import { PLAN_GATES } from '@/lib/planGates';
import type { PlanTier } from '@/store/userStore';

/**
 * 가격표 표시 데이터.
 * 기능/한도 값은 전부 PLAN_GATES(단일 소스)에서 파생한다 — 게이트를 바꾸면 가격표도 자동 일치.
 * 가격(₩)은 아직 미확정 플레이스홀더. 확정되면 TIER_META.price/priceNote만 수정하면 된다.
 */

export const TIERS: PlanTier[] = ['free', 'pro', 'business'];

export interface TierMeta {
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  cta: string;
  /** 강조 그라데이션 (null=강조 없음) */
  gradient: string | null;
  recommended?: boolean;
  /** 월간/연간 표시 가격(연간은 "월 환산"). null이면 단일 표기(price 사용). */
  priceMonthly?: string;
  priceYearly?: string;
  billedMonthly?: string;
  billedYearly?: string;
  /** 카드 기능 목록 그룹 제목("Free의 모든 기능 +" 등) */
  includesNote?: string;
}

export const TIER_META: Record<PlanTier, TierMeta> = {
  free: {
    name: 'Free',
    tagline: 'For personal projects',
    price: '$0',
    priceNote: 'Free forever',
    cta: 'Get started',
    gradient: null,
    includesNote: 'Includes',
  },
  pro: {
    name: 'Pro',
    tagline: 'For creators & freelancers',
    price: '$12',
    priceNote: 'per month',
    priceMonthly: '$12',
    priceYearly: '$9.60',
    billedMonthly: 'Billed monthly',
    billedYearly: 'Billed $115/year · Save 20%',
    cta: 'Upgrade to Pro',
    gradient: 'from-violet-600 to-cyan-600',
    recommended: true,
    includesNote: 'Everything in Free, plus',
  },
  business: {
    name: 'Business',
    tagline: 'For teams & businesses',
    price: 'Custom',
    priceNote: 'Tailored quote',
    cta: 'Contact sales',
    gradient: 'from-amber-500 to-orange-600',
    includesNote: 'Everything in Pro, plus',
  },
};

type Kind = 'num' | 'storage' | 'bool';

export interface FeatureRow {
  label: string;
  kind: Kind;
  key: keyof typeof PLAN_GATES;
}

/** 가격 카드 · 비교표에 노출할 기능 행 (위→아래 순서대로 렌더) */
export const FEATURE_ROWS: FeatureRow[] = [
  { label: 'Projects', kind: 'num', key: 'maxProjects' },
  { label: 'Objects per scene', kind: 'num', key: 'maxObjectsPerScene' },
  { label: 'Asset storage', kind: 'storage', key: 'maxStorageMb' },
  { label: 'Multi-scene', kind: 'bool', key: 'multiScene' },
  { label: 'Custom domain', kind: 'bool', key: 'customDomain' },
  { label: 'Embed', kind: 'bool', key: 'embedMode' },
  { label: 'Analytics', kind: 'bool', key: 'analytics' },
  { label: 'Version history', kind: 'bool', key: 'sceneVersionHistory' },
  { label: 'Remove watermark', kind: 'bool', key: 'hideBadge' },
];

const fmtNum = (v: number) => (v === Infinity ? 'Unlimited' : `${v.toLocaleString()}`);
const fmtStorage = (v: number) =>
  v === Infinity ? 'Unlimited' : v >= 1024 ? `${v / 1024}GB` : `${v}MB`;

/** 한 행·한 tier의 표시값. bool이면 boolean, 그 외엔 문자열. */
export function gateValue(row: FeatureRow, tier: PlanTier): string | boolean {
  const raw = PLAN_GATES[row.key][tier];
  if (row.kind === 'bool') return raw as boolean;
  if (row.kind === 'storage') return fmtStorage(raw as number);
  return fmtNum(raw as number);
}
