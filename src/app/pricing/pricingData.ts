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
}

export const TIER_META: Record<PlanTier, TierMeta> = {
  free: {
    name: 'Free',
    tagline: '개인 프로젝트로 시작하기',
    price: '₩0',
    priceNote: '평생 무료',
    cta: '무료로 시작',
    gradient: null,
  },
  pro: {
    name: 'Pro',
    tagline: '창작자 · 프리랜서를 위한',
    price: '₩9,900',
    priceNote: '월 (가격 미확정)',
    cta: 'Pro 시작하기',
    gradient: 'from-violet-600 to-cyan-600',
    recommended: true,
  },
  business: {
    name: 'Business',
    tagline: '팀 · 비즈니스를 위한',
    price: '문의',
    priceNote: '맞춤 견적',
    cta: '문의하기',
    gradient: 'from-amber-500 to-orange-600',
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
  { label: '프로젝트 수', kind: 'num', key: 'maxProjects' },
  { label: '씬당 오브젝트', kind: 'num', key: 'maxObjectsPerScene' },
  { label: '에셋 스토리지', kind: 'storage', key: 'maxStorageMb' },
  { label: '다중 씬', kind: 'bool', key: 'multiScene' },
  { label: '커스텀 도메인', kind: 'bool', key: 'customDomain' },
  { label: '임베드', kind: 'bool', key: 'embedMode' },
  { label: '방문 통계', kind: 'bool', key: 'analytics' },
  { label: '버전 기록', kind: 'bool', key: 'sceneVersionHistory' },
  { label: '워터마크 제거', kind: 'bool', key: 'hideBadge' },
];

const fmtNum = (v: number) => (v === Infinity ? '무제한' : `${v.toLocaleString()}개`);
const fmtStorage = (v: number) =>
  v === Infinity ? '무제한' : v >= 1024 ? `${v / 1024}GB` : `${v}MB`;

/** 한 행·한 tier의 표시값. bool이면 boolean, 그 외엔 문자열. */
export function gateValue(row: FeatureRow, tier: PlanTier): string | boolean {
  const raw = PLAN_GATES[row.key][tier];
  if (row.kind === 'bool') return raw as boolean;
  if (row.kind === 'storage') return fmtStorage(raw as number);
  return fmtNum(raw as number);
}
