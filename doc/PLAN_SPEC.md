# PLAN_SPEC: 플랜 게이팅 시스템 명세

AI가 기능 제한 로직을 구현할 때 반드시 이 구조를 따라야 한다.
플랜 제한 조건을 컴포넌트나 API 안에 직접 하드코딩하는 것을 금지한다.

---

## 1. 플랜 정의

| 플랜 | 대상 | 핵심 제한 |
|---|---|---|
| `free` | 개인/체험 | 씬 1개, 커스텀 도메인 불가, 임베드 불가 |
| `pro` | 소상공인/개인 사업자 | 씬 10개, 커스텀 도메인 1개, 임베드 가능 |
| `business` | 기업/팀 | 모든 기능, 무제한 씬, Event Bridge 전체 |

---

## 2. 단일 게이트 정의 (`src/lib/planGates.ts`)

**이 파일이 모든 플랜 제한의 유일한 정의다.** 플랜 변경은 이 파일만 수정한다.

```typescript
export const PLAN_GATES = {
  // 수량 제한 (Infinity = 무제한)
  scene_count:        { free: 1,     pro: 10,    business: Infinity },
  asset_count:        { free: 10,    pro: 100,   business: Infinity },
  asset_size_mb:      { free: 10,    pro: 50,    business: 200      },
  object_count:       { free: 50,    pro: 500,   business: Infinity }, // 씬당 오브젝트 수
  scene_data_size_kb: { free: 512,   pro: 5120,  business: Infinity }, // 씬 JSON 최대 크기

  // 기능 on/off
  custom_domain:      { free: false, pro: true,  business: true  },
  embed_mode:         { free: false, pro: true,  business: true  },
  event_bridge:       { free: false, pro: false, business: true  },
  multi_scene:        { free: false, pro: true,  business: true  },
  hide_badge:         { free: false, pro: true,  business: true  }, // "Powered by Park3D" 배지 제거
  analytics:          { free: false, pro: true,  business: true  }, // 씬 뷰어 통계
  version_history:    { free: false, pro: true,  business: true  }, // 씬 버전 히스토리
  remove_branding:    { free: false, pro: false, business: true  }, // 화이트라벨 (Business 전용)
} as const;

export type PlanTier = 'free' | 'pro' | 'business';
export type GateKey = keyof typeof PLAN_GATES;

/** 특정 플랜에서 기능이 활성화되는지 여부 */
export function isFeatureEnabled(key: GateKey, tier: PlanTier): boolean {
  const val = PLAN_GATES[key][tier];
  return val !== false;
}

/** 특정 플랜의 수량 한도 반환 */
export function getPlanLimit(key: GateKey, tier: PlanTier): number {
  const val = PLAN_GATES[key][tier];
  return typeof val === 'number' ? val : 0;
}
```

---

## 3. 소비 계층 — 역할별 파일 분리

```
lib/planGates.ts          ← 정의 (규칙만 존재)
lib/checkPlan.ts          ← 서버 사이드 검증 (API Route 전용)
hooks/usePlan.ts          ← 클라이언트 사이드 (React 훅)
components/ui/PlanGate.tsx ← UI 래퍼 컴포넌트 (JSX)
```

---

## 4. 서버 사이드 검증 (`src/lib/checkPlan.ts`)

API Route에서 호출. 프론트엔드 우회 시에도 서버에서 이중 차단한다.

```typescript
import { getPlanLimit, isFeatureEnabled, GateKey, PlanTier } from './planGates';
import { createClient } from '@supabase/supabase-js';

export class PlanLimitError extends Error {
  constructor(public key: GateKey, public tier: PlanTier) {
    super(`Plan limit exceeded: ${key} on ${tier}`);
  }
}

export async function getUserPlanTier(userId: string): Promise<PlanTier> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { data } = await supabase
    .from('users_plan')
    .select('plan_tier')
    .eq('user_id', userId)
    .single();
  return (data?.plan_tier as PlanTier) ?? 'free';
}

/** 수량 제한 검증 — 초과 시 PlanLimitError throw */
export async function assertCountLimit(userId: string, key: GateKey, currentCount: number) {
  const tier = await getUserPlanTier(userId);
  const limit = getPlanLimit(key, tier);
  if (currentCount >= limit) throw new PlanLimitError(key, tier);
}

/** 기능 활성화 검증 — 비활성 시 PlanLimitError throw */
export async function assertFeatureEnabled(userId: string, key: GateKey) {
  const tier = await getUserPlanTier(userId);
  if (!isFeatureEnabled(key, tier)) throw new PlanLimitError(key, tier);
}
```

**사용 예시 (API Route):**
```typescript
// POST /api/scenes (씬 생성)
const existingCount = await getSceneCount(projectId);
await assertCountLimit(userId, 'scene_count', existingCount); // 한도 초과 시 throw

// POST /api/projects (커스텀 도메인 설정)
await assertFeatureEnabled(userId, 'custom_domain'); // 비활성 플랜이면 throw
```

---

## 5. 클라이언트 훅 (`src/hooks/usePlan.ts`)

```typescript
import { PLAN_GATES, isFeatureEnabled, getPlanLimit, GateKey } from '@/lib/planGates';
import { useUserStore } from '@/store/userStore';

export function usePlan() {
  const tier = useUserStore((s) => s.planTier);

  return {
    tier,
    can: (key: GateKey) => isFeatureEnabled(key, tier),
    limit: (key: GateKey) => getPlanLimit(key, tier),
  };
}
```

**사용 예시 (컴포넌트):**
```typescript
const { can, limit } = usePlan();

// 기능 활성화 여부
if (!can('embed_mode')) return <UpgradeBanner requiredPlan="pro" />;

// 수량 제한
const isSceneLimitReached = scenes.length >= limit('scene_count');
<Button disabled={isSceneLimitReached}>+ 씬 추가</Button>
```

---

## 6. UI 게이트 컴포넌트 (`src/components/ui/PlanGate.tsx`)

```typescript
import { usePlan } from '@/hooks/usePlan';
import { GateKey, PlanTier } from '@/lib/planGates';
import { UpgradeBanner } from './UpgradeBanner';

interface PlanGateProps {
  feature: GateKey;
  fallback?: React.ReactNode;      // 기본값: <UpgradeBanner>
  children: React.ReactNode;
}

export function PlanGate({ feature, fallback, children }: PlanGateProps) {
  const { can } = usePlan();
  if (!can(feature)) return <>{fallback ?? <UpgradeBanner feature={feature} />}</>;
  return <>{children}</>;
}
```

**사용 예시 (JSX):**
```tsx
// 커스텀 도메인 설정 패널 — Pro 이상만 표시
<PlanGate feature="custom_domain">
  <DomainSettingsPanel />
</PlanGate>

// Event Bridge 패널 — Business 이상, 커스텀 fallback
<PlanGate feature="event_bridge" fallback={<p>Business 플랜에서 사용 가능합니다</p>}>
  <EventBridgeGuide />
</PlanGate>
```

---

## 7. DB 테이블 (`users_plan`)

```sql
CREATE TABLE users_plan (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier   TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'business')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: 본인만 조회 가능, 수정은 서비스 역할(Edge Function/결제 웹훅)만
ALTER TABLE users_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self_read" ON users_plan FOR SELECT USING (user_id = auth.uid());
```

> 플랜 변경(결제 완료)은 외부 결제 웹훅(Stripe 등)이 서비스 역할로 `UPDATE users_plan SET plan_tier = 'pro'` 처리.

---

## 8. userStore 추가 (`src/store/userStore.ts`)

```typescript
interface UserState {
  userId: string | null;
  planTier: PlanTier;   // 'free' | 'pro' | 'business'
}

interface UserActions {
  setUser: (userId: string, planTier: PlanTier) => void;
  clearUser: () => void;
}
```

로그인 완료 시 `users_plan` 테이블을 함께 조회하여 `planTier`를 스토어에 세팅한다.

---

## 9. 게이트 추가 절차

새 기능에 플랜 제한을 추가하는 방법:

1. `lib/planGates.ts`의 `PLAN_GATES`에 키와 플랜별 값 추가
2. 서버 측: 해당 API Route에서 `assertFeatureEnabled` 또는 `assertCountLimit` 호출
3. 클라이언트 측: `<PlanGate feature="...">` 또는 `usePlan().can(...)` 적용
4. 추가 파일 수정 없음

**새 제한 = `PLAN_GATES` 1줄 추가 + 호출 2곳**
