import { createSupabaseServer } from './supabase-server';
import { getLimit, getFeature, type NumericGateKey, type BoolGateKey } from './planGates';
import type { PlanTier } from '@/store/userStore';

async function getUserTier(userId: string): Promise<PlanTier> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('users_plan')
    .select('plan_tier')
    .eq('user_id', userId)
    .single();
  return (data?.plan_tier as PlanTier) ?? 'free';
}

/** 서버에서 수량 제한 초과 여부 확인. 초과 시 Error throw. */
export async function assertCountLimit(
  userId: string,
  key: NumericGateKey,
  currentCount: number,
): Promise<void> {
  const tier = await getUserTier(userId);
  const limit = getLimit(key, tier);
  if (currentCount >= limit) {
    throw new Error(`PLAN_LIMIT:${key}:${tier}`);
  }
}

/** 서버에서 기능 활성화 여부 확인. 비활성 시 Error throw. */
export async function assertFeatureEnabled(
  userId: string,
  key: BoolGateKey,
): Promise<void> {
  const tier = await getUserTier(userId);
  const enabled = getFeature(key, tier);
  if (!enabled) {
    throw new Error(`PLAN_FEATURE:${key}:${tier}`);
  }
}
