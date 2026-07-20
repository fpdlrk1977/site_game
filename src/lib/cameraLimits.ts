// 둘러보기(explore) 카메라의 OrbitControls 제한값.
//
// 설정 UI는 없다 — 2026-07-20에 exploreCamera 패널을 제거했다(startView와 역할 중복 + 보이지 않는 숫자 조절).
// 여기 남은 것은 **고정 기본값 + 시작 뷰 보호** 뿐이다.
//
// ── 각도 규약(헷갈리기 쉬움) ───────────────────────────────────────────
//   polar angle은 **수직(머리 위) 기준**이다. 0° = 바로 위(탑다운), 90° = 눈높이(지평선).
//
// ── 왜 startView 보호가 필요한가 ──────────────────────────────────────
//   OrbitControls.update()는 카메라를 제한값으로 clamp한다. 저장된 시작 뷰가 기본 제한 밖이면
//   (예: 200m보다 멀리서 저장, 피사체보다 아래에서 저장) 방문자가 엉뚱한 위치에서 시작한다.
//   → 제한을 시작 뷰가 들어가도록 넓혀서 "저장한 뷰는 저장한 대로 보인다"를 보장한다.
import type { EnvSchema, Vector3 } from '@/types/scene';

export const MIN_POLAR = 0.1;                        // OrbitControls minPolarAngle
export const DEFAULT_MAX_POLAR = Math.PI / 2 - 0.02; // 지평선 살짝 위(뒤집힘 방지)
export const DEFAULT_MIN_DISTANCE = 1;
export const DEFAULT_MAX_DISTANCE = 200;

export interface LimitSet {
  maxPolar: number;    // rad
  minDistance: number; // m
  maxDistance: number; // m
}

export interface CameraLimitsResult {
  /** 뷰어 OrbitControls에 실제로 넣는 값. */
  effective: LimitSet;
  /** startView가 있으면 그 극좌표(테스트/디버깅용). 없으면 null. */
  startView: { polar: number; distance: number } | null;
  /** startView 때문에 기본 제한보다 넓어졌는가. */
  widened: boolean;
}

function polarOf(position: Vector3, target: Vector3) {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const r = Math.hypot(dx, dy, dz);
  if (r < 1e-6) return null;
  // acos(y/r): 0 = 바로 위, π/2 = 지평선
  return { polar: Math.acos(Math.min(1, Math.max(-1, dy / r))), distance: r };
}

export function cameraLimits(env: EnvSchema): CameraLimitsResult {
  const base: LimitSet = {
    maxPolar: DEFAULT_MAX_POLAR,
    minDistance: DEFAULT_MIN_DISTANCE,
    maxDistance: DEFAULT_MAX_DISTANCE,
  };

  const sv = env.startView ? polarOf(env.startView.position, env.startView.target) : null;
  if (!sv) return { effective: base, startView: null, widened: false };

  const effective: LimitSet = {
    // 시작 뷰 각도까지는 허용(여유 0.05rad). 단 지평선 아래로는 열지 않는다(카메라 뒤집힘 방지).
    maxPolar: Math.min(Math.max(base.maxPolar, sv.polar + 0.05), DEFAULT_MAX_POLAR),
    minDistance: Math.min(base.minDistance, sv.distance),
    maxDistance: Math.max(base.maxDistance, sv.distance),
  };
  const widened =
    effective.maxPolar > base.maxPolar + 1e-6 ||
    effective.minDistance < base.minDistance - 1e-6 ||
    effective.maxDistance > base.maxDistance + 1e-6;

  return { effective, startView: sv, widened };
}
