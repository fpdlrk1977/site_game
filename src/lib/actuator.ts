import * as THREE from 'three';
import type { ActuatorConfig } from '@/types/scene';

// 관절(액추에이터) 런타임 수학 — doc/PIVOT_MANIPULATION.md §6.
//   경첩(hinge) 기준으로 한 축을 min~max 범위에서 구동. 시각(ViewerObject)과 플레이 콜라이더가 공유.
//   경첩 고정은 computeMotion의 피벗 보정과 동일한 쿼터니언 방식(회전 전후 경첩 월드위치 일치 → 원점 보정).

const DEG2RAD = Math.PI / 180;
const _baseQuat = new THREE.Quaternion();
const _axisQuat = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _euler = new THREE.Euler();
const _hs = new THREE.Vector3(); // 경첩 스케일드 로컬 오프셋
const _hb = new THREE.Vector3(); // 경첩 월드(회전 전) / slide 방향
const _ha = new THREE.Vector3(); // 경첩 월드(회전 후)

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── variable/event 구동 이징 ─────────────────────────────────────────────
// 목표(0..1)를 향해 프레임마다 접근. 시각(ViewerObject)과 콜라이더(ActuatorCollider)가
// 동일 로직을 공유해야 "콜라이더 동반" 시 눈에 보이는 문과 부딪히는 문이 어긋나지 않는다.
export interface DriveEaseState {
  cur: number | null; // 현재 구동값(0..1), null=미초기화
  start: number;      // ease='inout' 트윈 시작값
  prog: number;       // ease='inout' 트윈 진행(0..1)
  prevTarget: number | null; // ease='inout' 재타겟 감지
}
export function makeDriveState(): DriveEaseState {
  return { cur: null, start: 0, prog: 1, prevTarget: null };
}
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** 이징 상태 st를 목표 target(0..1)을 향해 dt만큼 전진시키고 새 구동값을 반환. 첫 프레임은 스냅. */
export function easeDrive(
  st: DriveEaseState,
  target: number,
  ease: ActuatorConfig['ease'],
  speed: number,
  dt: number,
): number {
  const t = clamp01(target);
  const d = Math.min(dt, 0.05); // 프레임 스파이크 방지
  if (st.cur === null) { st.cur = t; st.prevTarget = t; return t; }
  const e = ease ?? 'smooth';
  if (e === 'linear') {
    const delta = t - st.cur;
    st.cur += Math.sign(delta) * Math.min(Math.abs(delta), speed * d); // 등속(초당 speed)
  } else if (e === 'inout') {
    if (st.prevTarget === null || Math.abs(t - st.prevTarget) > 1e-4) { st.start = st.cur; st.prog = 0; st.prevTarget = t; }
    st.prog = Math.min(1, st.prog + speed * d);
    st.cur = st.start + (t - st.start) * easeInOut(st.prog);
  } else {
    st.cur += (t - st.cur) * (1 - Math.pow(0.0001, d * speed * 3)); // smooth(기본, 지수 감쇠)
  }
  return st.cur;
}

/** 구동값(0..1) 산출 — manual/oscillate는 여기서, variable/event(5b)는 호출부가 override. */
export function computeDriveValue(act: ActuatorConfig, t: number): number {
  if (act.drive === 'oscillate') {
    const spd = act.speed ?? 1;
    if (act.loop === 'forward') return (((t * spd * 0.2) % 1) + 1) % 1; // 0→1 반복
    return (Math.sin(t * spd) + 1) / 2; // pingpong(기본)
  }
  return clamp01(act.value ?? 0); // manual/variable/event 기본
}

/**
 * 베이스 변환(pos/rot(라디안)/scl)에 관절 델타를 적용해 out에 쓴다.
 * hingeLocal = 경첩의 지오메트리-로컬 점(anchorLocalPoint 결과, 스케일 전). null이면 원점 기준.
 * driveValue = 0..1 (min→max).
 */
export function computeActuator(
  act: ActuatorConfig,
  hingeLocal: THREE.Vector3 | null,
  basePos: [number, number, number],
  baseRot: [number, number, number], // radians
  baseScl: [number, number, number],
  driveValue: number,
  out: { pos: THREE.Vector3; quat: THREE.Quaternion; scl: THREE.Vector3 },
): void {
  const dv = clamp01(driveValue);
  _euler.set(baseRot[0], baseRot[1], baseRot[2], 'XYZ');
  _baseQuat.setFromEuler(_euler);
  out.scl.set(baseScl[0], baseScl[1], baseScl[2]);
  out.pos.set(basePos[0], basePos[1], basePos[2]);
  _axis.set(act.axis === 'x' ? 1 : 0, act.axis === 'y' ? 1 : 0, act.axis === 'z' ? 1 : 0);

  if (act.kind === 'slide') {
    const d = lerp(act.min, act.max, dv);
    _hb.copy(_axis).applyQuaternion(_baseQuat).multiplyScalar(d); // 오브젝트 회전 반영한 이동
    out.pos.add(_hb);
    out.quat.copy(_baseQuat);
    return;
  }

  // rotate — 로컬 축 기준 회전(post-multiply → 눕히거나 기운 물체도 축 기준으로 깔끔히)
  const angle = lerp(act.min, act.max, dv) * DEG2RAD;
  _axisQuat.setFromAxisAngle(_axis, angle);
  out.quat.copy(_baseQuat).multiply(_axisQuat);

  // 경첩 고정 — 경첩 월드오프셋이 회전 전후 같도록 원점 보정.
  if (hingeLocal) {
    _hs.set(hingeLocal.x * baseScl[0], hingeLocal.y * baseScl[1], hingeLocal.z * baseScl[2]);
    _hb.copy(_hs).applyQuaternion(_baseQuat); // 회전 전 경첩 위치
    _ha.copy(_hs).applyQuaternion(out.quat);  // 회전 후 경첩 위치
    out.pos.add(_hb).sub(_ha);
  }
}
